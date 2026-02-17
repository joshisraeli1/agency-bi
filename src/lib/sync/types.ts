export interface SyncContext {
  importId: string;
  provider: string;
  syncType: "full" | "incremental";
  triggeredBy?: string;
}

export interface SyncProgress {
  recordsFound: number;
  recordsSynced: number;
  recordsFailed: number;
  currentStep?: string;
}

export interface SyncResult {
  success: boolean;
  recordsFound: number;
  recordsSynced: number;
  recordsFailed: number;
  errors: string[];
  durationMs: number;
}

export interface SyncAdapter<T = unknown> {
  name: string;
  provider: string;
  fetchAll(context: SyncContext): AsyncGenerator<T[], void, unknown>;
  mapAndUpsert(items: T[], context: SyncContext): Promise<{ synced: number; failed: number; errors: string[] }>;
}
