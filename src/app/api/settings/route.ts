import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await db.appSettings.findFirst();
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  return NextResponse.json(settings);
}
