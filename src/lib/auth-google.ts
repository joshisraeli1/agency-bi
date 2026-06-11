// Google sign-in (direct OAuth) — domain-restricted to swan.studio.
// Mints the same signed session cookie as password login (see createSession).

export const ALLOWED_DOMAIN = "swan.studio";

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

function redirectUri(): string {
  // Trim stray whitespace/newlines + trailing slash — a newline in the Vercel
  // env var was corrupting the redirect_uri (…vercel.app%0A/api/…).
  const base = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\/+$/, "");
  return `${base}/api/auth/google/callback`;
}

export function getGoogleAuthUrl(state: string): string {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID not set");
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("hd", ALLOWED_DOMAIN); // hint only — enforced server-side
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("access_type", "online");
  return url.toString();
}

export interface GoogleProfile {
  email: string;
  emailVerified: boolean;
  name: string;
}

export async function exchangeCodeForProfile(code: string): Promise<GoogleProfile> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Google OAuth env not set");

  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google token exchange failed: ${tokenRes.status}`);
  const { access_token } = (await tokenRes.json()) as { access_token?: string };
  if (!access_token) throw new Error("No access token from Google");

  const infoRes = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!infoRes.ok) throw new Error(`Google userinfo failed: ${infoRes.status}`);
  const info = (await infoRes.json()) as { email?: string; email_verified?: boolean; name?: string };
  if (!info.email) throw new Error("No email from Google");

  return {
    email: info.email.toLowerCase(),
    emailVerified: info.email_verified === true,
    name: info.name || info.email,
  };
}

/** True only for a verified email whose exact domain is the allowed Workspace. */
export function isAllowedGoogleProfile(p: GoogleProfile): boolean {
  const parts = p.email.split("@");
  return p.emailVerified && parts.length === 2 && parts[1] === ALLOWED_DOMAIN;
}
