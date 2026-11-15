import { redirect } from "next/navigation";
import { getSession, isDivisionLead, isSalesLead, hasRole } from "@/lib/auth";
import { getPnlVariance } from "@/lib/analytics/pnl-variance";
import { PnlVarianceView } from "@/components/dashboard/pnl-variance-view";

export const dynamic = "force-dynamic";

/**
 * The Xero P&L, month against month, with the HubSpot comparison written in.
 *
 * Leadership only — this is the whole agency's cost base, which no divisional
 * or sales lead is scoped to see.
 */
export default async function PnlPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (isDivisionLead(session)) redirect("/division");
  if (isSalesLead(session)) redirect("/sales");
  if (!hasRole(session, "manager")) redirect("/");

  const { month } = await searchParams;
  const data = await getPnlVariance(month);
  return <PnlVarianceView data={data} />;
}
