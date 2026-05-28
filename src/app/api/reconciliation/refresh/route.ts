import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { runReconciliation } from "@/lib/reconciliation/engine";

export async function POST() {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;

  try {
    const result = await runReconciliation();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Reconciliation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
