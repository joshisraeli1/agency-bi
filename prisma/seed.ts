import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";

async function main() {
  const { PrismaClient } = await import("../src/generated/prisma/client.js");

  const dbPath = path.resolve(__dirname, "..", "dev.db");
  const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
  const prisma = new PrismaClient({ adapter });

  try {
    // ── Admin user ──────────────────────────────────────────────────
    const passwordHash = await bcrypt.hash("admin123", 12);
    await prisma.user.upsert({
      where: { email: "admin@swanstudio.com.au" },
      update: {},
      create: {
        email: "admin@swanstudio.com.au",
        name: "Admin",
        passwordHash,
        role: "admin",
      },
    });

    // ── App settings ────────────────────────────────────────────────
    await prisma.appSettings.upsert({
      where: { id: "default" },
      update: {},
      create: {
        id: "default",
        agencyName: "Swan Studio",
        currency: "AUD",
        productiveHours: 6.5,
        marginWarning: 20.0,
        marginDanger: 10.0,
        fiscalYearStart: 7,
      },
    });

    // ── Integration configs ─────────────────────────────────────────
    const providers = ["monday", "hubspot", "sheets", "xero", "slack", "gmail", "calendar"];
    for (const provider of providers) {
      await prisma.integrationConfig.upsert({
        where: { provider },
        update: {},
        create: { provider, enabled: false, configJson: "{}" },
      });
    }

    // ── Clean up business data for idempotent re-runs ───────────────
    await prisma.deliverableAssignment.deleteMany({});
    await prisma.deliverable.deleteMany({});
    await prisma.clientAssignment.deleteMany({});
    await prisma.timeEntry.deleteMany({});
    await prisma.financialRecord.deleteMany({});
    await prisma.dataImport.deleteMany({});
    await prisma.communicationLog.deleteMany({});
    await prisma.meetingLog.deleteMany({});
    await prisma.teamMember.deleteMany({});
    await prisma.client.deleteMany({});

    console.log("  Cleaned existing business data");

    // ── Clients (8) ─────────────────────────────────────────────────
    const clientDefs = [
      { name: "Velocity Motors",    status: "active",   retainerValue: 18000, industry: "Automotive" },
      { name: "Bloom Skincare",     status: "active",   retainerValue: 12000, industry: "Beauty" },
      { name: "TechNova Solutions", status: "active",   retainerValue: 22000, industry: "Technology" },
      { name: "Coastal Realty",     status: "active",   retainerValue: 8000,  industry: "Real Estate" },
      { name: "FreshBite Foods",    status: "paused",   retainerValue: 10000, industry: "Food & Beverage" },
      { name: "Apex Fitness",       status: "active",   retainerValue: 15000, industry: "Health & Fitness" },
      { name: "Wanderlust Travel",  status: "churned",  retainerValue: 6000,  industry: "Travel" },
      { name: "Helix Pharma",       status: "prospect", retainerValue: null,  industry: "Pharmaceutical" },
    ];

    const clients = [];
    for (const c of clientDefs) {
      clients.push(
        await prisma.client.create({
          data: {
            name: c.name,
            status: c.status,
            industry: c.industry,
            retainerValue: c.retainerValue,
            source: "manual",
          },
        })
      );
    }
    console.log(`  Created ${clients.length} clients`);

    // ── Team members (10) ───────────────────────────────────────────
    const memberDefs = [
      { name: "Sarah Chen",       email: "sarah@swanstudio.com.au",  division: "Creative",   role: "Senior Editor",   costType: "salary",  salary: 85000,  rate: null, empType: "full-time",  hrs: 40 },
      { name: "Marcus Johnson",   email: "marcus@swanstudio.com.au", division: "Creative",   role: "Editor",          costType: "salary",  salary: 65000,  rate: null, empType: "full-time",  hrs: 40 },
      { name: "Yuki Tanaka",      email: "yuki@swanstudio.com.au",   division: "Creative",   role: "Animator",        costType: "salary",  salary: 75000,  rate: null, empType: "full-time",  hrs: 40 },
      { name: "Priya Sharma",     email: "priya@swanstudio.com.au",  division: "Creative",   role: "Designer",        costType: "salary",  salary: 70000,  rate: null, empType: "full-time",  hrs: 40 },
      { name: "Liam O'Brien",     email: "liam@swanstudio.com.au",   division: "Strategy",   role: "Account Manager", costType: "salary",  salary: 90000,  rate: null, empType: "full-time",  hrs: 40 },
      { name: "Elena Rodriguez",  email: "elena@swanstudio.com.au",  division: "Strategy",   role: "Account Manager", costType: "salary",  salary: 88000,  rate: null, empType: "full-time",  hrs: 40 },
      { name: "Tom Williams",     email: "tom@swanstudio.com.au",    division: "Production", role: "Producer",        costType: "salary",  salary: 72000,  rate: null, empType: "full-time",  hrs: 40 },
      { name: "Aisha Patel",      email: "aisha@swanstudio.com.au",  division: "Production", role: "Producer",        costType: "salary",  salary: 68000,  rate: null, empType: "full-time",  hrs: 40 },
      { name: "Jake Morrison",    email: "jake@swanstudio.com.au",   division: "Production", role: "Motion Designer", costType: "salary",  salary: 78000,  rate: null, empType: "full-time",  hrs: 40 },
      { name: "Dan Lee",          email: "dan@swanstudio.com.au",    division: "Production", role: "Editor",          costType: "hourly",  salary: null,   rate: 65,   empType: "contractor", hrs: 20 },
    ];

    const members = [];
    for (const m of memberDefs) {
      members.push(
        await prisma.teamMember.create({
          data: {
            name: m.name,
            email: m.email,
            role: m.role,
            division: m.division,
            employmentType: m.empType,
            costType: m.costType,
            annualSalary: m.salary,
            hourlyRate: m.rate,
            weeklyHours: m.hrs,
            source: "manual",
            active: true,
          },
        })
      );
    }
    console.log(`  Created ${members.length} team members`);

    // ── Financial records (6 months) ────────────────────────────────
    const months = ["2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02"];

    // Cost as % of retainer per client — Coastal Realty (idx 3) at 92% triggers at-risk
    const costPcts = [0.70, 0.65, 0.75, 0.92, 0.60, 0.80];

    let finCount = 0;

    // Active + paused clients (indices 0–5): all 6 months
    for (let ci = 0; ci < 6; ci++) {
      for (let mi = 0; mi < months.length; mi++) {
        const retainer = clientDefs[ci].retainerValue!;
        // Deterministic ±3 % swing per month for margin diversity
        const variation = 1 + ((mi % 3) - 1) * 0.03;
        const cost = Math.round(retainer * costPcts[ci] * variation);

        await prisma.financialRecord.create({
          data: { clientId: clients[ci].id, month: months[mi], type: "retainer", amount: retainer, source: "manual" },
        });
        await prisma.financialRecord.create({
          data: { clientId: clients[ci].id, month: months[mi], type: "cost", amount: cost, source: "manual" },
        });
        finCount += 2;
      }
    }

    // Wanderlust Travel (index 6, churned): first 2 months only
    for (let mi = 0; mi < 2; mi++) {
      await prisma.financialRecord.create({
        data: { clientId: clients[6].id, month: months[mi], type: "retainer", amount: 6000, source: "manual" },
      });
      await prisma.financialRecord.create({
        data: { clientId: clients[6].id, month: months[mi], type: "cost", amount: 4320, source: "manual" },
      });
      finCount += 2;
    }

    // 3 one-off project records
    await prisma.financialRecord.create({
      data: { clientId: clients[0].id, month: "2025-10", type: "project", category: "Brand Video", amount: 5500, description: "Velocity Motors brand campaign video", source: "manual" },
    });
    await prisma.financialRecord.create({
      data: { clientId: clients[2].id, month: "2025-12", type: "project", category: "Product Launch", amount: 8000, description: "TechNova product launch assets", source: "manual" },
    });
    await prisma.financialRecord.create({
      data: { clientId: clients[5].id, month: "2026-01", type: "project", category: "Social Campaign", amount: 3500, description: "Apex Fitness social media campaign", source: "manual" },
    });
    finCount += 3;

    console.log(`  Created ${finCount} financial records`);

    // ── Client assignments ──────────────────────────────────────────
    // Each active client: 1 account manager (primary) + 1–2 creative roles
    const caData = [
      // Velocity Motors: Liam (AM), Sarah (editor), Jake (motion)
      { ci: 0, mi: 4, role: "account_manager", primary: true },
      { ci: 0, mi: 0, role: "editor",          primary: false },
      { ci: 0, mi: 8, role: "creative_lead",   primary: false },
      // Bloom Skincare: Elena (AM), Priya (designer)
      { ci: 1, mi: 5, role: "account_manager", primary: true },
      { ci: 1, mi: 3, role: "creative_lead",   primary: false },
      // TechNova Solutions: Liam (AM), Yuki (animator), Marcus (editor)
      { ci: 2, mi: 4, role: "account_manager", primary: true },
      { ci: 2, mi: 2, role: "creative_lead",   primary: false },
      { ci: 2, mi: 1, role: "editor",          primary: false },
      // Coastal Realty: Elena (AM), Sarah (editor)
      { ci: 3, mi: 5, role: "account_manager", primary: true },
      { ci: 3, mi: 0, role: "editor",          primary: false },
      // FreshBite Foods: Liam (AM), Priya (designer)
      { ci: 4, mi: 4, role: "account_manager", primary: true },
      { ci: 4, mi: 3, role: "creative_lead",   primary: false },
      // Apex Fitness: Elena (AM), Marcus (editor), Yuki (animator)
      { ci: 5, mi: 5, role: "account_manager", primary: true },
      { ci: 5, mi: 1, role: "editor",          primary: false },
      { ci: 5, mi: 2, role: "creative_lead",   primary: false },
    ];

    for (const a of caData) {
      await prisma.clientAssignment.create({
        data: {
          clientId: clients[a.ci].id,
          teamMemberId: members[a.mi].id,
          role: a.role,
          isPrimary: a.primary,
        },
      });
    }
    console.log(`  Created ${caData.length} client assignments`);

    // ── Time entries (~300 over 6 months) ───────────────────────────
    // Build weekday list: Sep 2025 – Feb 2026
    const weekdays: Date[] = [];
    const cursor = new Date("2025-09-01");
    const end = new Date("2026-02-28");
    while (cursor <= end) {
      if (cursor.getDay() >= 1 && cursor.getDay() <= 5) {
        weekdays.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Which clients each member logs time against
    const memberClients: number[][] = [
      [0, 3],    // Sarah → Velocity, Coastal
      [2, 5],    // Marcus → TechNova, Apex
      [0, 2],    // Yuki → Velocity, TechNova
      [1, 4],    // Priya → Bloom, FreshBite
      [0, 2, 4], // Liam → Velocity, TechNova, FreshBite
      [1, 3, 5], // Elena → Bloom, Coastal, Apex
      [0, 2],    // Tom → Velocity, TechNova
      [5, 4],    // Aisha → Apex, FreshBite
      [0, 5],    // Jake → Velocity, Apex
      [2, 6],    // Dan → TechNova, Wanderlust
    ];

    // Stride per member controls entry density (~300 total)
    const strides = [4, 4, 4, 5, 5, 5, 4, 5, 4, 6];
    const hourValues = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 6];
    const descs = [
      "Video editing", "Client review meeting", "Animation work",
      "Design iteration", "Content creation", "Strategy session",
      "Production planning", "Asset preparation", "Motion graphics",
      "Post-production", "Storyboarding", "Colour grading",
    ];

    let entryCount = 0;
    for (let mi = 0; mi < members.length; mi++) {
      const assignedClients = memberClients[mi];
      const stride = strides[mi];

      for (let wi = 0; wi < weekdays.length; wi += stride) {
        const date = weekdays[wi];
        const isOverhead = (mi + wi) % 10 === 0;

        let clientId: string | null = null;
        if (!isOverhead) {
          const ci = assignedClients[(mi + wi) % assignedClients.length];
          // Wanderlust (idx 6) churned after Oct 2025
          if (ci === 6 && date >= new Date("2025-11-01")) continue;
          clientId = clients[ci].id;
        }

        const hours = hourValues[(mi * 7 + wi) % hourValues.length];
        const desc = isOverhead
          ? "Internal meeting / admin"
          : descs[(mi * 3 + wi) % descs.length];

        await prisma.timeEntry.create({
          data: {
            clientId,
            teamMemberId: members[mi].id,
            date,
            hours,
            description: desc,
            isOverhead,
            source: "manual",
          },
        });
        entryCount++;
      }
    }
    console.log(`  Created ${entryCount} time entries`);

    // ── Deliverables (20) ───────────────────────────────────────────
    const delDefs = [
      // in_progress (5)
      { name: "VM Dealer Network Video",        ci: 0, status: "in_progress", rev: 0 },
      { name: "TN Onboarding Tutorial Series",  ci: 2, status: "in_progress", rev: 0 },
      { name: "FB Recipe Video Series",         ci: 4, status: "in_progress", rev: 0 },
      { name: "Apex Workout Series — Jan",      ci: 5, status: "in_progress", rev: 0 },
      { name: "Apex App Promo",                 ci: 5, status: "in_progress", rev: 1 },
      // review (4)
      { name: "Bloom Influencer Collab Edit",   ci: 1, status: "review",     rev: 2 },
      { name: "TN Webinar Opening Sequence",    ci: 2, status: "review",     rev: 1 },
      { name: "FB Packaging Reveal",            ci: 4, status: "review",     rev: 1 },
      { name: "Apex Social Ads — Q1",           ci: 5, status: "review",     rev: 3 },
      // completed (6)
      { name: "Bloom Instagram Reels — Q4",     ci: 1, status: "completed",  rev: 1 },
      { name: "TN Annual Report Animation",     ci: 2, status: "completed",  rev: 1 },
      { name: "CR Virtual Tour Template",       ci: 3, status: "completed",  rev: 2 },
      { name: "Apex Trainer Intro Videos",      ci: 5, status: "completed",  rev: 2 },
      { name: "WT Destination Montage",         ci: 6, status: "completed",  rev: 2 },
      { name: "WT Booking Platform Video",      ci: 6, status: "completed",  rev: 1 },
      // delivered (5)
      { name: "VM Brand Sizzle Reel",           ci: 0, status: "delivered",  rev: 2 },
      { name: "VM Monthly Social Pack — Oct",   ci: 0, status: "delivered",  rev: 1 },
      { name: "Bloom Product Launch Video",     ci: 1, status: "delivered",  rev: 3 },
      { name: "TN SaaS Demo Video",             ci: 2, status: "delivered",  rev: 4 },
      { name: "CR Property Showcase — Nov",     ci: 3, status: "delivered",  rev: 1 },
    ];

    const deliverables = [];
    for (let di = 0; di < delDefs.length; di++) {
      const dd = delDefs[di];
      const dueDate = new Date("2025-09-15");
      dueDate.setDate(dueDate.getDate() + ((di * 11) % 170));

      deliverables.push(
        await prisma.deliverable.create({
          data: {
            clientId: clients[dd.ci].id,
            name: dd.name,
            status: dd.status,
            revisionCount: dd.rev,
            dueDate,
            completedDate: ["completed", "delivered"].includes(dd.status)
              ? new Date(dueDate.getTime() - 2 * 86400000)
              : null,
            source: "manual",
          },
        })
      );
    }
    console.log(`  Created ${deliverables.length} deliverables`);

    // ── Deliverable assignments (1–3 per deliverable) ───────────────
    const daRoles = ["editor", "animator", "designer", "reviewer"];
    const cpIndices = [0, 1, 2, 3, 6, 7, 8, 9]; // creative + production members
    let daCount = 0;

    for (let di = 0; di < deliverables.length; di++) {
      const numAssign = 1 + (di % 3); // cycles 1, 2, 3
      const used = new Set<number>();

      for (let ai = 0; ai < numAssign; ai++) {
        const idx = cpIndices[(di * 3 + ai * 5) % cpIndices.length];
        if (used.has(idx)) continue;
        used.add(idx);

        await prisma.deliverableAssignment.create({
          data: {
            deliverableId: deliverables[di].id,
            teamMemberId: members[idx].id,
            role: daRoles[(di + ai) % daRoles.length],
          },
        });
        daCount++;
      }
    }
    console.log(`  Created ${daCount} deliverable assignments`);

    // ── Data imports (2 completed) ──────────────────────────────────
    const now = new Date();
    await prisma.dataImport.create({
      data: {
        provider: "monday",
        syncType: "full",
        status: "completed",
        recordsFound: 156,
        recordsSynced: 152,
        recordsFailed: 4,
        startedAt: new Date(now.getTime() - 2 * 86400000),
        completedAt: new Date(now.getTime() - 2 * 86400000 + 45000),
        triggeredBy: "admin@swanstudio.com.au",
      },
    });
    await prisma.dataImport.create({
      data: {
        provider: "hubspot",
        syncType: "incremental",
        status: "completed",
        recordsFound: 42,
        recordsSynced: 42,
        recordsFailed: 0,
        startedAt: new Date(now.getTime() - 86400000),
        completedAt: new Date(now.getTime() - 86400000 + 12000),
        triggeredBy: "admin@swanstudio.com.au",
      },
    });
    console.log("  Created 2 data imports");

    console.log("\nSeed completed successfully!");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
