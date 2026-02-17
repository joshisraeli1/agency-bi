import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, UserCog, Plug, Clock } from "lucide-react";

export default async function OverviewPage() {
  const [clientCount, teamCount, recentImports] = await Promise.all([
    db.client.count(),
    db.teamMember.count(),
    db.dataImport.findMany({
      orderBy: { startedAt: "desc" },
      take: 5,
    }),
  ]);

  const integrations = await db.integrationConfig.findMany({
    where: { enabled: true },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Overview</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Clients
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Team Members
            </CardTitle>
            <UserCog className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Integrations
            </CardTitle>
            <Plug className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{integrations.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Recent Syncs
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentImports.length}</div>
          </CardContent>
        </Card>
      </div>

      {recentImports.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Imports</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentImports.map((imp) => (
                <div
                  key={imp.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="font-medium capitalize">{imp.provider}</span>
                  <span className="text-muted-foreground">
                    {imp.recordsSynced} records &middot;{" "}
                    <span
                      className={
                        imp.status === "completed"
                          ? "text-green-600"
                          : imp.status === "failed"
                          ? "text-red-600"
                          : "text-yellow-600"
                      }
                    >
                      {imp.status}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
