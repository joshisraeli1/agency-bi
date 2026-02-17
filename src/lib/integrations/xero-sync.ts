import { db } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/encryption";
import { syncLogger } from "@/lib/sync/logger";
import type { SyncAdapter, SyncContext } from "@/lib/sync/types";
import { toMonthKey } from "@/lib/utils";
import {
  fetchInvoices,
  fetchExpenses,
  fetchContacts,
  refreshToken,
  type XeroInvoice,
  type XeroExpense,
  type XeroContact,
} from "./xero";

interface XeroConfig {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  tenantName?: string;
  expiresAt?: number;
}

async function getXeroConfig(): Promise<XeroConfig> {
  const config = await db.integrationConfig.findUnique({
    where: { provider: "xero" },
  });

  if (!config || !config.configJson || config.configJson === "{}") {
    throw new Error("Xero integration is not configured");
  }

  const decrypted = decryptJson<XeroConfig>(config.configJson);

  if (!decrypted.accessToken || !decrypted.tenantId) {
    throw new Error("Xero access token or tenant ID is not configured");
  }

  // If token is expired, refresh it
  if (decrypted.expiresAt && Date.now() > decrypted.expiresAt) {
    if (!decrypted.refreshToken) {
      throw new Error("Xero refresh token not available. Please re-authenticate.");
    }

    const refreshed = await refreshToken(decrypted.refreshToken);
    const updatedConfig: XeroConfig = {
      ...decrypted,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      expiresAt: Date.now() + refreshed.expiresIn * 1000,
    };

    await db.integrationConfig.update({
      where: { provider: "xero" },
      data: { configJson: encryptJson(updatedConfig as unknown as Record<string, unknown>) },
    });

    return updatedConfig;
  }

  return decrypted;
}

// ---------------------------------------------------------------------------
// Invoice Sync Adapter
// ---------------------------------------------------------------------------
export class InvoiceSyncAdapter implements SyncAdapter<XeroInvoice> {
  name = "Xero Invoices";
  provider = "xero";

  async *fetchAll(context: SyncContext): AsyncGenerator<XeroInvoice[], void, unknown> {
    const config = await getXeroConfig();
    syncLogger.info(context.importId, "Fetching invoices from Xero");

    for await (const batch of fetchInvoices(config.accessToken, config.tenantId)) {
      yield batch;
    }
  }

  async mapAndUpsert(
    invoices: XeroInvoice[],
    context: SyncContext
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const invoice of invoices) {
      try {
        // Only sync accounts receivable invoices
        if (invoice.Type !== "ACCREC") continue;
        if (invoice.Status === "DELETED" || invoice.Status === "VOIDED") continue;

        const contactId = invoice.Contact.ContactID;
        const contactName = invoice.Contact.Name;

        // Find or create client by xeroContactId
        let client = await db.client.findUnique({
          where: { xeroContactId: contactId },
        });

        if (!client) {
          client = await db.client.create({
            data: {
              name: contactName,
              xeroContactId: contactId,
              source: "xero",
              status: "active",
            },
          });
        }

        const month = invoice.DateString
          ? toMonthKey(new Date(invoice.DateString))
          : toMonthKey(new Date());

        await db.financialRecord.upsert({
          where: {
            clientId_month_type_category: {
              clientId: client.id,
              month,
              type: "retainer",
              category: `invoice-${invoice.InvoiceNumber || invoice.InvoiceID}`,
            },
          },
          create: {
            clientId: client.id,
            month,
            type: "retainer",
            category: `invoice-${invoice.InvoiceNumber || invoice.InvoiceID}`,
            amount: invoice.Total,
            description: `Xero invoice: ${invoice.InvoiceNumber || invoice.InvoiceID} - ${contactName}`,
            source: "xero",
            externalId: invoice.InvoiceID,
          },
          update: {
            amount: invoice.Total,
            description: `Xero invoice: ${invoice.InvoiceNumber || invoice.InvoiceID} - ${contactName}`,
            externalId: invoice.InvoiceID,
          },
        });

        synced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Invoice ${invoice.InvoiceID}: ${msg}`);
        failed++;
        syncLogger.error(context.importId, `Invoice ${invoice.InvoiceID}: ${msg}`);
      }
    }

    return { synced, failed, errors };
  }
}

// ---------------------------------------------------------------------------
// Expense Sync Adapter
// ---------------------------------------------------------------------------
export class ExpenseSyncAdapter implements SyncAdapter<XeroExpense> {
  name = "Xero Expenses";
  provider = "xero";

  async *fetchAll(context: SyncContext): AsyncGenerator<XeroExpense[], void, unknown> {
    const config = await getXeroConfig();
    syncLogger.info(context.importId, "Fetching expenses from Xero");

    for await (const batch of fetchExpenses(config.accessToken, config.tenantId)) {
      yield batch;
    }
  }

  async mapAndUpsert(
    expenses: XeroExpense[],
    context: SyncContext
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const expense of expenses) {
      try {
        if (expense.Status === "DELETED") continue;

        const contactId = expense.Contact?.ContactID;
        const contactName = expense.Contact?.Name || "Unknown";

        // Try to match to a client by xeroContactId
        let client = contactId
          ? await db.client.findUnique({ where: { xeroContactId: contactId } })
          : null;

        if (!client && contactId) {
          client = await db.client.create({
            data: {
              name: contactName,
              xeroContactId: contactId,
              source: "xero",
              status: "active",
            },
          });
        }

        if (!client) {
          errors.push(`Expense ${expense.BankTransactionID}: no client match`);
          failed++;
          continue;
        }

        const month = expense.DateString
          ? toMonthKey(new Date(expense.DateString))
          : toMonthKey(new Date());

        const description = expense.LineItems?.[0]?.Description || "Xero expense";

        await db.financialRecord.upsert({
          where: {
            clientId_month_type_category: {
              clientId: client.id,
              month,
              type: "cost",
              category: `expense-${expense.BankTransactionID}`,
            },
          },
          create: {
            clientId: client.id,
            month,
            type: "cost",
            category: `expense-${expense.BankTransactionID}`,
            amount: expense.Total,
            description: `Xero expense: ${description}`,
            source: "xero",
            externalId: expense.BankTransactionID,
          },
          update: {
            amount: expense.Total,
            description: `Xero expense: ${description}`,
            externalId: expense.BankTransactionID,
          },
        });

        synced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Expense ${expense.BankTransactionID}: ${msg}`);
        failed++;
        syncLogger.error(context.importId, `Expense ${expense.BankTransactionID}: ${msg}`);
      }
    }

    return { synced, failed, errors };
  }
}

