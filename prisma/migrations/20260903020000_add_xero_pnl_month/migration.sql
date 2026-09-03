-- Monthly Xero P&L summary (ex-GST, accrual). netProfit is Xero's own row.
CREATE TABLE "XeroPnlMonth" (
    "month" TEXT NOT NULL,
    "totalIncome" DOUBLE PRECISION NOT NULL,
    "otherIncome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "costOfSales" DOUBLE PRECISION NOT NULL,
    "operatingExpenses" DOUBLE PRECISION NOT NULL,
    "grossProfit" DOUBLE PRECISION NOT NULL,
    "netProfit" DOUBLE PRECISION NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "XeroPnlMonth_pkey" PRIMARY KEY ("month")
);
