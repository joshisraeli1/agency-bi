import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole, logAudit } from "@/lib/auth";
import Papa from "papaparse";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Get a column value from a CSV row, trying multiple possible column names.
 * Case-insensitive header matching.
 */
function getCol(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const key = Object.keys(row).find(
      (k) => k.trim().toLowerCase() === name.toLowerCase()
    );
    if (key && row[key] !== undefined && row[key] !== "") {
      return row[key].trim();
    }
  }
  return "";
}

/**
 * Parse a numeric value from a string, stripping currency symbols and commas.
 */
function parseAmount(value: string): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Extract YYYY-MM from a date string.
 * Handles ISO dates, DD/MM/YYYY, MM/DD/YYYY, and various common formats.
 */
function toMonth(dateStr: string): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();

  // Already YYYY-MM
  if (/^\d{4}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // ISO: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}`;
  }

  // DD/MM/YYYY or D/M/YYYY (common in Xero exports from AU/UK regions)
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    // Assume DD/MM/YYYY as Xero is AU-based
    const month = slashMatch[2].padStart(2, "0");
    return `${slashMatch[3]}-${month}`;
  }

  // Try native Date parsing as last resort
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    return `${yyyy}-${mm}`;
  }

  return null;
}

/**
 * Find or create a client by name, following the codebase's standard matching pattern:
 *   1. Check ClientAlias where source="xero"
 *   2. Exact name match
 *   3. Case-insensitive name match
 *   4. Create new client with source="xero"
 */
async function findOrCreateClient(
  name: string,
  clientCache: Map<string, { id: string; created: boolean }>
): Promise<{ id: string; created: boolean }> {
  const lowerName = name.toLowerCase().trim();

  // Check in-memory cache first
  if (clientCache.has(lowerName)) {
    return clientCache.get(lowerName)!;
  }

  // 1. Check ClientAlias where source="xero"
  const aliases = await db.clientAlias.findMany({
    where: { source: "xero" },
    select: { clientId: true, alias: true },
  });
  const aliasMatch = aliases.find(
    (a) => a.alias.toLowerCase() === lowerName
  );
  if (aliasMatch) {
    const result = { id: aliasMatch.clientId, created: false };
    clientCache.set(lowerName, result);
    return result;
  }

  // 2. Exact name match
  const exactMatch = await db.client.findFirst({
    where: { name: { equals: name.trim() } },
    select: { id: true, name: true },
  });
  if (exactMatch && exactMatch.name === name.trim()) {
    const result = { id: exactMatch.id, created: false };
    clientCache.set(lowerName, result);
    return result;
  }

  // 3. Case-insensitive name match
  const clients = await db.client.findMany({
    where: { name: { equals: name.trim() } },
    select: { id: true, name: true },
  });
  const ciMatch = clients.find(
    (c) => c.name.toLowerCase() === lowerName
  );
  if (ciMatch) {
    const result = { id: ciMatch.id, created: false };
    clientCache.set(lowerName, result);
    return result;
  }

  // 4. Create new client
  const newClient = await db.client.create({
    data: {
      name: name.trim(),
      source: "xero",
      status: "active",
    },
  });

  // Also create an alias for future lookups
  try {
    await db.clientAlias.create({
      data: {
        clientId: newClient.id,
        alias: name.trim(),
        source: "xero",
      },
    });
  } catch {
    // Alias may already exist — ignore
  }

  const result = { id: newClient.id, created: true };
  clientCache.set(lowerName, result);
  return result;
}

// ---------------------------------------------------------------------------
// POST /api/integrations/xero/upload
// ---------------------------------------------------------------------------

/**
 * Accepts a CSV file upload of Xero invoice or expense data, parses it,
 * and creates FinancialRecord and Client records in the database.
 *
 * Form data:
 *   - file: CSV file
 *   - type: "invoices" | "expenses"
 */
