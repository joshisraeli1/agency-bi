import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/encryption";
import { testConnectionCalendar } from "@/lib/integrations/calendar";

export async function POST() {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;

  const config = await db.integrationConfig.findUnique({
    where: { provider: "calendar" },
  });

  if (!config || !config.configJson || config.configJson === "{}") {
    return NextResponse.json(
      { success: false, error: "Calendar is not configured" },
      { status: 400 }
    );
  }

  let decrypted: Record<string, unknown>;
  try {
    decrypted = decryptJson(config.configJson);
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to decrypt config" },
      { status: 400 }
    );
  }

  const accessToken = decrypted.accessToken as string;

  if (!accessToken) {
    return NextResponse.json(
      { success: false, error: "Access token not configured" },
      { status: 400 }
    );
  }

  try {
    const result = await testConnectionCalendar(accessToken);

    if (result.success) {
      const calendarCount = result.calendars?.length ?? 0;
      return NextResponse.json({
        success: true,
        message: `Connected! Found ${calendarCount} calendar(s)`,
        calendars: result.calendars,
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.error || "Connection failed" },
        { status: 400 }
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection test failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}
