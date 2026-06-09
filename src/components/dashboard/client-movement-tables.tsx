"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMonth, formatCurrency } from "@/lib/utils";
import type { NewClientDealSizeData } from "@/lib/analytics/types";

interface Props {
  newClientDealSize: NewClientDealSizeData;
}

export function ClientMovementTables({ newClientDealSize }: Props) {
  // Show every month in the selected range (incl. the current month even when
  // it has no movement yet) so the timeline is complete and nothing looks
  // "missing" — e.g. the current month with zero new clients.
  const dealSizeMonths = newClientDealSize.months;
  const churnedMonths = newClientDealSize.churnedMonths;

  return (
    <div className="space-y-6">
      {/* New Revenue Won */}
      {dealSizeMonths.length > 0 && (
        <>
          <div>
            <h2 className="text-xl font-semibold">New Revenue Won</h2>
            <p className="text-muted-foreground text-sm mt-1">
              New clients by start month with division and monthly retainer
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">New Clients by Month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium">Month</th>
                      <th className="text-left py-2 px-3 font-medium">Client</th>
                      <th className="text-left py-2 px-3 font-medium">Division</th>
                      <th className="text-right py-2 px-3 font-medium">Monthly Retainer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dealSizeMonths.map((m) => (
                      <>
                        {m.clients.map((client, i) => (
                          <tr
                            key={`new-${m.month}-${client.clientId}`}
                            className="border-b last:border-0"
                          >
                            <td className="py-2 px-3 font-medium">
                              {i === 0 ? formatMonth(m.month) : ""}
                            </td>
                            <td className="py-2 px-3">{client.clientName}</td>
                            <td className="py-2 px-3 text-muted-foreground">{client.division}</td>
                            <td className="text-right py-2 px-3">
                              {client.dealSize > 0 ? formatCurrency(client.dealSize) : "\u2014"}
                            </td>
                          </tr>
                        ))}
                        <tr key={`new-total-${m.month}`} className="border-b bg-muted/50">
                          <td className="py-2 px-3 font-semibold">{formatMonth(m.month)} Total</td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {m.clientCount} client{m.clientCount !== 1 ? "s" : ""}
                          </td>
                          <td />
                          <td className="text-right py-2 px-3 font-semibold">
                            {formatCurrency(m.totalDealSize)}
                          </td>
                        </tr>
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Clients Churned */}
      {churnedMonths.length > 0 && (
        <>
          <div>
            <h2 className="text-xl font-semibold">Clients Churned</h2>
            <p className="text-muted-foreground text-sm mt-1">
              Churned clients by end month with division and lost monthly retainer
            </p>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Churned Clients by Month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-3 font-medium">Month</th>
                      <th className="text-left py-2 px-3 font-medium">Client</th>
                      <th className="text-left py-2 px-3 font-medium">Division</th>
                      <th className="text-right py-2 px-3 font-medium">Lost Retainer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {churnedMonths.map((m) => (
                      <>
                        {m.clients.map((client, i) => (
                          <tr
                            key={`churn-${m.month}-${client.clientId}`}
                            className="border-b last:border-0"
                          >
                            <td className="py-2 px-3 font-medium">
                              {i === 0 ? formatMonth(m.month) : ""}
                            </td>
                            <td className="py-2 px-3">{client.clientName}</td>
                            <td className="py-2 px-3 text-muted-foreground">{client.division}</td>
                            <td className="text-right py-2 px-3 text-red-600">
                              {client.dealSize > 0 ? formatCurrency(client.dealSize) : "\u2014"}
                            </td>
                          </tr>
                        ))}
                        <tr key={`churn-total-${m.month}`} className="border-b bg-muted/50">
                          <td className="py-2 px-3 font-semibold">{formatMonth(m.month)} Total</td>
                          <td className="py-2 px-3 text-muted-foreground">
                            {m.clientCount} client{m.clientCount !== 1 ? "s" : ""}
                          </td>
                          <td />
                          <td className="text-right py-2 px-3 font-semibold text-red-600">
                            {formatCurrency(m.totalDealSize)}
                          </td>
                        </tr>
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
