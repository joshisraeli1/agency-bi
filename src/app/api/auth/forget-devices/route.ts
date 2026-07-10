import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, clearTrustedDeviceCookie, logAudit } from "@/lib/auth";

// Revoke every "trusted device" for the current user by bumping their
// trustedDeviceVersion — all outstanding trust cookies (whose embedded version
// no longer matches) stop skipping 2FA on next login. Also clears the caller's
// own trust cookie. Does NOT end the current 8-hour session.
export async function POST() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  await db.user.update({
    where: { id: auth.session.userId },
    data: { trustedDeviceVersion: { increment: 1 } },
  });
  await clearTrustedDeviceCookie();

  await logAudit({
    action: "forget_trusted_devices",
    userId: auth.session.userId,
    entity: "user",
    entityId: auth.session.userId,
  });

  return NextResponse.json({ success: true });
}
