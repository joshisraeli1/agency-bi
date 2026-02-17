import type { SyncAdapter, SyncContext } from "@/lib/sync/types";
import { syncLogger } from "@/lib/sync/logger";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/encryption";
import {
  getAuthClient,
  readNamedSheet,
  buildColumnMap,
  getCellByHeader,
} from "./sheets";
import type { JWT } from "googleapis-common";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface SheetsConfig {
  serviceAccountEmail: string;
  privateKey: string;
  sheetId: string;
}

async function loadSheetsConfig(): Promise<SheetsConfig> {
  const integration = await db.integrationConfig.findUnique({
    where: { provider: "sheets" },
  });

  if (!integration) {
    throw new Error("Google Sheets integration not configured");
  }

  const config = decryptJson<SheetsConfig>(integration.configJson);
  if (!config.serviceAccountEmail || !config.privateKey || !config.sheetId) {
    throw new Error(
      "Google Sheets config incomplete: need serviceAccountEmail, privateKey, and sheetId"
    );
  }

  return config;
}

function getAuth(config: SheetsConfig): JWT {
  return getAuthClient(config.serviceAccountEmail, config.privateKey);
}

function parseFloat_(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Look up a client by name, case-insensitive.
 * Falls back to checking ClientAlias table if no direct name match.
 */
async function findClientByName(name: string): Promise<string | null> {
  if (!name) return null;

  // Direct match (case-insensitive via lowering both sides)
  const clients = await db.client.findMany({
    where: { name: { equals: name } },
    select: { id: true, name: true },
  });

  // Try exact match first
  const exactMatch = clients.find(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  );
  if (exactMatch) return exactMatch.id;

  // Try alias match
  const aliases = await db.clientAlias.findMany({
    where: { alias: { equals: name } },
    select: { clientId: true, alias: true },
  });
  const aliasMatch = aliases.find(
    (a) => a.alias.toLowerCase() === name.toLowerCase()
  );
  if (aliasMatch) return aliasMatch.clientId;

  return null;
}

// ---------------------------------------------------------------------------
// 1. Salary Data Sync Adapter (tab: "4.3 Salary Data")
// ---------------------------------------------------------------------------

interface SalaryRow {
  row: string[];
  columnMap: Map<string, number>;
  rowIndex: number;
}

export class SalaryDataSyncAdapter implements SyncAdapter<SalaryRow> {
  name = "Google Sheets - Salary Data";
  provider = "sheets";

  async *fetchAll(context: SyncContext): AsyncGenerator<SalaryRow[], void, unknown> {
    const config = await loadSheetsConfig();
    const auth = getAuth(config);

    syncLogger.info(context.importId, "Reading '4.3 Salary Data' tab...");
    const { headers, rows } = await readNamedSheet(auth, config.sheetId, "4.3 Salary Data");

    if (headers.length === 0) {
      syncLogger.info(context.importId, "No headers found in salary data tab");
      return;
    }

    const columnMap = buildColumnMap(headers);
    const items: SalaryRow[] = rows.map((row, idx) => ({
      row,
      columnMap,
      rowIndex: idx + 2, // +2 because row 1 is headers, data starts at row 2
    }));

    // Yield in batches of 50
    for (let i = 0; i < items.length; i += 50) {
      yield items.slice(i, i + 50);
    }
  }

  async mapAndUpsert(
    items: SalaryRow[],
    context: SyncContext
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const { row, columnMap, rowIndex } of items) {
      try {
        const name = getCellByHeader(row, columnMap, "name");
        if (!name) {
          continue; // Skip empty rows
        }

        const email = getCellByHeader(row, columnMap, "email") || null;
        const role = getCellByHeader(row, columnMap, "role") || null;
        const division = getCellByHeader(row, columnMap, "division") || null;
        const location = getCellByHeader(row, columnMap, "location") || null;
        const employmentType =
          getCellByHeader(row, columnMap, "employment type") ||
          getCellByHeader(row, columnMap, "type") ||
          null;
        const costType =
          getCellByHeader(row, columnMap, "cost type") ||
          getCellByHeader(row, columnMap, "pay type") ||
          null;
        const annualSalary =
          parseFloat_(getCellByHeader(row, columnMap, "salary")) ??
          parseFloat_(getCellByHeader(row, columnMap, "annual salary")) ??
          null;
        const hourlyRate =
          parseFloat_(getCellByHeader(row, columnMap, "hourly rate")) ?? null;
        const weeklyHours =
          parseFloat_(getCellByHeader(row, columnMap, "weekly hours")) ??
          parseFloat_(getCellByHeader(row, columnMap, "hours per week")) ??
          null;

        // Upsert by email if available, otherwise by name + source
        if (email) {
          await db.teamMember.upsert({
            where: { email },
            create: {
              name,
              email,
              role,
              division,
              location,
              employmentType,
              costType,
              annualSalary,
              hourlyRate,
              weeklyHours,
              sheetsRowIndex: rowIndex,
              source: "sheets",
            },
            update: {
              name,
              role,
              division,
              location,
              employmentType,
              costType,
              annualSalary,
              hourlyRate,
              weeklyHours,
              sheetsRowIndex: rowIndex,
            },
          });
        } else {
          // Find existing by name and source, or create
          const existing = await db.teamMember.findFirst({
            where: {
              name: { equals: name },
              source: "sheets",
            },
          });

          if (existing) {
            await db.teamMember.update({
              where: { id: existing.id },
              data: {
                role,
                division,
                location,
                employmentType,
                costType,
                annualSalary,
                hourlyRate,
                weeklyHours,
                sheetsRowIndex: rowIndex,
              },
            });
          } else {
            await db.teamMember.create({
              data: {
                name,
                email,
                role,
                division,
                location,
                employmentType,
                costType,
                annualSalary,
                hourlyRate,
                weeklyHours,
                sheetsRowIndex: rowIndex,
                source: "sheets",
              },
            });
          }
        }

        synced++;
      } catch (err) {
        failed++;
        const msg = `Row ${rowIndex}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        await syncLogger.error(context.importId, msg);
      }
    }

    return { synced, failed, errors };
  }
}

// ---------------------------------------------------------------------------
// 2. Client Data Sync Adapter (tab: "4.2 Client Data")
// ---------------------------------------------------------------------------

interface ClientRow {
  row: string[];
  columnMap: Map<string, number>;
  rowIndex: number;
}

export class ClientDataSyncAdapter implements SyncAdapter<ClientRow> {
  name = "Google Sheets - Client Data";
  provider = "sheets";

  async *fetchAll(context: SyncContext): AsyncGenerator<ClientRow[], void, unknown> {
    const config = await loadSheetsConfig();
    const auth = getAuth(config);

    syncLogger.info(context.importId, "Reading '4.2 Client Data' tab...");
    const { headers, rows } = await readNamedSheet(auth, config.sheetId, "4.2 Client Data");

    if (headers.length === 0) {
      syncLogger.info(context.importId, "No headers found in client data tab");
      return;
    }

    const columnMap = buildColumnMap(headers);
    const items: ClientRow[] = rows.map((row, idx) => ({
      row,
      columnMap,
      rowIndex: idx + 2,
    }));

    for (let i = 0; i < items.length; i += 50) {
      yield items.slice(i, i + 50);
    }
  }

  async mapAndUpsert(
    items: ClientRow[],
    context: SyncContext
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const { row, columnMap, rowIndex } of items) {
      try {
        const name =
          getCellByHeader(row, columnMap, "client name") ||
          getCellByHeader(row, columnMap, "client") ||
          getCellByHeader(row, columnMap, "name");
        if (!name) {
          continue; // Skip empty rows
        }

        const retainerValue =
          parseFloat_(getCellByHeader(row, columnMap, "retainer value")) ??
          parseFloat_(getCellByHeader(row, columnMap, "retainer")) ??
          null;
        const dealStage =
          getCellByHeader(row, columnMap, "deal stage") ||
          getCellByHeader(row, columnMap, "stage") ||
          null;
        const packageName =
          getCellByHeader(row, columnMap, "package") ||
          getCellByHeader(row, columnMap, "package name") ||
          null;
        const status =
          getCellByHeader(row, columnMap, "status") || "active";

        // Check if a client already exists from HubSpot — don't overwrite HubSpot data
        const existing = await db.client.findFirst({
          where: {
            name: { equals: name },
          },
        });

        if (existing) {
          // Only update fields that are currently null (supplement, don't overwrite)
          const updateData: Record<string, unknown> = {
            sheetsRowIndex: rowIndex,
          };
          if (existing.retainerValue === null && retainerValue !== null) {
            updateData.retainerValue = retainerValue;
          }
          if (!existing.dealStage && dealStage) {
            updateData.dealStage = dealStage;
          }

          await db.client.update({
            where: { id: existing.id },
            data: updateData,
          });
        } else {
          // No existing client; create from sheets data
          await db.client.create({
            data: {
              name,
              status: status.toLowerCase(),
              retainerValue,
              dealStage,
              sheetsRowIndex: rowIndex,
              source: "sheets",
              notes: packageName ? `Package: ${packageName}` : null,
            },
          });
        }

        synced++;
      } catch (err) {
        failed++;
        const msg = `Row ${rowIndex}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        await syncLogger.error(context.importId, msg);
      }
    }

    return { synced, failed, errors };
  }
}

