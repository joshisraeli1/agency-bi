import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import crypto from "crypto";
import { db } from "@/lib/db";
import { createSession, hashPassword, logAudit } from "@/lib/auth";
import { exchangeCodeForProfile, isAllowedGoogleProfile } from "@/lib/auth-google";

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

  // Auto-provision new @swan.studio users as viewer; never change an existing
  // user's role (so admins stay admins).
  const user = await db.user.upsert({
    where: { email: profile.email },
    update: { name: profile.name, lastLoginAt: new Date() },
    create: {
      email: profile.email,
      name: profile.name,
      role: "viewer",
      passwordHash: await hashPassword(crypto.randomBytes(32).toString("hex")),
      totpEnabled: false,
    },
    select: { id: true, email: true, name: true, role: true, totpEnabled: true },
  });

  await createSession(user);
  await logAudit({ action: "login_google", userId: user.id, details: user.email });

  return NextResponse.redirect(new URL(redirectTarget, origin));
}
