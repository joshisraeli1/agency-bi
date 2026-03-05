import dotenv from "dotenv";
dotenv.config({ path: ".env.local", override: true });
import CryptoJS from "crypto-js";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const pgAdapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter: pgAdapter });

async function main() {
  const configs = await db.integrationConfig.findMany();
  let token: string | undefined;
  for (const c of configs) {
    if (c.provider === "hubspot" && c.configJson && c.configJson !== "{}") {
      const bytes = CryptoJS.AES.decrypt(c.configJson, process.env.ENCRYPTION_KEY!);
      const json = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
      token = json.accessToken;
    }
  }
  if (!token) token = process.env.HUBSPOT_ACCESS_TOKEN || process.env.HUBSPOT_TOKEN;
  if (!token) { console.log("No token"); return; }

  // Fetch pipeline stages for Content Machine (32895309)
  const pipelinesRes = await fetch("https://api.hubapi.com/crm/v3/pipelines/deals", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const pipelines = await pipelinesRes.json();
  for (const p of pipelines.results || []) {
    console.log(`\nPipeline: ${p.id} - ${p.label}`);
    for (const s of p.stages || []) {
      console.log(`  Stage ${s.id}: ${s.label}`);
    }
  }

  // Sum excl_gst for deals that have it, grouped by stage
  let after: string | undefined;
  const stageMap = new Map<string, { count: number; totalExGst: number; totalAmount: number }>();

  do {
    const url = new URL("https://api.hubapi.com/crm/v3/objects/deals");
    url.searchParams.set("limit", "100");
    url.searchParams.set("properties", "dealname,amount,amount__excl_gst_,dealstage,pipeline");
    if (after) url.searchParams.set("after", after);

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();

    for (const deal of data.results || []) {
      const p = deal.properties;
      if (!p.amount__excl_gst_) continue;
      const key = `${p.pipeline}|${p.dealstage}`;
      const entry = stageMap.get(key) || { count: 0, totalExGst: 0, totalAmount: 0 };
      entry.count++;
      entry.totalExGst += parseFloat(p.amount__excl_gst_) || 0;
      entry.totalAmount += parseFloat(p.amount) || 0;
      stageMap.set(key, entry);
    }
    after = data.paging?.next?.after;
  } while (after);

  console.log("\n=== excl_gst totals by pipeline|stage ===");
  for (const [key, val] of stageMap) {
    console.log(`  ${key}: ${val.count} deals, excl_gst=$${val.totalExGst.toFixed(0)}, amount=$${val.totalAmount.toFixed(0)}`);
  }

  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
