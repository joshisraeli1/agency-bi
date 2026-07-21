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
  stage: string | null;
  stageLabel: string | null;
  amount: number | null;
  amountExGst: number | null;
  churnDate: Date | null;
};

const dealValue = (d: PipelineDealInput): number =>
  Math.round(d.amountExGst ?? d.amount ?? 0);

/**
 * Buckets synced HubSpot deals into four pipeline-stage columns as a snapshot
 * "as of now". Columns are NOT mutually exclusive: a closed-won deal with a
 * past churn date appears in BOTH "Closed Won" (the full book) and "Churned"
 * (the breakout of deals that have actually churned).
 *
 *  - Very Warm    : stageLabel === "Very Warm"
 *  - Contract out : stageLabel === "Contract out"
 *  - Closed Won   : stage === "closed_won" (any churn state)
 *  - Churned      : churnDate set and on/before `now`
 */
export function bucketPipelineStages(
  deals: PipelineDealInput[],
  excludedIds: Set<string>,
  now: Date
): PipelineStageColumn[] {
  const columns: PipelineStageColumn[] = [
    { stage: "Very Warm", total: 0, deals: [] },
    { stage: "Contract out", total: 0, deals: [] },
    { stage: "Closed Won", total: 0, deals: [] },
    { stage: "Churned", total: 0, deals: [] },
  ];
  const [veryWarm, contractOut, closedWon, churned] = columns;

  for (const d of deals) {
    if (d.clientId && excludedIds.has(d.clientId)) continue;
    const amount = dealValue(d);

    if (d.stageLabel === "Very Warm") {
      veryWarm.deals.push({ name: d.name, amount });
    }
    if (d.stageLabel === "Contract out") {
      contractOut.deals.push({ name: d.name, amount });
    }
    if (d.stage === "closed_won") {
      closedWon.deals.push({ name: d.name, amount });
    }
    if (d.churnDate && d.churnDate <= now) {
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
 * Current-time snapshot of revenue by pipeline stage for the Overview page.
 */
export async function getPipelineStageSnapshot(): Promise<PipelineStageColumn[]> {
  const { db } = await import("@/lib/db");
  const { getExcludedClientIds } = await import("./excluded-clients");
  const [excludedIds, deals] = await Promise.all([
    getExcludedClientIds(),
    db.hubspotDeal.findMany({
      where: {
        OR: [
          { stageLabel: "Very Warm" },
          { stageLabel: "Contract out" },
          { stage: "closed_won" },
          { churnDate: { not: null } },
        ],
      },
      select: {
        name: true,
        clientId: true,
        stage: true,
        stageLabel: true,
        amount: true,
        amountExGst: true,
        churnDate: true,
      },
    }),
  ]);

  return bucketPipelineStages(deals, excludedIds, new Date());
}
