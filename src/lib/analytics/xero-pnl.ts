import { db } from "@/lib/db";
import { formatMonth } from "@/lib/utils";

export interface XeroPnlPoint {
  month: string; // YYYY-MM
  label: string; // "Aug 2026"
  revenue: number;
  expenses: number; // cost of sales + operating expenses
  netProfit: number; // Xero's own Net Profit row
  marginPercent: number | null;
}

export interface XeroPnlSeries {
  points: XeroPnlPoint[];
  /** The most recent month is partial until it closes, so it's flagged rather
   *  than dropped — a half-month bar next to full ones reads as a collapse. */
  partialMonth: string | null;
}

/**
 * Monthly Xero P&L (ex-GST, accrual) for the Expenses and Net Profit charts.
 * Figures come straight from Xero's summary rows, so they tie to the P&L report.
 */
export async function getXeroPnlSeries(months = 12): Promise<XeroPnlSeries> {
  const rows = await db.xeroPnlMonth.findMany({ orderBy: { month: "asc" } });
  const recent = rows.slice(-months);

  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const points = recent.map((r) => {
    const expenses = r.costOfSales + r.operatingExpenses;
    return {
      month: r.month,
      label: formatMonth(r.month),
      revenue: Math.round(r.totalIncome),
      expenses: Math.round(expenses),
      netProfit: Math.round(r.netProfit),
      marginPercent: r.totalIncome > 0 ? (r.netProfit / r.totalIncome) * 100 : null,
    };
  });

  return {
    points,
    partialMonth: points.some((p) => p.month === currentKey) ? currentKey : null,
  };
}