// ---------------------------------------------------------------------------
// Contact Sync Adapter
// ---------------------------------------------------------------------------
export class ContactSyncAdapter implements SyncAdapter<XeroContact> {
  name = "Xero Contacts";
  provider = "xero";

  async *fetchAll(context: SyncContext): AsyncGenerator<XeroContact[], void, unknown> {
    const config = await getXeroConfig();
    syncLogger.info(context.importId, "Fetching contacts from Xero");

    for await (const batch of fetchContacts(config.accessToken, config.tenantId)) {
      yield batch;
    }
  }

  async mapAndUpsert(
    contacts: XeroContact[],
    context: SyncContext
  ): Promise<{ synced: number; failed: number; errors: string[] }> {
    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const contact of contacts) {
      try {
        if (contact.ContactStatus === "ARCHIVED") continue;

        const contactName = contact.Name;
        if (!contactName) {
          errors.push(`Contact ${contact.ContactID}: missing name, skipped`);
          failed++;
          continue;
        }

        await db.client.upsert({
          where: { xeroContactId: contact.ContactID },
          create: {
            name: contactName,
            xeroContactId: contact.ContactID,
            source: "xero",
            status: "active",
          },
          update: {
            name: contactName,
          },
        });

        // Create alias for cross-referencing
        const client = await db.client.findUnique({
          where: { xeroContactId: contact.ContactID },
        });

        if (client) {
          await db.clientAlias.upsert({
            where: {
              alias_source: {
                alias: contactName,
                source: "xero",
              },
            },
            create: {
              clientId: client.id,
              alias: contactName,
              source: "xero",
              externalId: contact.ContactID,
            },
            update: {
              clientId: client.id,
              externalId: contact.ContactID,
            },
          });
        }

        synced++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Contact ${contact.ContactID}: ${msg}`);
        failed++;
        syncLogger.error(context.importId, `Contact ${contact.ContactID}: ${msg}`);
      }
    }

    return { synced, failed, errors };
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
export function createXeroAdapter(
  type: "invoices" | "expenses" | "contacts"
): SyncAdapter {
  switch (type) {
    case "invoices":
      return new InvoiceSyncAdapter();
    case "expenses":
      return new ExpenseSyncAdapter();
    case "contacts":
      return new ContactSyncAdapter();
    default:
      throw new Error(`Unknown Xero sync type: ${type}`);
  }
}