// ---------------------------------------------------------------------------
// 3. Segmented Cost Data Sync Adapter (tab: "4.4 Segmented Cost Data")
// ---------------------------------------------------------------------------

interface CostRow {
  row: string[];
  columnMap: Map<string, number>;
  rowIndex: number;
}

export class SegmentedCostDataSyncAdapter implements SyncAdapter<CostRow> {
  name = "Google Sheets - Segmented Cost Data";
  provider = "sheets";

  async *fetchAll(context: SyncContext): AsyncGenerator<CostRow[], void, unknown> {
    const config = await loadSheetsConfig();
    const auth = getAuth(config);

    syncLogger.info(context.importId, "Reading '4.4 Segmented Cost Data' tab...");
    const { headers, rows } = await readNamedSheet(
      auth,
      config.sheetId,
      "4.4 Segmented Cost Data"
    );

    if (headers.length === 0) {
      syncLogger.info(context.importId, "No headers found in cost data tab");
      return;
    }

    const columnMap = buildColumnMap(headers);
    const items: CostRow[] = rows.map((row, idx) => ({
      row,
      columnMap,
      rowIndex: idx + 2,
    }));

    for (let i = 0; i < items.length; i += 50) {
      yield items.slice(i, i + 50);
    }
  }

  async mapAndUpsert(
    items: CostRow[],
    context: SyncContext
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const { row, columnMap, rowIndex } of items) {
      try {
        const clientName =
          getCellByHeader(row, columnMap, "client name") ||
          getCellByHeader(row, columnMap, "client") ||
          getCellByHeader(row, columnMap, "name");
        if (!clientName) {
          continue; // Skip empty rows
        }

        const month =
          getCellByHeader(row, columnMap, "month") ||
          getCellByHeader(row, columnMap, "period");
        if (!month) {
          continue; // Need a month for financial records
        }

        // Normalize month to YYYY-MM format
        const normalizedMonth = normalizeMonth(month);
        if (!normalizedMonth) {
          const msg = `Row ${rowIndex}: Unable to parse month value "${month}"`;
          errors.push(msg);
          await syncLogger.warn(context.importId, msg);
          failed++;
          continue;
        }

        const hours = parseFloat_(getCellByHeader(row, columnMap, "hours")) ?? null;
        const costAmount =
          parseFloat_(getCellByHeader(row, columnMap, "cost")) ??
          parseFloat_(getCellByHeader(row, columnMap, "cost amount")) ??
          parseFloat_(getCellByHeader(row, columnMap, "amount"));
        if (costAmount === null || costAmount === undefined) {
          continue; // Skip rows without a cost amount
        }

        const category =
          getCellByHeader(row, columnMap, "category") ||
          getCellByHeader(row, columnMap, "cost category") ||
          null;

        // Look up client by name (case-insensitive)
        const clientId = await findClientByName(clientName);
        if (!clientId) {
          const msg = `Row ${rowIndex}: Client not found: "${clientName}"`;
          errors.push(msg);
          await syncLogger.warn(context.importId, msg);
          failed++;
          continue;
        }

        await db.financialRecord.upsert({
          where: {
            clientId_month_type_category: {
              clientId,
              month: normalizedMonth,
              type: "cost",
              category: category ?? "general",
            },
          },
          create: {
            clientId,
            month: normalizedMonth,
            type: "cost",
            category: category ?? "general",
            amount: costAmount,
            hours,
            source: "sheets",
            description: `Imported from Sheets row ${rowIndex}`,
          },
          update: {
            amount: costAmount,
            hours,
            source: "sheets",
          },
        });

        synced++;
      } catch (err) {
        failed++;
        const msg = `Row ${rowIndex}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        await syncLogger.error(context.importId, msg);
      }
    }

    return { synced, failed, errors };
  }
}

/**
 * Normalize a month string to YYYY-MM format.
 * Handles formats like "2024-01", "Jan 2024", "January 2024", "01/2024".
 */
function normalizeMonth(value: string): string | null {
  const trimmed = value.trim();

  // Already YYYY-MM
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // YYYY-MM-DD -> take YYYY-MM
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed.slice(0, 7);
  }

  // MM/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    return `${slashMatch[2]}-${slashMatch[1].padStart(2, "0")}`;
  }

  // Month name + year (e.g., "Jan 2024", "January 2024")
  const monthNames: Record<string, string> = {
    jan: "01", january: "01",
    feb: "02", february: "02",
    mar: "03", march: "03",
    apr: "04", april: "04",
    may: "05",
    jun: "06", june: "06",
    jul: "07", july: "07",
    aug: "08", august: "08",
    sep: "09", september: "09",
    oct: "10", october: "10",
    nov: "11", november: "11",
    dec: "12", december: "12",
  };

  const nameMatch = trimmed.match(/^([a-zA-Z]+)\s*(\d{4})$/);
  if (nameMatch) {
    const monthNum = monthNames[nameMatch[1].toLowerCase()];
    if (monthNum) {
      return `${nameMatch[2]}-${monthNum}`;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 4. Client Match Sync Adapter (tab: "5.3 Client Match")
// ---------------------------------------------------------------------------

interface ClientMatchRow {
  row: string[];
  columnMap: Map<string, number>;
  rowIndex: number;
}

export class ClientMatchSyncAdapter implements SyncAdapter<ClientMatchRow> {
  name = "Google Sheets - Client Match";
  provider = "sheets";

  async *fetchAll(
    context: SyncContext
  ): AsyncGenerator<ClientMatchRow[], void, unknown> {
    const config = await loadSheetsConfig();
    const auth = getAuth(config);

    syncLogger.info(context.importId, "Reading '5.3 Client Match' tab...");
    const { headers, rows } = await readNamedSheet(auth, config.sheetId, "5.3 Client Match");

    if (headers.length === 0) {
      syncLogger.info(context.importId, "No headers found in client match tab");
      return;
    }

    const columnMap = buildColumnMap(headers);
    const items: ClientMatchRow[] = rows.map((row, idx) => ({
      row,
      columnMap,
      rowIndex: idx + 2,
    }));

    for (let i = 0; i < items.length; i += 50) {
      yield items.slice(i, i + 50);
    }
  }

  async mapAndUpsert(
    items: ClientMatchRow[],
    context: SyncContext
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const { row, columnMap, rowIndex } of items) {
      try {
        // Expect columns like "Monday Name", "HubSpot Name", or "Source Name" / "Canonical Name"
        const mondayName =
          getCellByHeader(row, columnMap, "monday name") ||
          getCellByHeader(row, columnMap, "monday");
        const hubspotName =
          getCellByHeader(row, columnMap, "hubspot name") ||
          getCellByHeader(row, columnMap, "hubspot");
        const canonicalName =
          getCellByHeader(row, columnMap, "canonical name") ||
          getCellByHeader(row, columnMap, "client name") ||
          getCellByHeader(row, columnMap, "name");

        // Need at least a canonical name and one alias
        if (!canonicalName && !mondayName && !hubspotName) {
          continue; // Skip empty rows
        }

        // Determine the primary client name
        const primaryName = canonicalName || hubspotName || mondayName;
        if (!primaryName) continue;

        // Find or create the client
        let clientId = await findClientByName(primaryName);
        if (!clientId) {
          // Create the client
          const client = await db.client.create({
            data: {
              name: primaryName,
              source: "sheets",
              status: "active",
            },
          });
          clientId = client.id;
        }

        // Create aliases for each name that differs from the primary
        const aliasNames: Array<{ alias: string; source: string }> = [];

        if (mondayName && mondayName.toLowerCase() !== primaryName.toLowerCase()) {
          aliasNames.push({ alias: mondayName, source: "monday" });
        }
        if (hubspotName && hubspotName.toLowerCase() !== primaryName.toLowerCase()) {
          aliasNames.push({ alias: hubspotName, source: "hubspot" });
        }
        // Also add the canonical as a sheets alias if different sources exist
        if (canonicalName && mondayName && canonicalName.toLowerCase() !== mondayName.toLowerCase()) {
          aliasNames.push({ alias: canonicalName, source: "sheets" });
        }

        for (const { alias, source } of aliasNames) {
          if (!alias) continue;

          try {
            await db.clientAlias.upsert({
              where: {
                alias_source: {
                  alias,
                  source,
                },
              },
              create: {
                clientId,
                alias,
                source,
              },
              update: {
                clientId,
              },
            });
          } catch (aliasErr) {
            // Alias might conflict if already mapped to a different client
            const msg = `Row ${rowIndex}: Failed to create alias "${alias}" (${source}): ${
              aliasErr instanceof Error ? aliasErr.message : String(aliasErr)
            }`;
            errors.push(msg);
            await syncLogger.warn(context.importId, msg);
          }
        }

        synced++;
      } catch (err) {
        failed++;
        const msg = `Row ${rowIndex}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        await syncLogger.error(context.importId, msg);
      }
    }

