import { db } from "@/lib/db";

const LEGACY_DEAL_STAGE = "Legacy Urban Swan Sales (AU)";

/**
 * Returns a Set of client IDs that should be excluded from all analytics:
 * - Prospects (status = "prospect")
 * - Legacy Urban Swan clients (dealStage = "Legacy Urban Swan Sales (AU)")
 */
export async function getExcludedClientIds(): Promise<Set<string>> {
  const [prospects, legacyClients] = await Promise.all([
    db.client.findMany({
      where: { status: "prospect" },
      select: { id: true },
    }),
    db.client.findMany({
      where: { dealStage: LEGACY_DEAL_STAGE },
      select: { id: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const c of prospects) ids.add(c.id);
  for (const c of legacyClients) ids.add(c.id);
  return ids;
}
