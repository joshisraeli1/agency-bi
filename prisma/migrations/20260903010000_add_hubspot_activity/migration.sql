-- Sales activity (calls, emails) from HubSpot engagement objects. Counts only.
CREATE TABLE "HubspotActivity" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "ownerId" TEXT,
    "ownerName" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "direction" TEXT,
    "status" TEXT,
    "durationMs" INTEGER,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HubspotActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HubspotActivity_type_timestamp_idx" ON "HubspotActivity"("type", "timestamp");
CREATE INDEX "HubspotActivity_ownerId_type_timestamp_idx" ON "HubspotActivity"("ownerId", "type", "timestamp");
