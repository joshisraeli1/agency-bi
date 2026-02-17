import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/encryption";
import { testConnection } from "@/lib/integrations/slack";

export async function POST() {
  const config = await db.integrationConfig.findUnique({
    where: { provider: "slack" },
  });

  if (!config || !config.configJson || config.configJson === "{}") {
    return NextResponse.json(
      { success: false, error: "Slack is not configured" },
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

  const botToken = decrypted.botToken as string;

  if (!botToken) {
    return NextResponse.json(
      { success: false, error: "Bot token not configured" },
      { status: 400 }
    );
  }

  try {
    const result = await testConnection(botToken);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Connected to ${result.team || "Slack"} as ${result.user || "bot"}`,
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
