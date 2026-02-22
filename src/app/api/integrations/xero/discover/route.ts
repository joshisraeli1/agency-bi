import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptJson, encryptJson } from "@/lib/encryption";
import {
  testConnection,
  refreshToken,
  fetchInvoices,
  fetchExpenses,
} from "@/lib/integrations/xero";

interface XeroConfig {
  accessToken: string;
  refreshToken: string;
  tenantId: string;
  tenantName?: string;
  expiresAt?: number;
}

/**
 * POST /api/integrations/xero/discover
 *
 * Fetches org info, sample invoices, and sample expenses from Xero
 * so users can preview their data before syncing.
 */
export async function POST(_request: NextRequest) {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;

  const config = await db.integrationConfig.findUnique({
    where: { provider: "xero" },
  });

  if (!config || !config.configJson || config.configJson === "{}") {
    return NextResponse.json(
      { error: "Xero integration not configured" },
      { status: 404 }
    );
  }

  let decrypted: XeroConfig;
  try {
    decrypted = decryptJson<XeroConfig>(config.configJson);
  } catch {
    return NextResponse.json(
      { error: "Failed to decrypt config" },
      { status: 400 }
    );
  }

  if (!decrypted.accessToken || !decrypted.tenantId) {
    return NextResponse.json(
      { error: "Xero not fully connected. Please reconnect via OAuth." },
      { status: 400 }
    );
  }

  try {
    // Refresh token if expired
    if (decrypted.expiresAt && Date.now() > decrypted.expiresAt) {
      if (!decrypted.refreshToken) {
        return NextResponse.json(
          { error: "Xero token expired. Please re-authenticate." },
          { status: 400 }
        );
      }
      const refreshed = await refreshToken(decrypted.refreshToken);
      decrypted = {
        ...decrypted,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        expiresAt: Date.now() + refreshed.expiresIn * 1000,
      };
      // Persist refreshed tokens
      await db.integrationConfig.update({
        where: { provider: "xero" },
        data: { configJson: encryptJson(decrypted as unknown as Record<string, unknown>) },
      });
    }

    // Test connection and get org info
    const connectionTest = await testConnection(decrypted.accessToken, decrypted.tenantId);
    if (!connectionTest.success) {
      return NextResponse.json(
        { error: connectionTest.error ?? "Connection failed" },
        { status: 400 }
      );
    }

    // Fetch sample invoices (first page only)
    const sampleInvoices: Array<Record<string, unknown>> = [];
    for await (const batch of fetchInvoices(decrypted.accessToken, decrypted.tenantId)) {
      for (const inv of batch.slice(0, 10)) {
        sampleInvoices.push({
          id: inv.InvoiceID,
          number: inv.InvoiceNumber,
          contact: inv.Contact?.Name,
          total: inv.Total,
          status: inv.Status,
          date: inv.DateString,
          type: inv.Type,
        });
      }
      break; // Only first batch
    }

    // Fetch sample expenses (first page only)
    const sampleExpenses: Array<Record<string, unknown>> = [];
    for await (const batch of fetchExpenses(decrypted.accessToken, decrypted.tenantId)) {
      for (const exp of batch.slice(0, 10)) {
        sampleExpenses.push({
          id: exp.BankTransactionID,
          contact: exp.Contact?.Name,
          total: exp.Total,
          status: exp.Status,
          date: exp.DateString,
          type: exp.Type,
        });
      }
      break; // Only first batch
    }

    return NextResponse.json({
      success: true,
      organisation: {
        name: connectionTest.orgName ?? decrypted.tenantName,
      },
      invoices: {
        total: sampleInvoices.length,
        samples: sampleInvoices,
      },
      expenses: {
        total: sampleExpenses.length,
        samples: sampleExpenses,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Discovery failed" },
      { status: 500 }
    );
  }
}
