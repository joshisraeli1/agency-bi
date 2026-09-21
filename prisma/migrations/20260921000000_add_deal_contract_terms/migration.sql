-- HubSpot "Contract Terms" — 3-month / 6-month / Month to Month / One-off.
-- Needed to tell whether a client converted past their minimum term.
ALTER TABLE "HubspotDeal" ADD COLUMN "contractTerms" TEXT;
