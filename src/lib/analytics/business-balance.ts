import { db } from "@/lib/db";

export interface BusinessBalancePeriod {
  period: string; // "2026-04" — sortable
  label: string; // "Q4 FY26"
  income: number;
  segments: { key: string; label: string; amount: number; percent: number }[];
}

/**
 * How each quarter's revenue dollar was allocated: cost of sales, direct labour,
 * overheads, and what was left as profit. Percentages are of income and the four
 * segments sum to exactly 100%, so a loss-making quarter simply carries a
 * negative profit segment.
 */
export async function getBusinessBalance(): Promise<BusinessBalancePeriod[]> {
  const periods = await db.xeroPeriodPnl.findMany({ orderBy: { period: "asc" } });

  return periods.map((y) => {
    const pct = (v: number) => (y.income > 0 ? Number(((v / y.income) * 100).toFixed(1)) : 0);
    return {
      period: y.period,
      label: y.label,
      income: Math.round(y.income),
      segments: [
        { key: "costOfSales", label: "Cost of Sales", amount: Math.round(y.costOfSalesOther), percent: pct(y.costOfSalesOther) },
        { key: "directLabour", label: "Direct Labour", amount: Math.round(y.directLabour), percent: pct(y.directLabour) },
        { key: "opex", label: "Overheads", amount: Math.round(y.operatingExpenses), percent: pct(y.operatingExpenses) },
        { key: "profit", label: "Operating Profit", amount: Math.round(y.operatingProfit), percent: pct(y.operatingProfit) },
      ],
    };
  });
}
