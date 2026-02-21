import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/encryption";
import { testConnection } from "@/lib/integrations/monday";

export async function POST(_request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = await db.integrationConfig.findUnique({
      where: { provider: "monday" },
    });

    if (!config || !config.configJson || config.configJson === "{}") {
      return NextResponse.json(
        { success: false, error: "Monday.com integration is not configured" },
        { status: 400 }
      );
    }

    const decrypted = decryptJson<{ apiToken?: string }>(config.configJson);

    if (!decrypted.apiToken) {
      return NextResponse.json(
        { success: false, error: "API token is not set" },
        { status: 400 }
      );
    }

    const result = await testConnection(decrypted.apiToken);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
