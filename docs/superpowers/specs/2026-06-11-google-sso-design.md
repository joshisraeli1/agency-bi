# Google Sign-In (domain-restricted SSO) — Design

**Date:** 2026-06-11 · **Status:** Approved (pending build)

## Decisions
- **Direct Google OAuth**, reusing the existing HMAC session cookie (no Firebase).
- **Keep** the existing email + password + TOTP login as a fallback.
- Restrict to the **`swan.studio`** domain.
- First-time `@swan.studio` Google users are **auto-provisioned as `viewer`**.

## Flow
1. `/login` gains a **"Sign in with Google"** button → `GET /api/auth/google`.
2. `/api/auth/google`: generate a random CSRF `state` (httpOnly cookie `g_state`), stash the post-login `redirect` target (cookie `g_redirect`), redirect to Google consent — `scope=openid email profile`, `hd=swan.studio`, `prompt=select_account`, `redirect_uri=${NEXT_PUBLIC_APP_URL}/api/auth/google/callback`.
3. `GET /api/auth/google/callback`:
   - Verify `state` matches the `g_state` cookie (CSRF); clear it.
   - Exchange `code` at `https://oauth2.googleapis.com/token`.
   - Fetch userinfo (`openidconnect.googleapis.com/v1/userinfo`) → `{ email, email_verified, name }`.
   - **Reject** unless `email_verified` and `email` ends with `@swan.studio` → redirect `/login?error=domain`.
   - **Upsert** `User` by email: `create` → `{ role: "viewer", passwordHash: <random unusable>, totpEnabled: false }`; `update` → only `name` + `lastLoginAt` (never touches `role`, so existing admins keep their role).
   - `createSession(user)` (same signed cookie as password login) → redirect to the saved target.
   - `logAudit({ action: "login_google", userId, email })`.
4. Middleware and all routes are unchanged — they only see the standard session cookie.

## Components
- `src/lib/auth-google.ts` — `getGoogleAuthUrl(state)`, `exchangeCodeForProfile(code)`, `ALLOWED_DOMAIN`.
- `src/app/api/auth/google/route.ts` (GET, start).
- `src/app/api/auth/google/callback/route.ts` (GET, finish).
- `src/app/(auth)/login/page.tsx` — Google button + `?error=domain` message.
- Reuses `createSession`, `hashPassword`, `logAudit` from `src/lib/auth.ts`; `GOOGLE_OAUTH_CLIENT_ID/_SECRET` + `NEXT_PUBLIC_APP_URL` from env.

## Setup (user, outside code)
Add the callback redirect URI to that Google OAuth client in Google Cloud Console:
`http://localhost:3000/api/auth/google/callback` and the prod URL.

## Notes / risks
- `josh@swan.studio` will be created as `viewer` on first login; promote to `admin` (via the existing admin account's user management, or a one-off DB update).
- Domain is enforced **server-side on the verified email** (the `hd` param is only a hint).
- Out of scope: removing password login, Firebase, multi-domain.
