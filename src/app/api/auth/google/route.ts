import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getGoogleAuthUrl } from "@/lib/auth-google";

// Start Google sign-in: set a CSRF state + post-login redirect, bounce to Google.
export async function GET(request: NextRequest) {
  const state = crypto.randomBytes(16).toString("hex");
  const redirect = request.nextUrl.searchParams.get("redirect") || "/";

  const res = NextResponse.redirect(getGoogleAuthUrl(state));
  const secure = process.env.NODE_ENV === "production";
  const opts = { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: 600 };
  res.cookies.set("g_state", state, opts);
  // Only allow same-site relative redirects.
  res.cookies.set("g_redirect", redirect.startsWith("/") ? redirect : "/", opts);
  return res;
}
