import { db } from "@/lib/db";
import type { SyncAdapter, SyncContext, SyncProgress, SyncResult } from "./types";
import { syncLogger } from "./logger";

// In-memory progress tracking for polling
const progressMap = new Map<string, SyncProgress>();

export function getSyncProgress(importId: string): SyncProgress | null {
  return progressMap.get(importId) ?? null;
}

export class SyncEngine {
  async run(adapter: SyncAdapter, syncType: "full" | "incremental" = "full", triggeredBy?: string): Promise<string> {
    const dataImport = await db.dataImport.create({
      data: {
        provider: adapter.provider,
        syncType,
        status: "running",
        triggeredBy,
      },
    });

    const importId = dataImport.id;
    const context: SyncContext = {
      importId,
      provider: adapter.provider,
      syncType,
      triggeredBy,
    };

    progressMap.set(importId, {
      recordsFound: 0,
      recordsSynced: 0,
      recordsFailed: 0,
      currentStep: "Starting...",
    });

    // Run sync in background (don't await)
    this.execute(adapter, context).catch((err) => {
      syncLogger.error(importId, `Fatal sync error: ${err.message}`);
      this.finalize(importId, false, [err.message]);
    });

    return importId;
  }

  private async execute(adapter: SyncAdapter, context: SyncContext) {
    const startTime = Date.now();
    const allErrors: string[] = [];
    let totalFound = 0;
    let totalSynced = 0;
    let totalFailed = 0;

    try {
      for await (const batch of adapter.fetchAll(context)) {
        totalFound += batch.length;

        this.updateProgress(context.importId, {
          recordsFound: totalFound,
          recordsSynced: totalSynced,
          recordsFailed: totalFailed,
          currentStep: `Processing batch (${totalFound} found)...`,
        });

        const result = await adapter.mapAndUpsert(batch, context);
        totalSynced += result.synced;
        totalFailed += result.failed;
        allErrors.push(...result.errors);

        this.updateProgress(context.importId, {
          recordsFound: totalFound,
          recordsSynced: totalSynced,
          recordsFailed: totalFailed,
          currentStep: `Synced ${totalSynced}/${totalFound}`,
        });
      }

      await this.finalize(context.importId, true, allErrors, {
        recordsFound: totalFound,
        recordsSynced: totalSynced,
        recordsFailed: totalFailed,
        durationMs: Date.now() - startTime,
      });

      // Update integration last sync
      await db.integrationConfig.update({
        where: { provider: adapter.provider },
        data: {
          lastSyncAt: new Date(),
          lastSyncStatus: totalFailed > 0 ? "partial" : "success",
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      allErrors.push(msg);
      await this.finalize(context.importId, false, allErrors, {
        recordsFound: totalFound,
        recordsSynced: totalSynced,
        recordsFailed: totalFailed,
        durationMs: Date.now() - startTime,
      });
    }
  }

  private updateProgress(importId: string, progress: SyncProgress) {
    progressMap.set(importId, progress);
  }

  private async finalize(
    importId: string,
    success: boolean,
    errors: string[],
    stats?: { recordsFound: number; recordsSynced: number; recordsFailed: number; durationMs: number }
  ) {
    const progress = progressMap.get(importId);
    await db.dataImport.update({
      where: { id: importId },
      data: {
        status: success ? "completed" : "failed",
        recordsFound: stats?.recordsFound ?? progress?.recordsFound ?? 0,
        recordsSynced: stats?.recordsSynced ?? progress?.recordsSynced ?? 0,
        recordsFailed: stats?.recordsFailed ?? progress?.recordsFailed ?? 0,
        errorLog: errors.length > 0 ? JSON.stringify(errors.slice(0, 100)) : null,
        completedAt: new Date(),
      },
    });

    this.updateProgress(importId, {
      recordsFound: stats?.recordsFound ?? 0,
      recordsSynced: stats?.recordsSynced ?? 0,
      recordsFailed: stats?.recordsFailed ?? 0,
      currentStep: success ? "Completed" : "Failed",
    });

    // Clean up progress after 5 minutes
    setTimeout(() => progressMap.delete(importId), 5 * 60 * 1000);
  }
}

export const syncEngine = new SyncEngine();
