import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { encryptJson } from "@/lib/encryption";
import { exchangeCode } from "@/lib/integrations/calendar";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    const redirectUrl = new URL("/integrations/calendar", process.env.NEXT_PUBLIC_APP_URL);
    redirectUrl.searchParams.set("error", error);
    return NextResponse.redirect(redirectUrl.toString());
  }

  if (!code) {
    const redirectUrl = new URL("/integrations/calendar", process.env.NEXT_PUBLIC_APP_URL);
    redirectUrl.searchParams.set("error", "No authorization code received");
    return NextResponse.redirect(redirectUrl.toString());
  }

  try {
    const tokens = await exchangeCode(code);

    const configData = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    };

    const encrypted = encryptJson(configData);

    await db.integrationConfig.upsert({
      where: { provider: "calendar" },
      create: {
        provider: "calendar",
        enabled: true,
        configJson: encrypted,
      },
      update: {
        enabled: true,
        configJson: encrypted,
      },
    });

    const redirectUrl = new URL("/integrations/calendar", process.env.NEXT_PUBLIC_APP_URL);
    redirectUrl.searchParams.set("connected", "true");
    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth callback failed";
    const redirectUrl = new URL("/integrations/calendar", process.env.NEXT_PUBLIC_APP_URL);
    redirectUrl.searchParams.set("error", message);
    return NextResponse.redirect(redirectUrl.toString());
  }
}
