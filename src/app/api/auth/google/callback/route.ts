import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { db } from "@/lib/db";
import { createSession, hashPassword, logAudit } from "@/lib/auth";
import { accessFor, exchangeCodeForProfile, isAllowedGoogleProfile } from "@/lib/auth-google";

export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("g_state")?.value;
  const rawRedirect = cookieStore.get("g_redirect")?.value || "/";
  const redirectTarget = rawRedirect.startsWith("/") ? rawRedirect : "/";
  cookieStore.delete("g_state");
  cookieStore.delete("g_redirect");

  const fail = (err: string) => NextResponse.redirect(new URL(`/login?error=${err}`, origin));

  // CSRF: state must match the cookie set when the flow began.
  if (!code || !state || !expectedState || state !== expectedState) return fail("oauth");

  let profile;
  try {
    profile = await exchangeCodeForProfile(code);
  } catch {
    return fail("oauth");
  }
  if (!isAllowedGoogleProfile(profile)) return fail("domain");

  // Role and division come from the access list — never a hardcoded default.
  // Provisioning every Google user as admin would hand a divisional leader the
  // whole dashboard on first sign-in.
  const access = accessFor(profile.email);
  if (!access) return fail("domain");

  const user = await db.user.upsert({
    where: { email: profile.email },
    // Division is re-asserted on every login so moving someone between
    // divisions in the list takes effect without touching the database.
    update: { name: profile.name, lastLoginAt: new Date(), division: access.division ?? null },
    create: {
      email: profile.email,
      name: profile.name,
      role: access.role,
      division: access.division ?? null,
      passwordHash: await hashPassword(crypto.randomBytes(32).toString("hex")),
      totpEnabled: false,
    },
    select: { id: true, email: true, name: true, role: true, division: true, totpEnabled: true },
  });

  await createSession(user);
  await logAudit({ action: "login_google", userId: user.id, details: user.email });

  return NextResponse.redirect(new URL(redirectTarget, origin));
}