export async function POST(request: NextRequest) {
  // Auth check
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  const session = auth.session;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const uploadType = formData.get("type") as string | null;

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided. Please upload a CSV file." },
        { status: 400 }
      );
    }

    // Limit file size to 10MB to prevent memory exhaustion
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    if (!uploadType || !["invoices", "expenses"].includes(uploadType)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be "invoices" or "expenses".' },
        { status: 400 }
      );
    }

    // Read file content
    const csvText = await file.text();
    if (!csvText.trim()) {
      return NextResponse.json(
        { error: "Uploaded file is empty." },
        { status: 400 }
      );
    }

    // Parse CSV
    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
    });

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      return NextResponse.json(
        {
          error: "Failed to parse CSV file.",
          details: parsed.errors.map((e) => e.message),
        },
        { status: 400 }
      );
    }

    const rows = parsed.data;
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "CSV file contains no data rows." },
        { status: 400 }
      );
    }

    // Process rows
    let imported = 0;
    let skipped = 0;
    const clientStats = { created: 0, matched: 0 };
    const errors: string[] = [];
    const clientCache = new Map<string, { id: string; created: boolean }>();

    if (uploadType === "invoices") {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2; // +2 because row 1 is header, data starts at row 2

        try {
          // Extract contact name
          const contactName = getCol(row, "ContactName", "Contact Name", "Contact");
          if (!contactName) {
            skipped++;
            continue;
          }

          // Extract invoice number
          const invoiceNumber = getCol(
            row,
            "InvoiceNumber",
            "Invoice Number",
            "InvoiceNo",
            "Number"
          );

          // Extract date and derive month
          const dateStr = getCol(row, "InvoiceDate", "Invoice Date", "Date");
          const month = toMonth(dateStr);
          if (!month) {
            errors.push(`Row ${rowNum}: Unable to parse date "${dateStr}"`);
            skipped++;
            continue;
          }

          // Extract amount
          const amountStr = getCol(
            row,
            "Total",
            "InvoiceTotal",
            "Invoice Total",
            "Amount",
            "SubTotal"
          );
          const rawAmount = parseAmount(amountStr);
          if (rawAmount === null || rawAmount === 0) {
            skipped++;
            continue;
          }
          const amount = Math.abs(rawAmount);

          // Determine type from Xero invoice Type field
          const xeroType = getCol(row, "Type").toUpperCase();
          const recordType = xeroType === "ACCPAY" ? "cost" : "retainer";

          // Derive category — use Reference column if available, else default
          const reference = getCol(row, "Reference", "Ref");
          const category = reference
            ? `Xero Invoice - ${reference}`
            : invoiceNumber
              ? `Xero Invoice #${invoiceNumber}`
              : "Xero Invoice";

          // Find or create client
          const clientResult = await findOrCreateClient(contactName, clientCache);
          if (clientResult.created) {
            clientStats.created++;
          } else {
            clientStats.matched++;
          }

          // Upsert financial record
          await db.financialRecord.upsert({
            where: {
              clientId_month_type_category: {
                clientId: clientResult.id,
                month,
                type: recordType,
                category,
              },
            },
            create: {
              clientId: clientResult.id,
              month,
              type: recordType,
              category,
              amount,
              description: invoiceNumber
                ? `Xero Invoice ${invoiceNumber}`
                : `Xero Invoice from ${contactName}`,
              source: "xero",
              externalId: invoiceNumber || null,
            },
            update: {
              amount,
              description: invoiceNumber
                ? `Xero Invoice ${invoiceNumber}`
                : `Xero Invoice from ${contactName}`,
              source: "xero",
              externalId: invoiceNumber || null,
            },
          });

          imported++;
        } catch (err) {
          const msg = `Row ${rowNum}: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(msg);
          skipped++;
        }
      }
    } else {
      // expenses
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        try {
          // Extract date and derive month
          const dateStr = getCol(row, "Date", "TransactionDate", "Transaction Date");
          const month = toMonth(dateStr);
          if (!month) {
            errors.push(`Row ${rowNum}: Unable to parse date "${dateStr}"`);
            skipped++;
            continue;
          }

          // Extract amount
          const amountStr = getCol(row, "Amount", "Total", "SubTotal");
          const rawAmount = parseAmount(amountStr);
          if (rawAmount === null || rawAmount === 0) {
            skipped++;
            continue;
          }
          const amount = Math.abs(rawAmount);

          // Extract contact / payee
          const contactName = getCol(
            row,
            "Contact",
            "ContactName",
            "Contact Name",
            "Payee",
            "Supplier"
          );
          if (!contactName) {
            skipped++;
            continue;
          }

          // Extract description
          const description = getCol(
            row,
            "Description",
            "Reference",
            "Ref",
            "Memo",
            "Narrative"
          );

          // Build a unique category per expense row using description or row index
          const category = description
            ? `Xero Expense - ${description}`.slice(0, 200)
            : `Xero Expense (row ${rowNum})`;

          // Find or create client
          const clientResult = await findOrCreateClient(contactName, clientCache);
          if (clientResult.created) {
            clientStats.created++;
          } else {
            clientStats.matched++;
          }

          // Upsert financial record
          await db.financialRecord.upsert({
            where: {
              clientId_month_type_category: {
                clientId: clientResult.id,
                month,
                type: "cost",
                category,
              },
            },
            create: {
              clientId: clientResult.id,
              month,
              type: "cost",
              category,
              amount,
              description: description || `Xero expense from ${contactName}`,
              source: "xero",
              externalId: null,
            },
            update: {
              amount,
              description: description || `Xero expense from ${contactName}`,
              source: "xero",
            },
          });

          imported++;
        } catch (err) {
          const msg = `Row ${rowNum}: ${err instanceof Error ? err.message : String(err)}`;
          errors.push(msg);
          skipped++;
        }
      }
    }

    await logAudit({ action: "xero_data_uploaded", userId: session.userId, entity: "financial_record", details: `Uploaded ${uploadType}: ${imported} imported, ${skipped} skipped, ${clientStats.created} clients created` });

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      clients: {
        created: clientStats.created,
        matched: clientStats.matched,
      },
      errors,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Upload failed",
      },
      { status: 500 }
    );
  }
}
