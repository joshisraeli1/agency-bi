-- Business Balance moved from financial years to FY quarters.
CREATE TABLE "XeroPeriodPnl" (
    "period" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "income" DOUBLE PRECISION NOT NULL,
    "directLabour" DOUBLE PRECISION NOT NULL,
    "costOfSalesOther" DOUBLE PRECISION NOT NULL,
    "operatingExpenses" DOUBLE PRECISION NOT NULL,
    "operatingProfit" DOUBLE PRECISION NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "XeroPeriodPnl_pkey" PRIMARY KEY ("period")
);

DROP TABLE "XeroFinancialYear";
