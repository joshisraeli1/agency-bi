import { google, type sheets_v4 } from "googleapis";
import { JWT } from "googleapis-common";
import { sheetsRateLimiter } from "@/lib/sync/rate-limiter";

/**
 * Create a JWT auth client from service account credentials.
 */
export function getAuthClient(
  serviceAccountEmail: string,
  privateKey: string
): JWT {
  return new google.auth.JWT({
    email: serviceAccountEmail,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

function getSheetsClient(auth: JWT): sheets_v4.Sheets {
  return google.sheets({ version: "v4", auth });
}

/**
 * Read a specific range from a Google Sheet.
 * Returns rows as string[][].
 */
export async function readRange(
  auth: JWT,
  sheetId: string,
  range: string
): Promise<string[][]> {
  await sheetsRateLimiter.acquire();

  const sheets = getSheetsClient(auth);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    return [];
  }

  // Normalize all values to strings
  return rows.map((row) =>
    row.map((cell) => (cell === null || cell === undefined ? "" : String(cell)))
  );
}

/**
 * Read an entire named sheet tab, returning headers and data rows separately.
 * The first row is treated as headers.
 */
export async function readNamedSheet(
  auth: JWT,
  sheetId: string,
  sheetName: string
): Promise<{ headers: string[]; rows: string[][] }> {
  const allRows = await readRange(auth, sheetId, sheetName);

  if (allRows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = allRows[0].map((h) => h.trim());
  const rows = allRows.slice(1);

  return { headers, rows };
}

/**
 * List all sheet tab names in a spreadsheet.
 */
export async function listSheetTabs(
  auth: JWT,
  sheetId: string
): Promise<string[]> {
  await sheetsRateLimiter.acquire();

  const sheets = getSheetsClient(auth);
  const response = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    fields: "sheets.properties.title",
  });

  const sheetList = response.data.sheets;
  if (!sheetList) {
    return [];
  }

  return sheetList
    .map((s) => s.properties?.title)
    .filter((title): title is string => !!title);
}

/**
 * Test the connection by listing sheet tabs.
 */
export async function testConnection(
  serviceAccountEmail: string,
  privateKey: string,
  sheetId: string
): Promise<{ success: boolean; tabs?: string[]; error?: string }> {
  try {
    const auth = getAuthClient(serviceAccountEmail, privateKey);
    const tabs = await listSheetTabs(auth, sheetId);
    return { success: true, tabs };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Helper: Build a column index map from headers.
 * Maps normalized (lowercased, trimmed) header names to their column indices.
 */
export function buildColumnMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((header, index) => {
    map.set(header.toLowerCase().trim(), index);
  });
  return map;
}

/**
 * Helper: Get a cell value by header name from a row, using a column map.
 * Returns empty string if the column is not found or the cell is empty.
 */
export function getCellByHeader(
  row: string[],
  columnMap: Map<string, number>,
  headerName: string
): string {
  const index = columnMap.get(headerName.toLowerCase().trim());
  if (index === undefined || index >= row.length) {
    return "";
  }
  return row[index].trim();
}
