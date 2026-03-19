import pg from 'pg';

async function main() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const res = await client.query(`
    SELECT
      c.id, c.name, c."retainerValue", c."serviceType", c."dealStage",
      COALESCE(c."contentRetainer",0) as content,
      COALESCE(c."smRetainer",0) as sm,
      COALESCE(c."growthRetainer",0) as growth,
      COALESCE(c."productionRetainer",0) as production
    FROM "Client" c
    WHERE c.status = 'active'
      AND (c."hubspotDealId" IS NOT NULL OR c."hubspotCompanyId" IS NOT NULL)
      AND c."retainerValue" > 0
    ORDER BY c."retainerValue" DESC
  `);

  const timeRes = await client.query(`
    SELECT te."clientId", tm.division, SUM(te.hours) as hours
    FROM "TimeEntry" te
    JOIN "TeamMember" tm ON te."teamMemberId" = tm.id
    WHERE te."clientId" IS NOT NULL
      AND tm.division IS NOT NULL
      AND tm.division NOT IN ('Unassigned', 'NA', 'Sales')
    GROUP BY te."clientId", tm.division
    ORDER BY te."clientId", hours DESC
  `);

  const divHoursMap = new Map<string, { division: string; hours: number }[]>();
  for (const r of timeRes.rows) {
    const arr = divHoursMap.get(r.clientId) || [];
    arr.push({ division: r.division, hours: parseFloat(r.hours) });
    divHoursMap.set(r.clientId, arr);
  }

  console.log('CLIENTS WITH MISMATCHED OR MISSING DIVISION BREAKDOWN');
  console.log('='.repeat(140));

  for (const r of res.rows) {
    const divTotal = r.content + r.sm + r.growth + r.production;
    const gap = r.retainerValue - divTotal;
    const divHours = divHoursMap.get(r.id) || [];
    const divStr = divHours.map(d => `${d.division}:${d.hours.toFixed(0)}h`).join(', ');

    if (Math.abs(gap) > 1) {
      console.log(`${r.name.padEnd(42)}| retainer: $${r.retainerValue.toFixed(0).padStart(7)} | divTotal: $${divTotal.toFixed(0).padStart(7)} | gap: $${gap.toFixed(0).padStart(7)} | svc: ${(r.serviceType || 'null').padEnd(30)} | hours: ${divStr}`);
    }
  }

  // Also show clients where div retainers exceed total (overallocated)
  console.log('\nOVERALLOCATED CLIENTS (div retainers > retainerValue):');
  for (const r of res.rows) {
    const divTotal = r.content + r.sm + r.growth + r.production;
    if (divTotal > r.retainerValue + 1) {
      console.log(`${r.name.padEnd(42)}| retainer: $${r.retainerValue.toFixed(0).padStart(7)} | divTotal: $${divTotal.toFixed(0).padStart(7)} | content: $${r.content.toFixed(0)} sm: $${r.sm.toFixed(0)} growth: $${r.growth.toFixed(0)} prod: $${r.production.toFixed(0)}`);
    }
  }

  await client.end();
}
main();
