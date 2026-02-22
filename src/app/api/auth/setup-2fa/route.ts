import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  requireAuth,
  generateTotpSecret,
  verifyTotp,
  createSession,
  logAudit,
} from "@/lib/auth";
import QRCode from "qrcode";

/**
 * GET /api/auth/setup-2fa
 * Generates a new TOTP secret and returns it with a QR code data URL.
 * If the user already has a pending (unenabled) secret, it regenerates.
 */
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const session = auth.session;

  if (session.totpEnabled) {
    return NextResponse.json(
      { error: "Two-factor authentication is already enabled" },
      { status: 400 }
    );
  }

  // Generate a new TOTP secret
  const { secret, uri } = generateTotpSecret(session.email);

  // Store the secret on the user (but don't enable yet)
  await db.user.update({
    where: { id: session.userId },
    data: { totpSecret: secret },
  });

  // Generate QR code as data URL
  const qrCodeDataUrl = await QRCode.toDataURL(uri);

  return NextResponse.json({
    secret,
    qrCode: qrCodeDataUrl,
  });
}

/**
 * POST /api/auth/setup-2fa
 * Verifies a TOTP token against the stored secret and enables 2FA.
 * Body: { token: string }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const session = auth.session;

  if (session.totpEnabled) {
    return NextResponse.json(
      { error: "Two-factor authentication is already enabled" },
      { status: 400 }
    );
  }

  const { token } = await request.json();
  if (!token || typeof token !== "string") {
    return NextResponse.json(
      { error: "Verification code is required" },
      { status: 400 }
    );
  }

  // Fetch the user's stored (but not yet enabled) TOTP secret
  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, totpSecret: true },
  });

  if (!user || !user.totpSecret) {
    return NextResponse.json(
      { error: "No TOTP secret found. Please generate one first." },
      { status: 400 }
    );
  }

  // Verify the token
  if (!verifyTotp(user.totpSecret, token)) {
    return NextResponse.json(
      { error: "Invalid verification code. Please try again." },
      { status: 400 }
    );
  }

  // Enable 2FA
  await db.user.update({
    where: { id: user.id },
    data: { totpEnabled: true },
  });

  // Re-create the session with totpEnabled = true so the middleware allows access
  await createSession({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    totpEnabled: true,
  });

  await logAudit({
    action: "2fa_enabled",
    userId: user.id,
    details: "User enabled two-factor authentication",
    ip: request.headers.get("x-forwarded-for") || "unknown",
  });

  return NextResponse.json({ success: true });
}
