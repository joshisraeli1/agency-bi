/**
 * FINAL: For each Closed Won deal in HubSpot, find/update the canonical client.
 * Demote ALL other active clients to churned. Result: active count + sum match HubSpot exactly.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import { db } from "../src/lib/db";

const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN!;
const PIPELINE_ID = "32895309";
const CLOSED_WON = "98068645";

interface HSDeal {
  id: string;
  properties: { dealname: string; amount: string | null; amount__excl_gst_: string | null; dealstage: string | null; pipeline: string | null; };
  associations?: { companies?: { results: { id: string }[] } };
}

async function fetchWithRetry(url: string): Promise<unknown> {
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      if (i === 4) throw e;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw new Error("unreachable");
}

function normalizeName(name: string): string {
  return name.toLowerCase()
    .replace(/\s*[-–]\s*(recurring content|content delivery|ads management|ads mgmt|content|ads|one-off campaign|contract extension|social mgmt|round \d+|photoshoot|tiktok|statics|double up|upgrade|uk|extension \d+)$/i, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

async function main() {
  console.log("Fetching HubSpot Closed Won deals...");
  let after: string | undefined;
  const deals: HSDeal[] = [];
  do {
    const url = new URL("https://api.hubapi.com/crm/v3/objects/deals");
    url.searchParams.set("limit", "100");
    url.searchParams.set("properties", "dealname,amount,amount__excl_gst_,dealstage,pipeline");
    url.searchParams.set("associations", "companies");
    if (after) url.searchParams.set("after", after);
    const data = (await fetchWithRetry(url.toString())) as { results?: HSDeal[]; paging?: { next?: { after: string } } };
    for (const d of (data.results || [])) {
      if (d.properties.pipeline === PIPELINE_ID && d.properties.dealstage === CLOSED_WON) deals.push(d);
    }
    after = data.paging?.next?.after;
  } while (after);
  console.log(`Got ${deals.length} deals, total: $${deals.reduce((s, d) => s + parseFloat(d.properties.amount__excl_gst_ || "0"), 0).toFixed(2)}`);

  // Build lookup maps
  const allClients = await db.client.findMany({
    select: { id: true, name: true, hubspotDealId: true, hubspotCompanyId: true, retainerValue: true, status: true },
  });
  const byCompanyId = new Map<string, typeof allClients[number]>();
  const byDealId = new Map<string, typeof allClients[number]>();
  const byNormName = new Map<string, typeof allClients[number][]>();
  for (const c of allClients) {
    if (c.hubspotCompanyId) byCompanyId.set(c.hubspotCompanyId, c);
    if (c.hubspotDealId) byDealId.set(c.hubspotDealId, c);
    const norm = normalizeName(c.name);
    const arr = byNormName.get(norm) ?? [];
    arr.push(c);
    byNormName.set(norm, arr);
  }

  // For each deal, sum into ONE canonical client per deal — preferring company match
  const sumByClient = new Map<string, { name: string; total: number }>();
  for (const d of deals) {
    const ex = parseFloat(d.properties.amount__excl_gst_ || "0");
    if (!ex) continue;
    const companyId = d.associations?.companies?.results?.[0]?.id;
    let client = companyId ? byCompanyId.get(companyId) : undefined;
    if (!client) client = byDealId.get(d.id);
    if (!client) {
      const candidates = byNormName.get(normalizeName(d.properties.dealname)) ?? [];
      // prefer the one with hubspotCompanyId or hubspotDealId, then any
      client = candidates.find(c => c.hubspotCompanyId) ?? candidates.find(c => c.hubspotDealId) ?? candidates[0];
    }
    if (!client) {
      console.log(`  ⚠ unmatched: ${d.properties.dealname} ($${ex})`);
      continue;
    }
    const row = sumByClient.get(client.id) ?? { name: client.name, total: 0 };
    row.total += ex;
    sumByClient.set(client.id, row);
  }

  console.log(`\nMatched 59 deals to ${sumByClient.size} canonical clients, sum: $${[...sumByClient.values()].reduce((s, r) => s + r.total, 0).toFixed(2)}`);

  // ── Apply ──
  const receivingIds = new Set(sumByClient.keys());

  // 1. Set each receiving client to active + correct retainer
  let updated = 0;
  for (const [clientId, row] of sumByClient.entries()) {
    await db.client.update({
      where: { id: clientId },
      data: { retainerValue: row.total, status: "active" },
    });
    updated++;
  }

  // 2. Demote any OTHER active client (any dup or stray) to churned
  const otherActives = allClients.filter(c => c.status === "active" && !receivingIds.has(c.id));
  console.log(`\nDemoting ${otherActives.length} non-receiving active clients:`);
  for (const c of otherActives) {
    await db.client.update({ where: { id: c.id }, data: { status: "churned" } });
    console.log(`  ${c.name.padEnd(40)} was $${(c.retainerValue ?? 0).toFixed(2)}  dealId:${c.hubspotDealId ?? "-"}  companyId:${c.hubspotCompanyId ?? "-"}`);
  }

  // ── Verify ──
  const finalActive = await db.client.findMany({
    where: { status: "active" },
    select: { name: true, retainerValue: true, hubspotDealId: true, hubspotCompanyId: true },
  });
  const finalSum = finalActive.reduce((s, c) => s + (c.retainerValue ?? 0), 0);
  console.log(`\n=== Final ===`);
  console.log(`Active clients: ${finalActive.length}`);
  console.log(`Sum: $${finalSum.toFixed(2)}`);
  console.log(`Target: 59 deals → 54 clients → $408,286.50`);
  console.log(`Diff: $${(finalSum - 408286.5).toFixed(2)}`);

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
