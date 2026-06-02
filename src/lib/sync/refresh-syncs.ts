/**
 * Reusable "refresh the dashboard's source data" syncs, shared by the in-app
 * Resync button (API route) and the CLI scripts:
 *  - syncHubspotDeals(): refresh the HubspotDeal table (drives revenue tiles +
 *    new/churn chart).
 *  - syncXeroPnl(): refresh Xero P&L Total Income (drives the Xero revenue
 *    charts).
 */
import { db } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/encryption";
import { fetchProfitAndLoss, fetchPnlCostLines, fetchRepeatingInvoices, refreshToken } from "@/lib/integrations/xero";

// ---------------------------------------------------------------------------
// HubSpot deals
// ---------------------------------------------------------------------------

const HUBSPOT_API = "https://api.hubapi.com";
const CONTENT_MACHINE_PIPELINE = "32895309";

const STAGE_LABELS: Record<string, string> = {
  "73380170": "Backburner",
  "98549656": "Re-engage in future",
  "73380171": "Interested",
  "73380172": "Very Warm",
  "143813234": "Contract out",
  "98068645": "Closed Won",
  "1086044538": "Churned but still active",
  "73380176": "Legacy Urban Swan Sales",
  "114291350": "Churned",
};

function mapDealStage(stageId: string): string {
  const l = (STAGE_LABELS[stageId] ?? "").toLowerCase();
  if (l.includes("closed won")) return "closed_won";
  if (l.includes("contract out")) return "proposal";
  if (l.includes("very warm")) return "negotiation";
  if (l.includes("interested")) return "qualified";
  if (l.includes("churned")) return "churned";
  if (l.includes("backburner") || l.includes("re-engage")) return "backburner";
  if (l.includes("legacy")) return "legacy";
  return "prospect";
}

interface HubSpotResult { id: string; properties: Record<string, string | null> }
interface HubSpotPage { results: HubSpotResult[]; paging?: { next?: { after: string } } }
interface HubSpotOwner { id: string; email?: string; firstName?: string; lastName?: string }

