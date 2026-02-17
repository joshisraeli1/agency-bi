import { db } from "@/lib/db";

class SyncLogger {
  async error(importId: string, message: string) {
    console.error(`[Sync ${importId}] ERROR: ${message}`);
    await this.appendToLog(importId, message);
  }

  async warn(importId: string, message: string) {
    console.warn(`[Sync ${importId}] WARN: ${message}`);
  }

  info(importId: string, message: string) {
    console.log(`[Sync ${importId}] ${message}`);
  }

  private async appendToLog(importId: string, message: string) {
    try {
      const record = await db.dataImport.findUnique({
        where: { id: importId },
        select: { errorLog: true },
      });
      const errors: string[] = record?.errorLog ? JSON.parse(record.errorLog) : [];
      errors.push(`${new Date().toISOString()} - ${message}`);
      await db.dataImport.update({
        where: { id: importId },
        data: { errorLog: JSON.stringify(errors.slice(-100)) },
      });
    } catch {
      console.error(`Failed to append to sync log for ${importId}`);
    }
  }
}

export const syncLogger = new SyncLogger();
