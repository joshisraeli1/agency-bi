-- Dialler metadata on call activity, for daily call output and outcome reporting.
ALTER TABLE "HubspotActivity" ADD COLUMN "fromNumber" TEXT;
ALTER TABLE "HubspotActivity" ADD COLUMN "source" TEXT;
ALTER TABLE "HubspotActivity" ADD COLUMN "outcome" TEXT;
