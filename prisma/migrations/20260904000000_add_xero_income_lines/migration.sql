-- Per-account Xero P&L income lines, used to split revenue by division.
CREATE TABLE "XeroPnlIncomeLine" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "XeroPnlIncomeLine_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "XeroPnlIncomeLine_month_account_key" ON "XeroPnlIncomeLine"("month", "account");
CREATE INDEX "XeroPnlIncomeLine_month_idx" ON "XeroPnlIncomeLine"("month");
