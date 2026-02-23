import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/encryption";
import { fetchChannels } from "@/lib/integrations/slack";

export async function GET() {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;

  const config = await db.integrationConfig.findUnique({
    where: { provider: "slack" },
  });

  if (!config || !config.configJson || config.configJson === "{}") {
    return NextResponse.json(
      { error: "Slack is not configured" },
      { status: 400 }
    );
  }

  let decrypted: Record<string, unknown>;
  try {
    decrypted = decryptJson(config.configJson);
  } catch {
    return NextResponse.json(
      { error: "Failed to decrypt config" },
      { status: 400 }
    );
  }

  const botToken = decrypted.botToken as string;
  if (!botToken) {
    return NextResponse.json(
      { error: "Bot token not configured" },
      { status: 400 }
    );
  }

  try {
    const channels = await fetchChannels(botToken);
    return NextResponse.json({
      channels: channels.map((ch) => ({
        id: ch.id,
        name: ch.name,
        memberCount: ch.num_members,
        isPrivate: ch.is_private,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch channels";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
