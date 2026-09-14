import { getDivisionDashboard } from "@/lib/analytics/division-dashboard";
import { DIVISION_KEYS } from "@/lib/divisions";
import { db } from "@/lib/db";
async function main() {
  let grand = 0;
  for (const div of DIVISION_KEYS) {
    const d = await getDivisionDashboard(div, 12);
    grand += d.currentRevenue;
    console.log(`\n=== ${div} ===`);
    console.log(`  current: $${d.currentRevenue.toLocaleString()} | ${d.currentClientCount} clients | avg deal $${d.avgDealSize.toLocaleString()}`);
    console.log("  last 4 months:");
    for (const m of d.months.slice(-4)) {
      console.log(`    ${m.label}  rev $${String(m.revenue.toLocaleString()).padStart(8)}  clients ${String(m.clientCount).padStart(2)}  new +$${m.newRevenue.toLocaleString()} (${m.newClients.length})  churn -$${m.churnedRevenue.toLocaleString()} (${m.churnedClients.length})`);
    }
    console.log(`  top clients: ${d.clients.slice(0,3).map(c=>`${c.name} $${c.revenue.toLocaleString()}`).join(" | ")}`);
  }
  console.log(`\nSum of three divisions (current): $${grand.toLocaleString()}`);
  await db.$disconnect();
}
main();
