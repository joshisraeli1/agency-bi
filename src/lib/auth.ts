import bcrypt from "bcryptjs";
import * as OTPAuth from "otpauth";
import { cookies } from "next/headers";
import CryptoJS from "crypto-js";
import crypto from "crypto";
import { db } from "./db";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required. Generate with: openssl rand -hex 32`);
  }
  return value;
}

const SESSION_SECRET = requireEnv("SESSION_SECRET");
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateTotpSecret(email: string) {
  const totp = new OTPAuth.TOTP({
    issuer: "Agency BI",
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret(),
  });
  return { secret: totp.secret.base32, uri: totp.toString() };
}

export function verifyTotp(secret: string, token: string): boolean {
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });
  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
  role: string;
  totpEnabled: boolean;
  exp: number;
}

function signSession(payload: SessionPayload): string {
  const json = JSON.stringify(payload);
  const signature = CryptoJS.HmacSHA256(json, SESSION_SECRET).toString();
  const encoded = Buffer.from(json).toString("base64url");
  return `${encoded}.${signature}`;
}

function verifySession(token: string): SessionPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;
  const json = Buffer.from(encoded, "base64url").toString("utf8");
  const expectedSig = CryptoJS.HmacSHA256(json, SESSION_SECRET).toString();
  // Constant-time comparison to prevent timing attacks
  const sigBuf = Buffer.from(signature, "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  const payload = JSON.parse(json) as SessionPayload;
  if (Date.now() > payload.exp) return null;
  return payload;
}

export async function createSession(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  totpEnabled: boolean;
}) {
  const payload: SessionPayload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    totpEnabled: user.totpEnabled,
    exp: Date.now() + SESSION_DURATION_MS,
  };
  const token = signSession(payload);
  const cookieStore = await cookies();
  cookieStore.set("session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_MS / 1000,
    path: "/",
  });
  return payload;
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session")?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}

// ---------------------------------------------------------------------------
// Role-Based Access Control helpers
// ---------------------------------------------------------------------------

type Role = "admin" | "manager" | "viewer";

/**
 * Check if a session has the required minimum role.
 * Role hierarchy: admin > manager > viewer
 */
export function hasRole(session: { role: string }, minRole: Role): boolean {
  const hierarchy: Record<string, number> = { admin: 3, manager: 2, viewer: 1 };
  return (hierarchy[session.role] ?? 0) >= (hierarchy[minRole] ?? 99);
}

/**
 * Require authentication. Returns session or a 401 Response.
 */
export async function requireAuth(): Promise<
  { session: SessionPayload; error?: never } | { session?: never; error: Response }
> {
  const session = await getSession();
  if (!session) {
    return { error: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) };
  }
  return { session };
}

/**
 * Require authentication + minimum role. Returns session or a 401/403 Response.
 */
export async function requireRole(minRole: Role): Promise<
  { session: SessionPayload; error?: never } | { session?: never; error: Response }
> {
  const auth = await requireAuth();
  if (auth.error) return auth;
  if (!hasRole(auth.session, minRole)) {
    return { error: new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 }) };
  }
  return { session: auth.session };
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

export async function logAudit(opts: {
  action: string;
  userId?: string;
  entity?: string;
  entityId?: string;
  details?: string;
  ip?: string;
}) {
  try {
    await db.auditLog.create({
      data: {
        action: opts.action,
        userId: opts.userId ?? null,
        entity: opts.entity ?? null,
        entityId: opts.entityId ?? null,
        details: opts.details ?? null,
        ipAddress: opts.ip ?? null,
      },
    });
  } catch {
    // Never let audit logging break the request
    console.error("Audit log failed:", opts.action);
  }
}

export async function checkAccountLock(userId: string): Promise<{
  locked: boolean;
  minutesRemaining?: number;
}> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { failedAttempts: true, lockedUntil: true },
  });
  if (!user) return { locked: false };
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const remaining = Math.ceil(
      (user.lockedUntil.getTime() - Date.now()) / 60000
    );
    return { locked: true, minutesRemaining: remaining };
  }
  return { locked: false };
}

export async function recordFailedAttempt(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { failedAttempts: true },
  });
  const attempts = (user?.failedAttempts || 0) + 1;
  const update: { failedAttempts: number; lockedUntil?: Date } = {
    failedAttempts: attempts,
  };
  if (attempts >= MAX_FAILED_ATTEMPTS) {
    update.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
  }
  await db.user.update({ where: { id: userId }, data: update });
}

export async function resetFailedAttempts(userId: string) {
  await db.user.update({
    where: { id: userId },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
}
