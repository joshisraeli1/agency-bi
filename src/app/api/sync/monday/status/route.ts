import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSyncProgress } from "@/lib/sync/engine";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const importId = searchParams.get("importId");

  if (!importId) {
    return NextResponse.json(
      { error: "Query parameter 'importId' is required" },
      { status: 400 }
    );
  }

  // Try in-memory progress first (available while sync is running)
  const progress = getSyncProgress(importId);

  if (progress) {
    return NextResponse.json({
      importId,
      status: progress.currentStep === "Completed"
        ? "completed"
        : progress.currentStep === "Failed"
          ? "failed"
          : "running",
      ...progress,
    });
  }

  // Fall back to DataImport record (sync already finished or server restarted)
  const dataImport = await db.dataImport.findUnique({
    where: { id: importId },
  });

  if (!dataImport) {
    return NextResponse.json(
      { error: "Import not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    importId: dataImport.id,
    status: dataImport.status,
    recordsFound: dataImport.recordsFound,
    recordsSynced: dataImport.recordsSynced,
    recordsFailed: dataImport.recordsFailed,
    currentStep: dataImport.status === "completed"
      ? "Completed"
      : dataImport.status === "failed"
        ? "Failed"
        : "Running",
    errorLog: dataImport.errorLog ? JSON.parse(dataImport.errorLog) : [],
    startedAt: dataImport.startedAt,
    completedAt: dataImport.completedAt,
  });
}
