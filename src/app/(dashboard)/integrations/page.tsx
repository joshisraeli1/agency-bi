import { db } from "@/lib/db";
import { IntegrationCard } from "@/components/integrations/integration-card";

const integrationMeta: Record<
  string,
  { name: string; description: string; configUrl: string; disabled?: boolean }
> = {
  monday: {
    name: "Monday.com",
    description: "Time tracking, deliverables, and project management",
    configUrl: "/integrations/monday",
  },
  hubspot: {
    name: "HubSpot",
    description: "Deals, companies, contacts, and pipeline data",
    configUrl: "/integrations/hubspot",
  },
  sheets: {
    name: "Google Sheets",
    description: "Efficiency sheet — salary data, client data, costs",
    configUrl: "/integrations/sheets",
  },
  xero: {
    name: "Xero",
    description: "Invoices, expenses, and financial data",
    configUrl: "/integrations/xero",
  },
  slack: {
    name: "Slack",
    description: "Client communication logs and team activity",
    configUrl: "/integrations/slack",
  },
  gmail: {
    name: "Gmail",
    description: "Client email communication tracking",
    configUrl: "/integrations/gmail",
  },
  calendar: {
    name: "Google Calendar",
    description: "Meeting logs and client meeting tracking",
    configUrl: "/integrations/calendar",
  },
};

export default async function IntegrationsPage() {
  const configs = await db.integrationConfig.findMany();
  const configMap = new Map(configs.map((c) => [c.provider, c]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Connect your data sources to sync client and team data.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(integrationMeta).map(([provider, meta]) => {
          const config = configMap.get(provider);
          return (
            <IntegrationCard
              key={provider}
              provider={provider}
              name={meta.name}
              description={meta.description}
              enabled={config?.enabled ?? false}
              lastSyncAt={config?.lastSyncAt?.toISOString() ?? null}
              lastSyncStatus={config?.lastSyncStatus ?? null}
              configUrl={meta.configUrl}
              disabled={meta.disabled ?? false}
            />
          );
        })}
      </div>
    </div>
  );
}
