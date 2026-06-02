import { db } from "@/lib/db";

export const RECON_FX_PROVIDER = "reconciliation_fx";

// Multipliers to convert 1 unit of the foreign currency into AUD (the base
// currency HubSpot deals are recorded in). Editable in-app; these are just
// sensible starting points.
export const DEFAULT_FX: Record<string, number> = {
  USD: 1.5,
  NZD: 1.08,
  GBP: 1.95,
  EUR: 1.65,
};

function clean(obj: unknown): Record<string, number> {
  if (!obj || typeof obj !== "object") return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const code = k.trim().toUpperCase();
    if (code && code !== "AUD" && typeof v === "number" && Number.isFinite(v) && v > 0) {
      out[code] = v;
    }
  }
  return out;
}

export async function getFxRates(): Promise<Record<string, number>> {
  const row = await db.integrationConfig.findUnique({ where: { provider: RECON_FX_PROVIDER } });
  let stored: Record<string, number> = {};
  if (row?.configJson && row.configJson !== "{}") {
    try {
      stored = clean(JSON.parse(row.configJson).rates);
    } catch {
      stored = {};
    }
  }
  // Stored rates override defaults; defaults fill in any currency not set.
  return { ...DEFAULT_FX, ...stored };
}

export async function saveFxRates(rates: Record<string, number>): Promise<Record<string, number>> {
  const cleaned = clean(rates);
  const configJson = JSON.stringify({ rates: cleaned });
  await db.integrationConfig.upsert({
    where: { provider: RECON_FX_PROVIDER },
    create: { provider: RECON_FX_PROVIDER, enabled: true, configJson },
    update: { configJson },
  });
  return { ...DEFAULT_FX, ...cleaned };
}
