import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/encryption";
import { testConnection as testSheetsConnection } from "@/lib/integrations/sheets";
import { testConnection as testXeroConnection } from "@/lib/integrations/xero";
import { testConnection as testSlackConnection } from "@/lib/integrations/slack";
import { testConnectionGmail } from "@/lib/integrations/gmail";
import { testConnectionCalendar } from "@/lib/integrations/calendar";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  const config = await db.integrationConfig.findUnique({
    where: { provider },
  });

  if (!config) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  let decrypted: Record<string, unknown> = {};
  try {
    if (config.configJson && config.configJson !== "{}") {
      decrypted = decryptJson(config.configJson);
    }
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to decrypt config" },
      { status: 400 }
    );
  }

  try {
    switch (provider) {
      case "monday": {
        const token = decrypted.apiToken as string;
        if (!token) throw new Error("API token not configured");
        const res = await fetch("https://api.monday.com/v2", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: token,
          },
          body: JSON.stringify({ query: "{ me { name } }" }),
        });
        const data = await res.json();
        if (data.errors) throw new Error(data.errors[0].message);
        return NextResponse.json({
          success: true,
          message: `Connected as ${data.data.me.name}`,
        });
      }

      case "hubspot": {
        const token = decrypted.accessToken as string;
        if (!token) throw new Error("Access token not configured");
        const res = await fetch(
          "https://api.hubapi.com/crm/v3/objects/deals?limit=1",
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || `HTTP ${res.status}`);
        }
        return NextResponse.json({
          success: true,
          message: "Connected to HubSpot",
        });
      }

      case "sheets": {
        const serviceAccountEmail = decrypted.serviceAccountEmail as string;
        const privateKey = decrypted.privateKey as string;
        const sheetId = decrypted.sheetId as string;
        if (!serviceAccountEmail) throw new Error("Service account email not configured");
        if (!privateKey) throw new Error("Private key not configured");
        if (!sheetId) throw new Error("Sheet ID not configured");
        const sheetsResult = await testSheetsConnection(serviceAccountEmail, privateKey, sheetId);
        if (!sheetsResult.success) {
          throw new Error(sheetsResult.error ?? "Connection failed");
        }
        return NextResponse.json({
          success: true,
          message: `Connected! Found ${sheetsResult.tabs?.length ?? 0} tab(s)`,
          tabs: sheetsResult.tabs,
        });
      }

      case "xero": {
        const accessToken = decrypted.accessToken as string;
        const tenantId = decrypted.tenantId as string;
        if (!accessToken) throw new Error("Access token not configured");
        if (!tenantId) throw new Error("Tenant ID not configured");
        const xeroResult = await testXeroConnection(accessToken, tenantId);
        if (!xeroResult.success) {
          throw new Error(xeroResult.error ?? "Connection failed");
        }
        return NextResponse.json({
          success: true,
          message: `Connected to ${xeroResult.orgName || "Xero"}`,
        });
      }

      case "slack": {
        const botToken = decrypted.botToken as string;
        if (!botToken) throw new Error("Bot token not configured");
        const slackResult = await testSlackConnection(botToken);
        if (!slackResult.success) {
          throw new Error(slackResult.error ?? "Connection failed");
        }
        return NextResponse.json({
          success: true,
          message: `Connected to ${slackResult.team || "Slack"} as ${slackResult.user || "bot"}`,
        });
      }

      case "gmail": {
        const gmailAccessToken = decrypted.accessToken as string;
        if (!gmailAccessToken) throw new Error("Access token not configured");
        const gmailResult = await testConnectionGmail(gmailAccessToken);
        if (!gmailResult.success) {
          throw new Error(gmailResult.error ?? "Connection failed");
        }
        return NextResponse.json({
          success: true,
          message: `Connected as ${gmailResult.email || "Gmail user"}`,
        });
      }

      case "calendar": {
        const calAccessToken = decrypted.accessToken as string;
        if (!calAccessToken) throw new Error("Access token not configured");
        const calResult = await testConnectionCalendar(calAccessToken);
        if (!calResult.success) {
          throw new Error(calResult.error ?? "Connection failed");
        }
        return NextResponse.json({
          success: true,
          message: `Connected! Found ${calResult.calendars?.length ?? 0} calendar(s)`,
          calendars: calResult.calendars,
        });
      }

      default:
        return NextResponse.json(
          { success: false, error: "Test not available for this provider" },
          { status: 400 }
        );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}
