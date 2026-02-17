import { xeroRateLimiter } from "@/lib/sync/rate-limiter";

const BASE_URL = "https://api.xero.com/api.xro/2.0";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber: string;
  Type: string; // ACCREC | ACCPAY
  Contact: {
    ContactID: string;
    Name: string;
  };
  Status: string;
  DateString: string;
  DueDateString: string;
  SubTotal: number;
  TotalTax: number;
  Total: number;
  AmountDue: number;
  AmountPaid: number;
  CurrencyCode: string;
  LineItems: XeroLineItem[];
}

export interface XeroLineItem {
  Description: string;
  Quantity: number;
  UnitAmount: number;
  LineAmount: number;
  AccountCode: string;
}

export interface XeroExpense {
  BankTransactionID: string;
  Type: string; // SPEND | RECEIVE
  Contact: {
    ContactID: string;
    Name: string;
  };
  DateString: string;
  SubTotal: number;
  TotalTax: number;
  Total: number;
  Status: string;
  LineItems: XeroLineItem[];
}

export interface XeroContact {
  ContactID: string;
  Name: string;
  FirstName?: string;
  LastName?: string;
  EmailAddress?: string;
  ContactStatus: string;
  IsCustomer: boolean;
  IsSupplier: boolean;
}

interface XeroOrganisation {
  Name: string;
  ShortCode: string;
}

interface XeroTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface XeroConnectionResponse {
  id: string;
  tenantId: string;
  tenantType: string;
  tenantName: string;
}

// ---------------------------------------------------------------------------
// Private fetch helper
// ---------------------------------------------------------------------------

async function xeroFetch<T>(
  accessToken: string,
  tenantId: string,
  path: string,
  params?: Record<string, string>
): Promise<T> {
  await xeroRateLimiter.acquire();

  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "xero-tenant-id": tenantId,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let message = `Xero API error: ${response.status}`;
    try {
      const parsed = JSON.parse(errorBody);
      message = parsed.Message || parsed.Detail || message;
    } catch {
      // Use default message
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// OAuth2
// ---------------------------------------------------------------------------

export function getAuthUrl(): string {
  const clientId = process.env.XERO_CLIENT_ID;
  if (!clientId) throw new Error("XERO_CLIENT_ID not set");

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/xero/callback`;
  const scopes = "openid profile email accounting.transactions.read accounting.contacts.read offline_access";

  const url = new URL("https://login.xero.com/identity/connect/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scopes);
  url.searchParams.set("state", "xero-oauth");

  return url.toString();
}

export async function exchangeCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tenantId: string;
  tenantName: string;
}> {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Xero OAuth credentials not set");

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/xero/callback`;
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokenRes = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Failed to exchange code: ${errText}`);
  }

  const tokens: XeroTokenResponse = await tokenRes.json();

  // Get tenant (connection) info
  const connectionsRes = await fetch("https://api.xero.com/connections", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!connectionsRes.ok) {
    throw new Error("Failed to fetch Xero connections");
  }

  const connections: XeroConnectionResponse[] = await connectionsRes.json();
  if (connections.length === 0) {
    throw new Error("No Xero organisations connected");
  }

  const connection = connections[0];

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    tenantId: connection.tenantId,
    tenantName: connection.tenantName,
  };
}

export async function refreshToken(currentRefreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}> {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Xero OAuth credentials not set");

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const tokenRes = await fetch("https://identity.xero.com/connect/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: currentRefreshToken,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Failed to refresh token: ${errText}`);
  }

  const tokens: XeroTokenResponse = await tokenRes.json();

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
  };
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

export async function* fetchInvoices(
  accessToken: string,
  tenantId: string
): AsyncGenerator<XeroInvoice[], void, unknown> {
  let page = 1;

  do {
    const response = await xeroFetch<{ Invoices: XeroInvoice[] }>(
      accessToken,
      tenantId,
      "/Invoices",
      { page: String(page), order: "UpdatedDateUTC DESC" }
    );

    const invoices = response.Invoices;
    if (invoices.length === 0) break;

    yield invoices;

    // Xero returns up to 100 per page
    if (invoices.length < 100) break;
    page++;
  } while (true);
}

export async function* fetchExpenses(
  accessToken: string,
  tenantId: string
): AsyncGenerator<XeroExpense[], void, unknown> {
  let page = 1;

  do {
    const response = await xeroFetch<{ BankTransactions: XeroExpense[] }>(
      accessToken,
      tenantId,
      "/BankTransactions",
      { page: String(page), where: 'Type=="SPEND"' }
    );

    const expenses = response.BankTransactions;
    if (expenses.length === 0) break;

    yield expenses;

    if (expenses.length < 100) break;
    page++;
  } while (true);
}

export async function* fetchContacts(
  accessToken: string,
  tenantId: string
): AsyncGenerator<XeroContact[], void, unknown> {
  let page = 1;

  do {
    const response = await xeroFetch<{ Contacts: XeroContact[] }>(
      accessToken,
      tenantId,
      "/Contacts",
      { page: String(page) }
    );

    const contacts = response.Contacts;
    if (contacts.length === 0) break;

    yield contacts;

    if (contacts.length < 100) break;
    page++;
  } while (true);
}

export async function testConnection(
  accessToken: string,
  tenantId: string
): Promise<{ success: boolean; orgName?: string; error?: string }> {
  try {
    const response = await xeroFetch<{ Organisations: XeroOrganisation[] }>(
      accessToken,
      tenantId,
      "/Organisation"
    );

    const org = response.Organisations[0];
    return { success: true, orgName: org?.Name };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return { success: false, error: message };
  }
}
