import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/encryption";
import { testConnectionGmail } from "@/lib/integrations/gmail";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await db.integrationConfig.findUnique({
    where: { provider: "gmail" },
  });

  if (!config || !config.configJson || config.configJson === "{}") {
    return NextResponse.json(
      { success: false, error: "Gmail is not configured" },
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
    const result = await testConnectionGmail(accessToken);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Connected as ${result.email || "Gmail user"}`,
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
