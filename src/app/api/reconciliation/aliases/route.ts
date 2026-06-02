import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import {
  getReconciliationAliases,
  saveReconciliationAliases,
  type NameAlias,
} from "@/lib/reconciliation/aliases";

export async function GET() {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  return NextResponse.json({ aliases: await getReconciliationAliases() });
}

export async function PUT(req: NextRequest) {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;
  try {
    const body = await req.json();
    const incoming: NameAlias[] = Array.isArray(body?.aliases) ? body.aliases : [];
    const saved = await saveReconciliationAliases(incoming);
    return NextResponse.json({ aliases: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save aliases";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
