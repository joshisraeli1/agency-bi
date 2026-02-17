import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptJson, decryptJson } from "@/lib/encryption";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  const config = await db.integrationConfig.findUnique({
    where: { provider },
  });

  if (!config) {
    // Return empty config — not an error, just not set up yet
    return NextResponse.json({
      provider,
      enabled: false,
      config: {},
      lastSyncAt: null,
      lastSyncStatus: null,
    });
  }

  // Decrypt config for client (but mask sensitive fields)
  let decrypted: Record<string, unknown> = {};
  try {
    if (config.configJson && config.configJson !== "{}") {
      decrypted = decryptJson(config.configJson);
    }
  } catch {
    decrypted = {};
  }

  // Mask API tokens
  const masked = { ...decrypted };
  for (const key of Object.keys(masked)) {
    if (
      typeof masked[key] === "string" &&
      (key.toLowerCase().includes("token") ||
        key.toLowerCase().includes("secret") ||
        key.toLowerCase().includes("key"))
    ) {
      const val = masked[key] as string;
      masked[key] = val.length > 8
        ? val.slice(0, 4) + "****" + val.slice(-4)
        : "****";
    }
  }

  return NextResponse.json({
    provider: config.provider,
    enabled: config.enabled,
    config: masked,
    lastSyncAt: config.lastSyncAt,
    lastSyncStatus: config.lastSyncStatus,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const body = await request.json();

  const existing = await db.integrationConfig.findUnique({
    where: { provider },
  });

  // Merge with existing decrypted config (if any)
  let existingConfig: Record<string, unknown> = {};
  try {
    if (existing?.configJson && existing.configJson !== "{}") {
      existingConfig = decryptJson(existing.configJson);
    }
  } catch {
    existingConfig = {};
  }

  const mergedConfig = { ...existingConfig, ...body.config };
  const encrypted = encryptJson(mergedConfig);

  const updated = await db.integrationConfig.upsert({
    where: { provider },
    create: {
      provider,
      configJson: encrypted,
      enabled: body.enabled ?? false,
    },
    update: {
      configJson: encrypted,
      enabled: body.enabled ?? existing?.enabled ?? false,
    },
  });

  return NextResponse.json({
    provider: updated.provider,
    enabled: updated.enabled,
  });
}
