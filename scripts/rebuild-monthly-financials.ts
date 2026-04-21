/**
 * Rebuild monthly HubSpot FinancialRecord entries to match live HubSpot deal data.
 *
 * For each Closed Won deal (plus "Churned but still active" so we capture revenue up to churn),
 * generate monthly retainer records from start_date (or closedate) through churn_date
 * (or current month if still active). Uses ex-GST amount (matches HubSpot's Revenue Summary).
 *
 * Category convention: "deal:{hubspotDealId}" — matches agency-kpis, revenue-overview.
 *
 * Does NOT touch Client table (client statuses + retainerValues were reconciled separately).
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import { db } from "../src/lib/db";

const TOKEN = process.env.HUBSPOT_ACCESS_TOKEN!;
const PIPELINE_ID = "32895309";
const CLOSED_WON = "98068645";
const CHURNED_STILL_ACTIVE = "1086044538";
const CHURNED = "114291350";

interface HSDeal {
  id: string;
  properties: {
    dealname: string;
    amount: string | null;
    amount__excl_gst_: string | null;
    dealstage: string | null;
    pipeline: string | null;
    start_date: string | null;
    churn_date: string | null;
    closedate: string | null;
    content_package_type: string | null;
  };
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

function parseMonth(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const m = dateStr.match(/^(\d{4}-\d{2})/);
  return m ? m[1] : null;
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthsBetween(start: string, end: string): string[] {
  const months: string[] = [];
  let [y, m] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

function normalizeName(name: string): string {
  return name.toLowerCase()
    .replace(/\s*[-–]\s*(recurring content|content delivery|ads management|ads mgmt|content|ads|one-off campaign|contract extension|social mgmt|round \d+|photoshoot|tiktok|statics|double up|upgrade|uk|extension \d+)$/i, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

async function main() {
  // 1. Fetch all Closed Won + Churned (but-still-active) + Churned deals in Content Machine
  console.log("Fetching HubSpot deals...");
  let after: string | undefined;
  const deals: HSDeal[] = [];
  do {
    const url = new URL("https://api.hubapi.com/crm/v3/objects/deals");
    url.searchParams.set("limit", "100");
    url.searchParams.set("properties", "dealname,amount,amount__excl_gst_,dealstage,pipeline,start_date,churn_date,closedate,content_package_type");
    url.searchParams.set("associations", "companies");
    if (after) url.searchParams.set("after", after);
    const data = (await fetchWithRetry(url.toString())) as { results?: HSDeal[]; paging?: { next?: { after: string } } };
    for (const d of (data.results || [])) {
      if (d.properties.pipeline !== PIPELINE_ID) continue;
      const st = d.properties.dealstage;
      // Include Closed Won (active revenue) + Churned (historical revenue). Skip
      // CHURNED_STILL_ACTIVE because those often lack churn_date and would bleed
      // into the current month incorrectly.
      if (st === CLOSED_WON || st === CHURNED) deals.push(d);
    }
    after = data.paging?.next?.after;
  } while (after);
  console.log(`Got ${deals.length} revenue-generating deals`);

  // 2. Build client lookups for matching (mirrors final-reconcile)
  const allClients = await db.client.findMany({
    select: { id: true, name: true, hubspotDealId: true, hubspotCompanyId: true, status: true },
  });
  const byCompanyId = new Map<string, typeof allClients[number]>();
  const byDealId = new Map<string, typeof allClients[number]>();
  const byNormName = new Map<string, typeof allClients[number][]>();
  for (const c of allClients) {
    if (c.hubspotCompanyId) byCompanyId.set(c.hubspotCompanyId, c);
    if (c.hubspotDealId) byDealId.set(c.hubspotDealId, c);
    const arr = byNormName.get(normalizeName(c.name)) ?? [];
    arr.push(c);
    byNormName.set(normalizeName(c.name), arr);
  }

  function matchClient(deal: HSDeal): typeof allClients[number] | undefined {
    const companyId = deal.associations?.companies?.results?.[0]?.id;
    if (companyId) {
      const c = byCompanyId.get(companyId);
      if (c) return c;
    }
    const c = byDealId.get(deal.id);
    if (c) return c;
    const candidates = byNormName.get(normalizeName(deal.properties.dealname)) ?? [];
    return candidates.find(c => c.hubspotCompanyId) ?? candidates.find(c => c.hubspotDealId) ?? candidates[0];
  }

  // 3. Nuke ALL existing HubSpot retainer records (clean slate — we'll rebuild from live HubSpot data)
  const { count: wiped } = await db.financialRecord.deleteMany({
    where: { source: "hubspot", type: "retainer" },
  });
  console.log(`Wiped ${wiped} stale records (full clean slate)`);

  // 4. Generate fresh monthly records per deal
  const now = currentMonth();
  let created = 0;
  let skippedNoAmount = 0;
  let skippedUnmatched = 0;
  for (const d of deals) {
    const amountExGst = d.properties.amount__excl_gst_ ? parseFloat(d.properties.amount__excl_gst_) : null;
    if (!amountExGst || amountExGst <= 0) {
      skippedNoAmount++;
      continue;
    }
    const client = matchClient(d);
    if (!client) {
      skippedUnmatched++;
      continue;
    }

    // startMonth: prefer start_date, else closedate
    const startMonth = parseMonth(d.properties.start_date) || parseMonth(d.properties.closedate);
    if (!startMonth) {
      console.log(`  ⚠ no start/close date: ${d.properties.dealname}`);
      continue;
    }
    // endMonth logic:
    //  - CHURNED-stage deal: MUST have churn_date; skip if missing (data too incomplete)
    //  - CHURNED_STILL_ACTIVE or CLOSED_WON: use churn_date if set (and before now), else current month
    const churnMonth = parseMonth(d.properties.churn_date);
    const stage = d.properties.dealstage;
    let endMonth: string;
    if (stage === CHURNED) {
      if (!churnMonth) {
        // Data gap — skip to avoid creating records that run to today
        continue;
      }
      endMonth = churnMonth;
    } else {
      // CLOSED_WON or CHURNED_STILL_ACTIVE
      endMonth = churnMonth && churnMonth < now ? churnMonth : now;
    }

    // If start is after end (weird data), use start alone (one-off)
    const span = startMonth > endMonth ? [startMonth] : monthsBetween(startMonth, endMonth);
    const isChurned = stage === CHURNED || stage === CHURNED_STILL_ACTIVE;

    for (const month of span) {
      try {
        await db.financialRecord.create({
          data: {
            clientId: client.id,
            month,
            type: "retainer",
            category: `deal:${d.id}`,
            amount: amountExGst,
            description: `HubSpot deal: ${d.properties.dealname}${isChurned ? " (churned)" : ""}`,
            source: "hubspot",
            externalId: d.id,
          },
        });
        created++;
      } catch (e) {
        // Unique constraint (clientId+month+type+category) — merge-update
        await db.financialRecord.update({
          where: {
            clientId_month_type_category: { clientId: client.id, month, type: "retainer", category: `deal:${d.id}` },
          },
          data: { amount: amountExGst, description: `HubSpot deal: ${d.properties.dealname}${isChurned ? " (churned)" : ""}`, externalId: d.id },
        });
      }
    }
  }
  console.log(`\nCreated ${created} monthly retainer records. Skipped: ${skippedNoAmount} no amount, ${skippedUnmatched} unmatched.`);

  // 5. Verify current-month total matches HubSpot
  const thisMonth = currentMonth();
  const sumThisMonth = await db.financialRecord.aggregate({
    where: { source: "hubspot", type: "retainer", month: thisMonth },
    _sum: { amount: true },
  });
  console.log(`\nCurrent month (${thisMonth}) retainer sum (ex-GST): $${(sumThisMonth._sum.amount ?? 0).toFixed(2)}`);
  console.log(`Target: $408,286.50 ex-GST`);

  await db.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
