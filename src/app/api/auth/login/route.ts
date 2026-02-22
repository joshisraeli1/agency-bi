import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  verifyPassword,
  verifyTotp,
  createSession,
  checkAccountLock,
  recordFailedAttempt,
  resetFailedAttempts,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { email, password, totpToken } = await request.json();

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

    // Check TOTP
    if (user.totpEnabled && user.totpSecret) {
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
