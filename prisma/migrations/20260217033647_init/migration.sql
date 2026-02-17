-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'admin',
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "industry" TEXT,
    "website" TEXT,
    "retainerValue" REAL,
    "dealStage" TEXT,
    "hubspotDealId" TEXT,
    "hubspotCompanyId" TEXT,
    "mondayItemId" TEXT,
    "sheetsRowIndex" INTEGER,
    "source" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ClientAlias" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientAlias_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Division" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Division_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DivisionExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "divisionId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DivisionExpense_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DivisionTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "divisionId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "target" REAL NOT NULL,
    "actual" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DivisionTarget_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "tier" TEXT,
    "description" TEXT,
    "hoursIncluded" REAL,
    "monthlyRate" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" TEXT,
    "division" TEXT,
    "location" TEXT,
    "employmentType" TEXT,
    "costType" TEXT,
    "annualSalary" REAL,
    "hourlyRate" REAL,
    "weeklyHours" REAL,
    "mondayUserId" TEXT,
    "sheetsRowIndex" INTEGER,
    "source" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "FinancialRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "amount" REAL NOT NULL,
    "hours" REAL,
    "description" TEXT,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinancialRecord_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT,
    "teamMemberId" TEXT,
    "date" DATETIME NOT NULL,
    "hours" REAL NOT NULL,
    "description" TEXT,
    "mondayItemId" TEXT,
    "mondayBoardId" TEXT,
    "isIncomplete" BOOLEAN NOT NULL DEFAULT false,
    "isOverhead" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Deliverable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT,
    "name" TEXT NOT NULL,
    "editCode" TEXT,
    "status" TEXT,
    "dueDate" DATETIME,
    "completedDate" DATETIME,
    "revisionCount" INTEGER NOT NULL DEFAULT 0,
    "mondayItemId" TEXT,
    "mondayBoardId" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Deliverable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliverableAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliverableId" TEXT NOT NULL,
    "teamMemberId" TEXT,
    "role" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliverableAssignment_deliverableId_fkey" FOREIGN KEY ("deliverableId") REFERENCES "Deliverable" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliverableAssignment_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientAssignment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientAssignment_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "TeamMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CommunicationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT,
    "summary" TEXT,
    "date" DATETIME NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunicationLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MeetingLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT,
    "title" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "duration" INTEGER,
    "summary" TEXT,
    "source" TEXT NOT NULL,
    "externalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingLog_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MeetingAttendee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetingId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    CONSTRAINT "MeetingAttendee_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "MeetingLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataImport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "recordsFound" INTEGER NOT NULL DEFAULT 0,
    "recordsSynced" INTEGER NOT NULL DEFAULT 0,
    "recordsFailed" INTEGER NOT NULL DEFAULT 0,
    "errorLog" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "triggeredBy" TEXT
);

-- CreateTable
CREATE TABLE "IntegrationConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "lastSyncAt" DATETIME,
    "lastSyncStatus" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agencyName" TEXT NOT NULL DEFAULT 'Swan Studio',
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "productiveHours" REAL NOT NULL DEFAULT 6.5,
    "marginWarning" REAL NOT NULL DEFAULT 20.0,
    "marginDanger" REAL NOT NULL DEFAULT 10.0,
    "fiscalYearStart" INTEGER NOT NULL DEFAULT 7
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "details" TEXT,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AllowedIP" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "address" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_hubspotDealId_key" ON "Client"("hubspotDealId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_hubspotCompanyId_key" ON "Client"("hubspotCompanyId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientAlias_alias_source_key" ON "ClientAlias"("alias", "source");

-- CreateIndex
CREATE UNIQUE INDEX "Division_clientId_name_key" ON "Division"("clientId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DivisionExpense_divisionId_month_category_key" ON "DivisionExpense"("divisionId", "month", "category");

-- CreateIndex
CREATE UNIQUE INDEX "DivisionTarget_divisionId_month_metric_key" ON "DivisionTarget"("divisionId", "month", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "Package_name_key" ON "Package"("name");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_email_key" ON "TeamMember"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_mondayUserId_key" ON "TeamMember"("mondayUserId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialRecord_clientId_month_type_category_key" ON "FinancialRecord"("clientId", "month", "type", "category");

-- CreateIndex
CREATE UNIQUE INDEX "TimeEntry_mondayItemId_teamMemberId_date_key" ON "TimeEntry"("mondayItemId", "teamMemberId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Deliverable_mondayItemId_key" ON "Deliverable"("mondayItemId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliverableAssignment_deliverableId_teamMemberId_role_key" ON "DeliverableAssignment"("deliverableId", "teamMemberId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ClientAssignment_clientId_teamMemberId_role_key" ON "ClientAssignment"("clientId", "teamMemberId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingAttendee_meetingId_email_key" ON "MeetingAttendee"("meetingId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConfig_provider_key" ON "IntegrationConfig"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "AllowedIP_address_key" ON "AllowedIP"("address");
