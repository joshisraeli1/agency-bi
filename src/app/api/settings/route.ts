import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth, requireRole, logAudit } from "@/lib/auth";

export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const settings = await db.appSettings.findFirst();
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  const session = auth.session;

  const body = await request.json();

  const settings = await db.appSettings.upsert({
    where: { id: "default" },
    update: {
      agencyName: body.agencyName,
      currency: body.currency,
      productiveHours: body.productiveHours ? parseFloat(body.productiveHours) : undefined,
      marginWarning: body.marginWarning ? parseFloat(body.marginWarning) : undefined,
      marginDanger: body.marginDanger ? parseFloat(body.marginDanger) : undefined,
      fiscalYearStart: body.fiscalYearStart ? parseInt(body.fiscalYearStart) : undefined,
    },
    create: {
      id: "default",
      agencyName: body.agencyName || "Swan Studio",
      currency: body.currency || "AUD",
      productiveHours: parseFloat(body.productiveHours) || 6.5,
      marginWarning: parseFloat(body.marginWarning) || 20.0,
      marginDanger: parseFloat(body.marginDanger) || 10.0,
      fiscalYearStart: parseInt(body.fiscalYearStart) || 7,
    },
  });

  await logAudit({ action: "settings_updated", userId: session.userId, entity: "settings", entityId: "default", details: `Updated app settings` });

  return NextResponse.json(settings);
}
