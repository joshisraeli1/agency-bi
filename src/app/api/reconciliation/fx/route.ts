import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getFxRates, saveFxRates } from "@/lib/reconciliation/fx";

export async function GET() {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  return NextResponse.json({ rates: await getFxRates() });
}

export async function PUT(req: NextRequest) {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  try {
    const body = await req.json();
    const rates = body?.rates && typeof body.rates === "object" ? body.rates : {};
    return NextResponse.json({ rates: await saveFxRates(rates) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save FX rates";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
