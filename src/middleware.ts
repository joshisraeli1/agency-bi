import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import CryptoJS from "crypto-js";

const SESSION_SECRET = process.env.SESSION_SECRET || "";

// Lightweight session validity check for the Edge middleware: verifies the
// HMAC signature AND expiry, mirroring verifySession() in lib/auth.ts. This
// lets the middleware redirect *any* invalid session (expired OR wrongly
// signed) to /login, instead of letting it through to a route that then
// returns a confusing 401 JSON. The authoritative check still runs server-side
// in getSession(); a plain string compare is fine here (this is a UX gate, not
// the security boundary).
function readValidPayload(token: string): { totpEnabled?: boolean } | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  try {
    const json = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    const expectedSig = CryptoJS.HmacSHA256(json, SESSION_SECRET).toString();
    if (signature !== expectedSig) return null;
    const payload = JSON.parse(json);
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

const PUBLIC_PATHS = [
  "/login",
  "/api/auth/login",
  "/api/integrations/xero/callback",
  "/api/integrations/gmail/callback",
  "/api/integrations/calendar/callback",
];

// Paths that users without 2FA may access (setup flow + auth API routes)
const SETUP_2FA_ALLOWED_PATHS = [
  "/setup-2fa",
  "/api/auth/setup-2fa",
  "/api/auth/logout",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Validate the session cookie (signature + expiry). Any invalid session —
  // missing, expired, or wrongly signed — redirects to /login and clears the
  // stale cookie, so the user always lands on the login screen instead of a
  // confusing server-side 401.
  const session = request.cookies.get("session")?.value;
  const payload = session ? readValidPayload(session) : null;
  if (!payload) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    const res = NextResponse.redirect(loginUrl);
    res.cookies.delete("session");
    return res;
  }

  // User hasn't set up 2FA — only allow setup-related paths
  if (payload.totpEnabled === false) {
    if (!SETUP_2FA_ALLOWED_PATHS.some((p) => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL("/setup-2fa", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
