# Trusted Device — "Remember this device for 30 days" (skip 2FA)

**Date:** 2026-07-09
**Status:** Approved, building

## Problem

Users with 2FA enabled must enter a TOTP code on every login (sessions last 8
hours). This is high-friction for people signing in repeatedly from their own
trusted machine. We want an opt-in "trust this device for 30 days" option that
lets a known device skip the TOTP step, without weakening security for unknown
devices.

## Approach

A signed, DB-revocable **trusted-device cookie**. No new table — trust is a
stateless signed cookie whose validity is anchored to a per-user integer
(`trustedDeviceVersion`) so all trust can be revoked at once by bumping it.

### Data model

Add to `User`:

```prisma
trustedDeviceVersion Int @default(0)
```

### Cookie: `trusted_device`

- Value: `base64url(json).hmacSHA256(json, SESSION_SECRET)` — same scheme as the
  session cookie. Payload: `{ userId, v, exp }` where `v` is the
  `trustedDeviceVersion` at issue time.
- Flags: `httpOnly`, `secure` (prod), `sameSite=lax`, `maxAge = 30 days`, `path=/`.
- Verified with constant-time signature comparison (mirrors `verifySession`).

A cookie is **valid** when: signature checks out AND `exp` not passed AND
`userId` matches the user logging in AND `v === user.trustedDeviceVersion`.

## Flow changes

### `POST /api/auth/login`

Request gains an optional `trustDevice: boolean`.

1. Verify password (unchanged).
2. If `user.totpEnabled && user.totpSecret`:
   - Read the `trusted_device` cookie. If **valid for this user**, skip TOTP.
   - Else run the existing TOTP-required flow. On successful TOTP, if
     `trustDevice === true`, set a fresh `trusted_device` cookie.
3. Create the normal 8-hour session (unchanged).

Google OAuth login is out of scope — it never runs the TOTP step.

### Login page (`(auth)/login/page.tsx`)

Add a "Trust this device for 30 days" checkbox on the **TOTP step only**; send
its value as `trustDevice` in the login POST.

### Revocation — `POST /api/auth/forget-devices`

- Auth required (`requireAuth`).
- Increments the current user's `trustedDeviceVersion`, invalidating every
  outstanding trust cookie for that user. Clears the caller's own
  `trusted_device` cookie.
- Does **not** end the current 8-hour session.

### Settings → Security section

A "Forget all trusted devices" button that calls the route above and toasts
success. No live device count (the version model has no per-device records — a
deliberate simplification; a `TrustedDevice` table would be required for counts
or per-device revocation, explicitly out of scope).

## Security notes

- `httpOnly` blocks JS access; HMAC over `SESSION_SECRET` prevents forgery.
- Trust only affects whether the **TOTP step** is skipped; it never bypasses the
  password check, and site access is still governed by the session cookie +
  middleware. A stolen trust cookie alone cannot log in (password still required).
- Revocation is immediate on next login via the version check.

## Files touched

- `prisma/schema.prisma` + migration (`trustedDeviceVersion` on `User`)
- `src/lib/auth.ts` — `signTrustedDevice`, `verifyTrustedDevice`,
  `setTrustedDeviceCookie`, `clearTrustedDeviceCookie`
- `src/app/api/auth/login/route.ts` — skip-TOTP + set-cookie logic
- `src/app/(auth)/login/page.tsx` — checkbox + flag
- `src/app/api/auth/forget-devices/route.ts` — new route
- `src/app/(dashboard)/settings/page.tsx` — Security section + button

## Verification

Following repo convention (standalone check scripts + end-to-end against the dev
server; no unit-test framework is installed):

- `scripts/check-trusted-device.ts`: exercises sign/verify for valid, expired,
  tampered-signature, wrong-user, and stale-version cookies.
- End-to-end: login with 2FA + checkbox sets the cookie; second login skips
  TOTP; forget-devices bumps the version and the next login requires TOTP again.

## Deploy

The `trustedDeviceVersion` column needs the migration applied to Supabase prod
(`npx prisma migrate deploy` with prod `DATABASE_URL`).
