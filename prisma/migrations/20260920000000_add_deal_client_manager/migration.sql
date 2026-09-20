-- The HubSpot deal property "Client Manager" — who owns the client relationship,
-- as distinct from "Executor" (account_manager), which is the delivery owner.
ALTER TABLE "HubspotDeal" ADD COLUMN "clientManager" TEXT;
