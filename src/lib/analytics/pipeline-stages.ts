export interface PipelineDeal {
  name: string;
  amount: number;
}

export interface PipelineStageColumn {
  stage: string;
  total: number;
  deals: PipelineDeal[];
}

export type PipelineDealInput = {
  name: string;
  clientId: string | null;
  stageLabel: string | null;
  amount: number | null;
  amountExGst: number | null;
  startDate: Date | null;
  churnDate?: Date | null;
};

// The raw HubSpot stage labels each column collects. The two "Churned but still
// active" / "Current (Not Paying)" labels merge into one "Churned" column; the
// plain "Churned" label (fully-lost deals) is intentionally not listed.
const CHURNED_LABELS = ["Churned but still active", "Current (Not Paying)"];
const QUERY_LABELS = ["Very Warm", "Contract out", "Closed Won", ...CHURNED_LABELS];

// Every column is reported ex-GST so the totals reconcile with the Overview's
// ex-GST revenue tile. Very Warm / Contract out deals store no ex-GST value, so
// we derive it from the inc-GST `amount` by removing the 10% GST — the same
// `amount / 1.1` fallback used in michael-sales.ts.
const GST_MULTIPLIER = 1.1;
const dealValue = (d: PipelineDealInput): number =>
  Math.round(d.amountExGst ?? (d.amount != null ? d.amount / GST_MULTIPLIER : 0));

/**
 * Buckets synced HubSpot deals into pipeline-stage columns, keyed on the raw
 * `stageLabel` (with Contract out split by start-date presence). Columns are
 * mutually exclusive (one deal → one column), except Outgoing, which is a view
 * of Closed Won: a deal still pays until its churn date, so it stays in both.
 *
 *  - Very Warm    : stageLabel === "Very Warm"
 *  - Contract out : stageLabel === "Contract out" AND no start date (not yet scheduled)
 *  - Incoming     : stageLabel === "Contract out" AND a start date is set
 *                   (signed / 100% starting — matches the forecast waterfall's "incoming")
 *  - Closed Won   : stageLabel === "Closed Won"
 *  - Outgoing     : Closed Won with a churn date still ahead — revenue that is
 *                   leaving (matches the forecast waterfall's "outgoing")
 *  - Churned (still active) : stageLabel ∈ {"Churned but still active", "Current (Not Paying)"}
 *
 * `now` decides which churn dates are still ahead, for Outgoing.
 */
export function bucketPipelineStages(
  deals: PipelineDealInput[],
  excludedIds: Set<string>,
  now: Date
): PipelineStageColumn[] {
  const columns: PipelineStageColumn[] = [
    { stage: "Very Warm", total: 0, deals: [] },
    { stage: "Contract out", total: 0, deals: [] },
    { stage: "Incoming", total: 0, deals: [] },
    { stage: "Outgoing", total: 0, deals: [] },
    { stage: "Closed Won", total: 0, deals: [] },
    { stage: "Churned (still active)", total: 0, deals: [] },
  ];
  const [veryWarm, contractOut, incoming, outgoing, closedWon, churned] = columns;

  for (const d of deals) {
    if (d.clientId && excludedIds.has(d.clientId)) continue;
    const amount = dealValue(d);

    if (d.stageLabel === "Very Warm") {
      veryWarm.deals.push({ name: d.name, amount });
    } else if (d.stageLabel === "Contract out") {
      // A start date means the deal is signed and scheduled — "Incoming"
      // revenue, matching the forecast waterfall. No start date → still Contract out.
      (d.startDate ? incoming : contractOut).deals.push({ name: d.name, amount });
    } else if (d.stageLabel === "Closed Won") {
      closedWon.deals.push({ name: d.name, amount });
      if (d.churnDate && d.churnDate > now) outgoing.deals.push({ name: d.name, amount });
    } else if (d.stageLabel && CHURNED_LABELS.includes(d.stageLabel)) {
      churned.deals.push({ name: d.name, amount });
    }
  }

  for (const col of columns) {
    col.deals.sort((a, b) => b.amount - a.amount);
    col.total = col.deals.reduce((s, d) => s + d.amount, 0);
  }
  return columns;
}

/**
 * Current snapshot of revenue by pipeline stage for the Overview page.
 */
export async function getPipelineStageSnapshot(): Promise<PipelineStageColumn[]> {
  // `db` and `getExcludedClientIds` are imported lazily so that importing this
  // module for the pure `bucketPipelineStages` function (e.g. from the tsx test
  // script) does not trigger Prisma client initialization, which needs
  // DATABASE_URL at load. (`excluded-clients` imports `db` at its top.)
  const [{ db }, { getExcludedClientIds }] = await Promise.all([
    import("@/lib/db"),
    import("./excluded-clients"),
  ]);
  const [excludedIds, deals] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: { stageLabel: { in: QUERY_LABELS } },
      select: {
        name: true,
        clientId: true,
        stageLabel: true,
        amount: true,
        amountExGst: true,
        startDate: true,
        churnDate: true,
      },
    }),
  ]);

  return bucketPipelineStages(deals, excludedIds, new Date());
}
