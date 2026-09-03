/**
 * One-off repair: "Gem" is a Black Friday lead-list import (three duplicate
 * HubSpot companies, no deals of their own). Through a stale Client.hubspotDealId
 * link, one of them captured Blue Light Card's Ads Management deal — and the
 * financial record generated from that deal is still filed under Gem, so client
 * profitability and cost allocation credit Blue Light Card's revenue to a company
 * that has never been a client.
 *
 * The deal itself was re-linked by the company_name change; this moves the
 *financial record it left behind and removes the three empty Gem records.
 *
 * Run:  npx tsx scripts/fix-gem-records.ts [--apply]
 * Without --apply it prints the plan and changes nothing.
 */
import { db } from "@/lib/db";

const APPLY = process.argv.includes("--apply");

async function main() {
  const gems = await db.client.findMany({
    where: { name: "Gem" },
    select: { id: true, status: true, hubspotCompanyId: true },
  });
  if (gems.length === 0) {
    console.log("No Gem client records found — nothing to do.");
    return;
  }

  const gemIds = gems.map((g) => g.id);
  const orphanedRecords = await db.financialRecord.findMany({
    where: { clientId: { in: gemIds } },
    select: { id: true, month: true, type: true, category: true, amount: true, externalId: true, description: true },
  });

  console.log(`Gem client records: ${gems.length}`);
  for (const g of gems) console.log(`  ${g.id}  status=${g.status}  company=${g.hubspotCompanyId}`);
  console.log(`\nFinancial records filed under Gem: ${orphanedRecords.length}`);

  // Re-home each record to whichever client now owns the deal it came from.
  const moves: { recordId: string; toClientId: string; toName: string; label: string }[] = [];
  const unresolved: string[] = [];

  for (const r of orphanedRecords) {
    const deal = r.externalId
      ? await db.hubspotDeal.findUnique({ where: { id: r.externalId }, select: { clientId: true, name: true } })
      : null;
    if (!deal?.clientId) {
      unresolved.push(`${r.month} ${r.category} $${r.amount} (deal ${r.externalId ?? "none"} has no client)`);
      continue;
    }
    const owner = await db.client.findUnique({ where: { id: deal.clientId }, select: { name: true } });
    moves.push({
      recordId: r.id,
      toClientId: deal.clientId,
      toName: owner?.name ?? deal.clientId,
      label: `${r.month} ${r.type}/${r.category} $${r.amount}`,
    });
  }

  for (const m of moves) console.log(`  MOVE  ${m.label}  ->  "${m.toName}"`);
  for (const u of unresolved) console.log(`  KEEP  ${u} — cannot resolve an owner, left in place`);

  // Only delete Gem records that are genuinely empty. A record still holding
  // deals or an unresolvable financial record is left alone for review.
  const deletable: string[] = [];
  for (const g of gems) {
    const [deals, remainingRecords, entries] = await Promise.all([
      db.hubspotDeal.count({ where: { clientId: g.id } }),
      db.financialRecord.count({ where: { clientId: g.id } }),
      db.timeEntry.count({ where: { clientId: g.id } }),
    ]);
    const movingAway = moves.filter((m) => orphanedRecords.some((r) => r.id === m.recordId)).length;
    const willBeEmpty = deals === 0 && entries === 0 && remainingRecords - movingAway <= 0;
    console.log(`  ${willBeEmpty ? "DELETE" : "KEEP  "} client ${g.id} (deals=${deals}, records=${remainingRecords}, timeEntries=${entries})`);
    if (willBeEmpty) deletable.push(g.id);
  }

  if (!APPLY) {
    console.log("\nDry run — nothing written. Re-run with --apply to make these changes.");
    return;
  }

  for (const m of moves) {
    await db.financialRecord.update({ where: { id: m.recordId }, data: { clientId: m.toClientId } });
  }
  if (deletable.length > 0) {
    await db.client.deleteMany({ where: { id: { in: deletable } } });
  }
  console.log(`\nApplied: moved ${moves.length} financial record(s), deleted ${deletable.length} Gem client record(s).`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
