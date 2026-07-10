import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyPassword,
  verifyTotp,
  createSession,
  checkAccountLock,
  recordFailedAttempt,
  resetFailedAttempts,
  isTrustedDevice,
  setTrustedDeviceCookie,
  TRUSTED_DEVICE_COOKIE,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { email, password, totpToken, trustDevice } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Check lock
    const lockStatus = await checkAccountLock(user.id);
    if (lockStatus.locked) {
      return NextResponse.json(
        {
          error: `Account locked. Try again in ${lockStatus.minutesRemaining} minutes.`,
        },
        { status: 429 }
      );
    }

    // Verify password
    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      await recordFailedAttempt(user.id);
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Check TOTP — unless this device is already trusted (skips the 2FA step).
    if (user.totpEnabled && user.totpSecret) {
      const trustCookie = request.cookies.get(TRUSTED_DEVICE_COOKIE)?.value;
      const deviceTrusted = isTrustedDevice(trustCookie, user);
      if (!deviceTrusted) {
        if (!totpToken) {
          return NextResponse.json(
            { requireTotp: true, error: "Two-factor authentication required" },
            { status: 401 }
          );
        }
        if (!verifyTotp(user.totpSecret, totpToken)) {
          await recordFailedAttempt(user.id);
          return NextResponse.json(
            { error: "Invalid two-factor code" },
            { status: 401 }
          );
        }
        // Passed a fresh 2FA challenge — trust this device if the user asked.
        if (trustDevice === true) {
          await setTrustedDeviceCookie(user.id, user.trustedDeviceVersion);
        }
      }
    }

    // Success
    await resetFailedAttempts(user.id);
    await createSession({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      totpEnabled: user.totpEnabled,
    });

    // Audit log
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: "login",
        ipAddress: request.headers.get("x-forwarded-for") || "unknown",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
