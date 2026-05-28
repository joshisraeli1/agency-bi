import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const ALLOWED_REVIEW = new Set(["open", "resolved", "ignored"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const data: { reviewStatus?: string; notes?: string | null } = {};
  if (body.reviewStatus !== undefined) {
    if (!ALLOWED_REVIEW.has(body.reviewStatus)) {
      return NextResponse.json({ error: "invalid reviewStatus" }, { status: 400 });
    }
    data.reviewStatus = body.reviewStatus;
  }
  if (body.notes !== undefined) {
    data.notes = body.notes === "" ? null : String(body.notes).slice(0, 2000);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const updated = await db.reconciliation.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
}
