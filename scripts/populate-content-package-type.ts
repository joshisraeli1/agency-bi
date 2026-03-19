import pg from "pg";

const DIVISION_MAP: Record<string, string> = {
  "Social Media Management": "Organic Social",
  "Social and Ads Management": "Organic Social + Paid Media",
  "Ads Management": "Paid Media",
  "Content Delivery Paid": "Ad Creative",
  "Content Delivery Organic": "Ad Creative",
  "Content +": "Ad Creative",
  "Urban Swan Feature": "Ad Creative",
  "Legacy Urban Swan Package": "Ad Creative",
  "One-off": "Ad Creative",
  "Other": "Ad Creative",
};

async function main() {
  const dbClient = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await dbClient.connect();

  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error("HUBSPOT_ACCESS_TOKEN not set");

  // Fetch all deals from HubSpot with content_package_type
  let after: string | undefined;
  const dealPkgMap = new Map<string, string>(); // dealId -> pkg
  const companyPkgMap = new Map<string, string>(); // companyId -> pkg

  do {
    const params = new URLSearchParams({
      limit: "100",
      properties: "dealname,content_package_type,hs_object_id",
      associations: "companies",
    });
    if (after) params.set("after", after);

    const res = await fetch(
      "https://api.hubapi.com/crm/v3/objects/deals?" + params,
      { headers: { Authorization: "Bearer " + token } }
    );
    const data = await res.json();

    for (const deal of data.results) {
      const dealId = deal.properties.hs_object_id || deal.id;
      const companyId = deal.associations?.companies?.results?.[0]?.id;
      const pkg = deal.properties.content_package_type;
      if (pkg) {
        dealPkgMap.set(dealId, pkg);
        if (companyId) companyPkgMap.set(companyId, pkg);
      }
    }

    after = data.paging?.next?.after;
  } while (after);

  console.log(
    `Fetched ${dealPkgMap.size} deals, ${companyPkgMap.size} companies with content_package_type`
  );

  // Get all clients with HubSpot IDs
  const clients = await dbClient.query(`
    SELECT id, name, "hubspotDealId", "hubspotCompanyId", "retainerValue"
    FROM "Client"
    WHERE "hubspotDealId" IS NOT NULL OR "hubspotCompanyId" IS NOT NULL
  `);

  let updated = 0;
  for (const c of clients.rows) {
    let pkg: string | null = null;
    if (c.hubspotDealId) pkg = dealPkgMap.get(c.hubspotDealId) || null;
    if (pkg === null && c.hubspotCompanyId)
      pkg = companyPkgMap.get(c.hubspotCompanyId) || null;

    if (pkg) {
      await dbClient.query(
        'UPDATE "Client" SET "contentPackageType" = $1 WHERE id = $2',
        [pkg, c.id]
      );
      const div = DIVISION_MAP[pkg] || "Ad Creative";
      console.log(
        `${c.name.padEnd(42)} -> ${pkg.padEnd(30)} -> ${div} ($${c.retainerValue || 0})`
      );
      updated++;
    } else {
      console.log(`${c.name.padEnd(42)} -> NO PACKAGE TYPE`);
    }
  }

  console.log(`\nUpdated ${updated} clients`);

  // Show division revenue summary
  const result = await dbClient.query(`
    SELECT "contentPackageType", COUNT(*) as count, SUM("retainerValue") as total
    FROM "Client"
    WHERE status = 'active' AND ("hubspotDealId" IS NOT NULL OR "hubspotCompanyId" IS NOT NULL) AND "retainerValue" > 0
    GROUP BY "contentPackageType"
    ORDER BY total DESC
  `);
  console.log("\nRevenue by contentPackageType:");
  let grandTotal = 0;
  for (const r of result.rows) {
    const div = DIVISION_MAP[r.contentPackageType] || "Ad Creative";
    console.log(
      `${(r.contentPackageType || "NULL").padEnd(35)}| div: ${div.padEnd(20)}| clients: ${r.count} | revenue: $${Math.round(r.total)}`
    );
    grandTotal += Math.round(r.total);
  }
  console.log(`\nGrand total: $${grandTotal}`);

  await dbClient.end();
}

main();
