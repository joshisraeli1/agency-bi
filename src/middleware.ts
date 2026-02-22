import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

  // Check for session cookie
  const session = request.cookies.get("session")?.value;
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Decode session payload to check totpEnabled.
  // Full signature verification happens in getSession() on the server side;
  // here we only need a lightweight read of the payload for the 2FA gate.
  try {
    const [encoded] = session.split(".");
    if (encoded) {
      const json = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
      const payload = JSON.parse(json);

      if (payload.totpEnabled === false) {
        // User hasn't set up 2FA — only allow setup-related paths
        if (!SETUP_2FA_ALLOWED_PATHS.some((p) => pathname.startsWith(p))) {
          return NextResponse.redirect(new URL("/setup-2fa", request.url));
        }
      }
    }
  } catch {
    // If we can't decode the session, let the request through —
    // the server-side getSession() will reject invalid sessions.
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
