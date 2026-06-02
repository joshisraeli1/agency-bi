import { db } from "@/lib/db";

export const RECON_ALIASES_PROVIDER = "reconciliation_aliases";

export interface NameAlias {
  xeroName: string; // contact name as it appears in Xero
  clientName: string; // HubSpot client (or deal) name it maps to
}

function clean(list: unknown): NameAlias[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (a): a is NameAlias =>
        !!a &&
        typeof (a as NameAlias).xeroName === "string" &&
        typeof (a as NameAlias).clientName === "string" &&
        (a as NameAlias).xeroName.trim().length > 0 &&
        (a as NameAlias).clientName.trim().length > 0,
    )
    .map((a) => ({ xeroName: a.xeroName.trim(), clientName: a.clientName.trim() }));
}

export async function getReconciliationAliases(): Promise<NameAlias[]> {
  const row = await db.integrationConfig.findUnique({
    where: { provider: RECON_ALIASES_PROVIDER },
  });
  if (!row?.configJson || row.configJson === "{}") return [];
  try {
    return clean(JSON.parse(row.configJson).aliases);
  } catch {
    return [];
  }
}

export async function saveReconciliationAliases(aliases: NameAlias[]): Promise<NameAlias[]> {
  const cleaned = clean(aliases);
  const configJson = JSON.stringify({ aliases: cleaned });
  await db.integrationConfig.upsert({
    where: { provider: RECON_ALIASES_PROVIDER },
    create: { provider: RECON_ALIASES_PROVIDER, enabled: true, configJson },
    update: { configJson },
  });
  return cleaned;
}
