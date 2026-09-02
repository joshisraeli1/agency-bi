-- HubSpot deal property "Company name": the client identity for this account.
-- Company associations are absent on most Content Machine deals, so this is what
-- ties a base deal to its upsells and downsells.
ALTER TABLE "HubspotDeal" ADD COLUMN "companyName" TEXT;
