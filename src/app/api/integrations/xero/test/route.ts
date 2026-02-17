import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/encryption";
import { testConnection } from "@/lib/integrations/xero";

export async function POST() {
  const config = await db.integrationConfig.findUnique({
    where: { provider: "xero" },
  });

  if (!config || !config.configJson || config.configJson === "{}") {
    return NextResponse.json(
      { success: false, error: "Xero is not configured" },
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
  const tenantId = decrypted.tenantId as string;

  if (!accessToken || !tenantId) {
    return NextResponse.json(
      { success: false, error: "Access token or tenant ID not configured" },
      { status: 400 }
    );
  }

  try {
    const result = await testConnection(accessToken, tenantId);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Connected to ${result.orgName || "Xero"}`,
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
