import { db } from "@/lib/db";
import { decryptJson } from "@/lib/encryption";
import { syncLogger } from "@/lib/sync/logger";
import type { SyncAdapter, SyncContext } from "@/lib/sync/types";
import { toMonthKey } from "@/lib/utils";
import {
  fetchDeals,
  fetchCompanies,
  fetchContacts,
  type HubSpotDeal,
  type HubSpotCompany,
  type HubSpotContact,
} from "./hubspot";

interface HubSpotConfig {
  accessToken: string;
  pipelineId?: string;
}

async function getHubSpotConfig(): Promise<HubSpotConfig> {
  const config = await db.integrationConfig.findUnique({
    where: { provider: "hubspot" },
  });

  if (!config || !config.configJson || config.configJson === "{}") {
    throw new Error("HubSpot integration is not configured");
  }

  const decrypted = decryptJson<HubSpotConfig>(config.configJson);

  if (!decrypted.accessToken) {
    throw new Error("HubSpot access token is not configured");
  }

  return decrypted;
}

// ---------------------------------------------------------------------------
// Deals Sync Adapter
// ---------------------------------------------------------------------------
export class DealsSyncAdapter implements SyncAdapter<HubSpotDeal> {
  name = "HubSpot Deals";
  provider = "hubspot";

  async *fetchAll(context: SyncContext): AsyncGenerator<HubSpotDeal[], void, unknown> {
    const config = await getHubSpotConfig();
    syncLogger.info(
      context.importId,
      `Fetching deals${config.pipelineId ? ` from pipeline ${config.pipelineId}` : " from all pipelines"}`
    );

    for await (const batch of fetchDeals(config.accessToken, config.pipelineId)) {
      yield batch;
    }
  }

  async mapAndUpsert(
    deals: HubSpotDeal[],
    context: SyncContext
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const deal of deals) {
      try {
        const dealName = deal.properties.dealname;
        const dealId = deal.properties.hs_object_id || deal.id;
        const amount = deal.properties.amount
          ? parseFloat(deal.properties.amount)
          : null;
        const dealStage = deal.properties.dealstage;

        if (!dealName) {
          errors.push(`Deal ${dealId}: missing deal name, skipped`);
          failed++;
          continue;
        }

        // Upsert Client by hubspotDealId
        const client = await db.client.upsert({
          where: { hubspotDealId: dealId },
          create: {
            name: dealName,
            hubspotDealId: dealId,
            dealStage: dealStage ?? undefined,
            retainerValue: amount ?? undefined,
            source: "hubspot",
            status: dealStageToStatus(dealStage),
          },
          update: {
            name: dealName,
            dealStage: dealStage ?? undefined,
            retainerValue: amount ?? undefined,
          },
        });

        // Create FinancialRecord for retainer amount if present
        if (amount && amount > 0) {
          const month = deal.properties.closedate
            ? toMonthKey(new Date(deal.properties.closedate))
            : toMonthKey(new Date());

          await db.financialRecord.upsert({
            where: {
              clientId_month_type_category: {
                clientId: client.id,
                month,
                type: "retainer",
                category: "deal",
              },
            },
            create: {
              clientId: client.id,
              month,
              type: "retainer",
              category: "deal",
              amount,
              description: `HubSpot deal: ${dealName}`,
              source: "hubspot",
              externalId: dealId,
            },
            update: {
              amount,
              description: `HubSpot deal: ${dealName}`,
              externalId: dealId,
            },
          });
        }

        synced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Deal ${deal.id}: ${msg}`);
        failed++;
        syncLogger.error(context.importId, `Deal ${deal.id}: ${msg}`);
      }
    }

    return { synced, failed, errors };
  }
}

// ---------------------------------------------------------------------------
// Companies Sync Adapter
// ---------------------------------------------------------------------------
export class CompaniesSyncAdapter implements SyncAdapter<HubSpotCompany> {
  name = "HubSpot Companies";
  provider = "hubspot";

  async *fetchAll(context: SyncContext): AsyncGenerator<HubSpotCompany[], void, unknown> {
    const config = await getHubSpotConfig();
    syncLogger.info(context.importId, "Fetching companies from HubSpot");

    for await (const batch of fetchCompanies(config.accessToken)) {
      yield batch;
    }
  }

  async mapAndUpsert(
    companies: HubSpotCompany[],
    context: SyncContext
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const company of companies) {
      try {
        const companyName = company.properties.name;
        const companyId = company.properties.hs_object_id || company.id;

        if (!companyName) {
          errors.push(`Company ${companyId}: missing company name, skipped`);
          failed++;
          continue;
        }

        // Upsert Client by hubspotCompanyId
        const client = await db.client.upsert({
          where: { hubspotCompanyId: companyId },
          create: {
            name: companyName,
            hubspotCompanyId: companyId,
            industry: company.properties.industry ?? undefined,
            website: company.properties.domain ?? undefined,
            source: "hubspot",
            status: "active",
          },
          update: {
            name: companyName,
            industry: company.properties.industry ?? undefined,
            website: company.properties.domain ?? undefined,
          },
        });

        // Create ClientAlias for cross-referencing
        await db.clientAlias.upsert({
          where: {
            alias_source: {
              alias: companyName,
              source: "hubspot",
            },
          },
          create: {
            clientId: client.id,
            alias: companyName,
            source: "hubspot",
            externalId: companyId,
          },
          update: {
            clientId: client.id,
            externalId: companyId,
          },
        });

        synced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Company ${company.id}: ${msg}`);
        failed++;
        syncLogger.error(context.importId, `Company ${company.id}: ${msg}`);
      }
    }

    return { synced, failed, errors };
  }
}

