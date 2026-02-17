import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/encryption";
import { fetchPipelines } from "@/lib/integrations/hubspot";

export async function GET() {
  const config = await db.integrationConfig.findUnique({
    where: { provider: "hubspot" },
  });

  if (!config || !config.configJson || config.configJson === "{}") {
    return NextResponse.json(
      { error: "HubSpot is not configured" },
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

  const token = decrypted.accessToken as string;
  if (!token) {
    return NextResponse.json(
      { error: "Access token not configured" },
      { status: 400 }
    );
  }

  try {
    const pipelines = await fetchPipelines(token);
    return NextResponse.json({
      pipelines: pipelines.map((p) => ({
        id: p.id,
        label: p.label,
        stages: p.stages,
      })),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch pipelines";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
