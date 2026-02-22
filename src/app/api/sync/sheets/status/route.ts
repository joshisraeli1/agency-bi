import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSyncProgress } from "@/lib/sync/engine";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const importId = searchParams.get("importId");

  if (!importId) {
    return NextResponse.json(
      { error: "Missing importId query parameter" },
      { status: 400 }
    );
  }

  // First check in-memory progress (for active syncs)
  const progress = getSyncProgress(importId);

  // Also fetch the DB record for final status
  const dataImport = await db.dataImport.findUnique({
    where: { id: importId },
    select: {
      id: true,
      provider: true,
      status: true,
      recordsFound: true,
      recordsSynced: true,
      recordsFailed: true,
      errorLog: true,
      startedAt: true,
      completedAt: true,
    },
  });

  if (!dataImport) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  }

  // Parse error log if present
  let errors: string[] = [];
  if (dataImport.errorLog) {
    try {
      errors = JSON.parse(dataImport.errorLog);
    } catch {
      errors = [dataImport.errorLog];
    }
  }

  return NextResponse.json({
    importId: dataImport.id,
    provider: dataImport.provider,
    status: dataImport.status,
    recordsFound: progress?.recordsFound ?? dataImport.recordsFound,
    recordsSynced: progress?.recordsSynced ?? dataImport.recordsSynced,
    recordsFailed: progress?.recordsFailed ?? dataImport.recordsFailed,
    currentStep: progress?.currentStep ?? (dataImport.status === "completed" ? "Completed" : dataImport.status === "failed" ? "Failed" : "Unknown"),
    errors: errors.slice(0, 20), // Limit errors returned to client
    startedAt: dataImport.startedAt,
    completedAt: dataImport.completedAt,
  });
}
