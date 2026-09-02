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
import { buildClientIndex, isLinkableStage, resolveDealClient } from "./deal-client-link";
import { MICHAEL_OWNER_ID } from "@/lib/analytics/michael-sales";

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
  "1367663138": "Current (Not Paying)",
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

/** HubSpot owner id -> display name, used to label deals and activity. */
async function loadOwnerNames(token: string): Promise<Map<string, string>> {
  const owners: HubSpotOwner[] = [];
  let after: string | undefined;
  do {
    const page = await hubspotGet<{ results: HubSpotOwner[]; paging?: { next?: { after: string } } }>(
      `/crm/v3/owners?limit=100${after ? `&after=${after}` : ""}`, token
    );
    owners.push(...page.results);
    after = page.paging?.next?.after;
  } while (after);
  const byId = new Map<string, string>();
  for (const o of owners) byId.set(o.id, [o.firstName, o.lastName].filter(Boolean).join(" ").trim() || o.email || o.id);
  return byId;
}

export async function syncHubspotDeals(): Promise<{ inPipeline: number; upserted: number; removed: number }> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN ?? "";
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN not set");

  const ownerNameById = await loadOwnerNames(token);

  // Deals — fetch only the Content Machine pipeline via the search endpoint
  // (server-side filter). Avoids paging through all ~23k deals in the account.
  const properties = [
    "dealname", "amount", "amount__excl_gst_", "dealstage", "pipeline",
    "createdate", "closedate", "start_date", "churn_date", "hubspot_owner_id",
    "content_package_type", "package_description", "commission_type", "industry_type",
    "reasons_for_churn", "company_name",
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

  // Company associations are not the source of truth in this account — most
  // Content Machine deals have none, and some companies (e.g. "Blue Light Card")
  // exist only as a deal property. The team fills in the deal's "Company name",
  // and that is what ties a base deal to its upsells and downsells.
  const [allClients, allAliases] = await Promise.all([
    db.client.findMany({ select: { id: true, name: true } }),
    db.clientAlias.findMany({ select: { clientId: true, alias: true } }),
  ]);
  const clientIndex = buildClientIndex(allClients, allAliases);

  const now = new Date();
  const rows = relevant.map((deal) => {
    const p = deal.properties;
    const stageId = p.dealstage ?? "";
    const ownerId = p.hubspot_owner_id ?? null;
    const stage = mapDealStage(stageId);
    // Settled deals link by company_name (falling back to the legacy one-deal-per-
    // client field when it is blank or names no client we hold). Live deals keep
    // the legacy link untouched.
    const clientId = isLinkableStage(stage)
      ? resolveDealClient({
          dealId: deal.id,
          companyName: p.company_name,
          index: clientIndex,
          fallbackByDealId: clientByDealId,
        }).clientId
      : clientByDealId.get(deal.id) ?? null;
    return {
      id: deal.id,
      clientId,
      name: p.dealname ?? "(unnamed)",
      amount: p.amount ? parseFloat(p.amount) : null,
      amountExGst: p.amount__excl_gst_ ? parseFloat(p.amount__excl_gst_) : null,
      ownerId,
      ownerName: ownerId ? ownerNameById.get(ownerId) ?? null : null,
      stage,
      stageLabel: STAGE_LABELS[stageId] ?? stageId,
      pipeline: "Content Machine",
      createDate: parseDate(p.createdate),
      startDate: parseDate(p.start_date),
      closeDate: parseDate(p.closedate),
      churnDate: parseDate(p.churn_date),
      churnReason: p.reasons_for_churn ?? null,
      contentPackageType: p.content_package_type ?? null,
      companyName: p.company_name ?? null,
      packageDescription: p.package_description ?? null,
      commissionType: p.commission_type ?? null,
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

  // Prune ghosts: Content Machine deals we hold that this fetch did NOT return
  // (deleted in HubSpot, or moved to another pipeline). Upsert alone never
  // removes them, so they linger forever and skew every deal-based analytic
  // (revenue, pipeline stages, divisions). The `relevant.length > 0` guard is
  // load-bearing: a transient empty/failed fetch must never delete the table.
  let removed = 0;
  if (relevant.length > 0) {
    const fetchedIds = rows.map((r) => r.id);
    const pruned = await db.hubspotDeal.deleteMany({
      where: { pipeline: "Content Machine", id: { notIn: fetchedIds } },
    });
    removed = pruned.count;
  }

  return { inPipeline: relevant.length, upserted, removed };
}

// ---------------------------------------------------------------------------
// HubSpot sales activity (calls + emails)
// ---------------------------------------------------------------------------

/**
 * Owners whose activity we track. Michael is the only rep on a dashboard today;
 * add ids here to widen it without touching the sync itself.
 */
const TRACKED_ACTIVITY_OWNERS = [MICHAEL_OWNER_ID];

/**
 * Counts only. We request the timestamp, owner and direction and nothing else —
 * no subject, body or recipient ever leaves HubSpot.
 */
const ACTIVITY_SOURCES = [
  { type: "call", object: "calls", properties: ["hs_timestamp", "hubspot_owner_id", "hs_call_direction", "hs_call_status", "hs_call_duration"] },
  { type: "email", object: "emails", properties: ["hs_timestamp", "hubspot_owner_id", "hs_email_direction", "hs_email_status"] },
] as const;

export async function syncHubspotActivity(): Promise<{ calls: number; emails: number }> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN ?? "";
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN not set");

  const ownerNameById = await loadOwnerNames(token);
  const counts: Record<string, number> = { call: 0, email: 0 };
  const now = new Date();
  const allRows: {
    id: string; type: string; ownerId: string | null; ownerName: string | null;
    timestamp: Date; direction: string | null; status: string | null;
    durationMs: number | null; lastSyncedAt: Date;
  }[] = [];

  for (const source of ACTIVITY_SOURCES) {
    const results: HubSpotResult[] = [];
    let after: string | undefined;
    do {
      const body: Record<string, unknown> = {
        filterGroups: [{ filters: [{ propertyName: "hubspot_owner_id", operator: "IN", values: TRACKED_ACTIVITY_OWNERS }] }],
        properties: source.properties,
        sorts: [{ propertyName: "hs_timestamp", direction: "DESCENDING" }],
        limit: 100,
      };
      if (after) body.after = after;
      const page = await hubspotPost<HubSpotPage>(`/crm/v3/objects/${source.object}/search`, body, token);
      results.push(...page.results);
      after = page.paging?.next?.after;
    } while (after);

    const rows = results
      .map((r) => {
        const p = r.properties;
        const ts = parseDate(p.hs_timestamp);
        if (!ts) return null; // no timestamp -> can't sit in a week bucket
        const ownerId = p.hubspot_owner_id ?? null;
        const durationRaw = p.hs_call_duration ? Number(p.hs_call_duration) : NaN;
        return {
          id: r.id,
          type: source.type as string,
          ownerId,
          ownerName: ownerId ? ownerNameById.get(ownerId) ?? null : null,
          timestamp: ts,
          direction: p.hs_call_direction ?? p.hs_email_direction ?? null,
          status: p.hs_call_status ?? p.hs_email_status ?? null,
          durationMs: Number.isFinite(durationRaw) ? durationRaw : null,
          lastSyncedAt: now,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    counts[source.type] = rows.length;
    allRows.push(...rows);
  }

  // Replace the tracked owners' activity wholesale — thousands of per-row upserts
  // are far too slow against the pooled DB, and a full replace also prunes
  // activities deleted in HubSpot for free. The length guard is load-bearing:
  // a transient empty fetch must never wipe the table.
  if (allRows.length > 0) {
    await db.$transaction([
      db.hubspotActivity.deleteMany({ where: { ownerId: { in: TRACKED_ACTIVITY_OWNERS } } }),
      db.hubspotActivity.createMany({ data: allRows, skipDuplicates: true }),
    ]);
  }

  return { calls: counts.call ?? 0, emails: counts.email ?? 0 };
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