async function hubspotGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${HUBSPOT_API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

async function hubspotPost<T>(path: string, body: unknown, token: string): Promise<T> {
  const res = await fetch(`${HUBSPOT_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function syncHubspotDeals(): Promise<{ inPipeline: number; upserted: number }> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN ?? "";
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN not set");

  // Owners (for ownerName)
  const owners: HubSpotOwner[] = [];
  let oAfter: string | undefined;
  do {
    const page = await hubspotGet<{ results: HubSpotOwner[]; paging?: { next?: { after: string } } }>(
      `/crm/v3/owners?limit=100${oAfter ? `&after=${oAfter}` : ""}`, token
    );
    owners.push(...page.results);
    oAfter = page.paging?.next?.after;
  } while (oAfter);
  const ownerNameById = new Map<string, string>();
  for (const o of owners) ownerNameById.set(o.id, [o.firstName, o.lastName].filter(Boolean).join(" ").trim() || o.email || o.id);

  // Deals — fetch only the Content Machine pipeline via the search endpoint
  // (server-side filter). Avoids paging through all ~23k deals in the account.
  const properties = [
    "dealname", "amount", "amount__excl_gst_", "dealstage", "pipeline",
    "createdate", "closedate", "start_date", "churn_date", "hubspot_owner_id",
    "content_package_type", "industry_type",
  ];
  const relevant: HubSpotResult[] = [];
  let after: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filterGroups: [{ filters: [{ propertyName: "pipeline", operator: "EQ", value: CONTENT_MACHINE_PIPELINE }] }],
      properties,
      limit: 100,
    };
    if (after) body.after = after;
    const page = await hubspotPost<HubSpotPage>("/crm/v3/objects/deals/search", body, token);
    relevant.push(...page.results);
    after = page.paging?.next?.after;
  } while (after);

  const clients = await db.client.findMany({ select: { id: true, hubspotDealId: true }, where: { hubspotDealId: { not: null } } });
  const clientByDealId = new Map(clients.map((c) => [c.hubspotDealId!, c.id]));

  const now = new Date();
  const rows = relevant.map((deal) => {
    const p = deal.properties;
    const stageId = p.dealstage ?? "";
    const ownerId = p.hubspot_owner_id ?? null;
    return {
      id: deal.id,
      clientId: clientByDealId.get(deal.id) ?? null,
      name: p.dealname ?? "(unnamed)",
      amount: p.amount ? parseFloat(p.amount) : null,
      amountExGst: p.amount__excl_gst_ ? parseFloat(p.amount__excl_gst_) : null,
      ownerId,
      ownerName: ownerId ? ownerNameById.get(ownerId) ?? null : null,
      stage: mapDealStage(stageId),
      stageLabel: STAGE_LABELS[stageId] ?? stageId,
      pipeline: "Content Machine",
      createDate: parseDate(p.createdate),
      startDate: parseDate(p.start_date),
      closeDate: parseDate(p.closedate),
      churnDate: parseDate(p.churn_date),
      contentPackageType: p.content_package_type ?? null,
      industry: p.industry_type ?? null,
      lastSyncedAt: now,
    };
  });

  // Upsert in parallel batches — sequential round-trips to the (remote) DB
  // dominate wall-clock otherwise (~150ms each × 868 deals).
  let upserted = 0;
  const CHUNK = 12;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    await Promise.all(batch.map((data) => db.hubspotDeal.upsert({ where: { id: data.id }, create: data, update: data })));
    upserted += batch.length;
  }

  return { inPipeline: relevant.length, upserted };
}

// ---------------------------------------------------------------------------
// Xero P&L Total Income
// ---------------------------------------------------------------------------

const SYNTH_CLIENT_NAME = "Xero P&L (Total Income)";
const PNL_CATEGORY = "xero_pnl_income";

interface XeroConfig { accessToken: string; refreshToken: string; tenantId: string; tenantName?: string; expiresAt?: number }

// Load the stored Xero token, refreshing + persisting it if expired.
async function getValidXeroToken(): Promise<{ accessToken: string; tenantId: string }> {
  const cfgRow = await db.integrationConfig.findUnique({ where: { provider: "xero" } });
  if (!cfgRow || cfgRow.configJson === "{}") throw new Error("Xero not connected");
  let cfg = decryptJson<XeroConfig>(cfgRow.configJson);
  if (cfg.expiresAt && Date.now() > cfg.expiresAt - 60_000) {
    const r = await refreshToken(cfg.refreshToken);
    cfg = { ...cfg, accessToken: r.accessToken, refreshToken: r.refreshToken, expiresAt: Date.now() + r.expiresIn * 1000 };
    await db.integrationConfig.update({ where: { provider: "xero" }, data: { configJson: encryptJson(cfg as unknown as Record<string, unknown>) } });
  }
  return { accessToken: cfg.accessToken, tenantId: cfg.tenantId };
}

function parseXeroDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const epoch = value.match(/\/Date\((\d+)/);
  if (epoch) return new Date(parseInt(epoch[1], 10));
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// Pull Xero repeating-invoice templates into XeroRepeatingInvoice (for the
// reconciliation against HubSpot retainers).
export async function syncXeroRepeatingInvoices(): Promise<{ count: number }> {
  const { accessToken, tenantId } = await getValidXeroToken();
  const repeating = await fetchRepeatingInvoices(accessToken, tenantId);
  for (const r of repeating) {
    const data = {
      id: r.RepeatingInvoiceID,
      xeroContactId: r.Contact?.ContactID ?? null,
      xeroContactName: r.Contact?.Name ?? null,
      status: r.Status ?? null,
      type: r.Type ?? null,
      scheduleUnit: r.Schedule?.Unit ?? null,
      scheduleInterval: r.Schedule?.Period ?? null,
      nextScheduledDate: parseXeroDate(r.Schedule?.NextScheduledDate ?? r.Schedule?.NextScheduledDateString),
      subTotal: r.SubTotal ?? null,
      totalTax: r.TotalTax ?? null,
      total: r.Total ?? null,
      currencyCode: r.CurrencyCode ?? null,
      reference: r.Reference ?? null,
      lineItemDescription: r.LineItems?.[0]?.Description ?? null,
      lastSyncedAt: new Date(),
    };
    await db.xeroRepeatingInvoice.upsert({ where: { id: r.RepeatingInvoiceID }, create: data, update: data });
  }
  return { count: repeating.length };
}

export async function syncXeroPnl(): Promise<{ months: number; removed: number; tenant?: string; costLines?: number; costRows?: number }> {
  const cfgRow = await db.integrationConfig.findUnique({ where: { provider: "xero" } });
  if (!cfgRow || cfgRow.configJson === "{}") throw new Error("Xero not connected");
  let cfg = decryptJson<XeroConfig>(cfgRow.configJson);

  if (cfg.expiresAt && Date.now() > cfg.expiresAt - 60_000) {
    const r = await refreshToken(cfg.refreshToken);
    cfg = { ...cfg, accessToken: r.accessToken, refreshToken: r.refreshToken, expiresAt: Date.now() + r.expiresIn * 1000 };
    await db.integrationConfig.update({ where: { provider: "xero" }, data: { configJson: encryptJson(cfg as unknown as Record<string, unknown>) } });
  }

  const pnl = await fetchProfitAndLoss(cfg.accessToken, cfg.tenantId, 11);

  let synth = await db.client.findFirst({ where: { name: SYNTH_CLIENT_NAME, source: "xero" } });
  if (!synth) synth = await db.client.create({ data: { name: SYNTH_CLIENT_NAME, source: "xero", status: "active" } });

  const removed = await db.financialRecord.deleteMany({
    where: { source: "xero", type: { in: ["retainer", "project"] }, NOT: { clientId: synth.id } },
  });

  for (const m of pnl) {
    await db.financialRecord.upsert({
      where: { clientId_month_type_category: { clientId: synth.id, month: m.month, type: "retainer", category: PNL_CATEGORY } },
      create: { clientId: synth.id, month: m.month, type: "retainer", category: PNL_CATEGORY, amount: m.totalIncome, source: "xero", description: "Xero P&L Total Income" },
      update: { amount: m.totalIncome },
    });
  }

  // Cost lines (Cost of Sales + Operating Expenses) per account/month — used to
  // build divisional margins from actual Xero costs. Stored as type="cost" on
  // the synthetic client; division mapping happens at read time.
  const costLines = await fetchPnlCostLines(cfg.accessToken, cfg.tenantId, 11);
  await db.financialRecord.deleteMany({ where: { clientId: synth.id, source: "xero", type: "cost" } });
  const costRows: { clientId: string; month: string; type: string; category: string; amount: number; source: string; description: string }[] = [];
  for (const line of costLines) {
    for (const [month, amount] of Object.entries(line.byMonth)) {
      if (!amount) continue;
      costRows.push({ clientId: synth.id, month, type: "cost", category: line.account, amount, source: "xero", description: line.section });
    }
  }
  if (costRows.length) await db.financialRecord.createMany({ data: costRows });

  return { months: pnl.length, removed: removed.count, tenant: cfg.tenantName, costLines: costLines.length, costRows: costRows.length };
}
