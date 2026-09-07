-- HubSpot "Outreach Source" on deals, for deal-source reporting.
ALTER TABLE "HubspotDeal" ADD COLUMN "outreachSource" TEXT;

-- Financial-year P&L split for the revenue-allocation chart.
CREATE TABLE "XeroFinancialYear" (
    "fy" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "income" DOUBLE PRECISION NOT NULL,
    "directLabour" DOUBLE PRECISION NOT NULL,
    "costOfSalesOther" DOUBLE PRECISION NOT NULL,
    "operatingExpenses" DOUBLE PRECISION NOT NULL,
    "operatingProfit" DOUBLE PRECISION NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "XeroFinancialYear_pkey" PRIMARY KEY ("fy")
);