    return { synced, failed, errors };
  }
}

// ---------------------------------------------------------------------------
// 5. Package Lookup Sync Adapter (tab: "5.2 Package Lookup")
// ---------------------------------------------------------------------------

interface PackageRow {
  row: string[];
  columnMap: Map<string, number>;
  rowIndex: number;
}

export class PackageLookupSyncAdapter implements SyncAdapter<PackageRow> {
  name = "Google Sheets - Package Lookup";
  provider = "sheets";

  async *fetchAll(
    context: SyncContext
  ): AsyncGenerator<PackageRow[], void, unknown> {
    const config = await loadSheetsConfig();
    const auth = getAuth(config);

    syncLogger.info(context.importId, "Reading '5.2 Package Lookup' tab...");
    const { headers, rows } = await readNamedSheet(auth, config.sheetId, "5.2 Package Lookup");

    if (headers.length === 0) {
      syncLogger.info(context.importId, "No headers found in package lookup tab");
      return;
    }

    const columnMap = buildColumnMap(headers);
    const items: PackageRow[] = rows.map((row, idx) => ({
      row,
      columnMap,
      rowIndex: idx + 2,
    }));

    for (let i = 0; i < items.length; i += 50) {
      yield items.slice(i, i + 50);
    }
  }

  async mapAndUpsert(
    items: PackageRow[],
    context: SyncContext
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const { row, columnMap, rowIndex } of items) {
      try {
        const name =
          getCellByHeader(row, columnMap, "package name") ||
          getCellByHeader(row, columnMap, "package") ||
          getCellByHeader(row, columnMap, "name");
        if (!name) {
          continue; // Skip empty rows
        }

        const tier =
          getCellByHeader(row, columnMap, "tier") ||
          getCellByHeader(row, columnMap, "level") ||
          null;
        const description =
          getCellByHeader(row, columnMap, "description") ||
          getCellByHeader(row, columnMap, "details") ||
          null;
        const hoursIncluded =
          parseFloat_(getCellByHeader(row, columnMap, "hours included")) ??
          parseFloat_(getCellByHeader(row, columnMap, "hours")) ??
          null;
        const monthlyRate =
          parseFloat_(getCellByHeader(row, columnMap, "monthly rate")) ??
          parseFloat_(getCellByHeader(row, columnMap, "rate")) ??
          parseFloat_(getCellByHeader(row, columnMap, "price")) ??
          null;

        await db.package.upsert({
          where: { name },
          create: {
            name,
            tier,
            description,
            hoursIncluded,
            monthlyRate,
          },
          update: {
            tier,
            description,
            hoursIncluded,
            monthlyRate,
          },
        });

        synced++;
      } catch (err) {
        failed++;
        const msg = `Row ${rowIndex}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(msg);
        await syncLogger.error(context.importId, msg);
      }
    }

    return { synced, failed, errors };
  }
}

// ---------------------------------------------------------------------------
// Adapter factory
// ---------------------------------------------------------------------------

export type SheetsSyncTab =
  | "salary"
  | "clients"
  | "costs"
  | "client-match"
  | "packages";

export function createSheetsSyncAdapter(tab: SheetsSyncTab): SyncAdapter {
  switch (tab) {
    case "salary":
      return new SalaryDataSyncAdapter();
    case "clients":
      return new ClientDataSyncAdapter();
    case "costs":
      return new SegmentedCostDataSyncAdapter();
    case "client-match":
      return new ClientMatchSyncAdapter();
    case "packages":
      return new PackageLookupSyncAdapter();
    default:
      throw new Error(`Unknown sheets sync tab: ${tab}`);
  }
}

export const ALL_SHEET_TABS: SheetsSyncTab[] = [
  "salary",
  "clients",
  "costs",
  "client-match",
  "packages",
];

export const SHEET_TAB_META: Record<
  SheetsSyncTab,
  { tabName: string; description: string }
> = {
  salary: {
    tabName: "4.3 Salary Data",
    description: "Team member salary, hourly rates, and employment details",
  },
  clients: {
    tabName: "4.2 Client Data",
    description: "Client retainer values, packages, and deal stages",
  },
  costs: {
    tabName: "4.4 Segmented Cost Data",
    description: "Monthly segmented cost data per client",
  },
  "client-match": {
    tabName: "5.3 Client Match",
    description: "Client name mappings between Monday.com and HubSpot",
  },
  packages: {
    tabName: "5.2 Package Lookup",
    description: "Package tier definitions with hours and rates",
  },
};