// ---------------------------------------------------------------------------
// Contacts Sync Adapter (Phase 1 — light touch)
// ---------------------------------------------------------------------------
export class ContactsSyncAdapter implements SyncAdapter<HubSpotContact> {
  name = "HubSpot Contacts";
  provider = "hubspot";

  async *fetchAll(context: SyncContext): AsyncGenerator<HubSpotContact[], void, unknown> {
    const config = await getHubSpotConfig();
    syncLogger.info(context.importId, "Fetching contacts from HubSpot");

    for await (const batch of fetchContacts(config.accessToken)) {
      yield batch;
    }
  }

  async mapAndUpsert(
    contacts: HubSpotContact[],
    context: SyncContext
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    // Phase 1: count and report contacts, actual company linking in Phase 2
    let withCompany = 0;
    let withoutCompany = 0;

    for (const contact of contacts) {
      if (contact.properties.company) {
        withCompany++;
      } else {
        withoutCompany++;
      }
    }

    syncLogger.info(
      context.importId,
      `Contacts batch: ${contacts.length} total, ${withCompany} with company, ${withoutCompany} without`
    );

    // All contacts are "synced" in Phase 1 (logged only)
    return {
      synced: contacts.length,
      failed: 0,
      errors: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function dealStageToStatus(stage: string | null): string {
  if (!stage) return "prospect";

  const lowerStage = stage.toLowerCase();
  if (
    lowerStage.includes("closed") &&
    lowerStage.includes("won")
  ) {
    return "active";
  }
  if (
    lowerStage.includes("closed") &&
    lowerStage.includes("lost")
  ) {
    return "churned";
  }
  return "prospect";
}

// Factory to create the right adapter based on sync type
export function createHubSpotAdapter(
  type: "deals" | "companies" | "contacts"
): SyncAdapter {
  switch (type) {
    case "deals":
      return new DealsSyncAdapter();
    case "companies":
      return new CompaniesSyncAdapter();
    case "contacts":
      return new ContactsSyncAdapter();
    default:
      throw new Error(`Unknown HubSpot sync type: ${type}`);
  }
}
