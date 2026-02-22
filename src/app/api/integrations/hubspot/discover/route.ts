import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { decryptJson } from "@/lib/encryption";

/**
 * POST /api/integrations/hubspot/discover
 *
 * Fetches pipelines, sample deals, and sample companies from HubSpot
 * so users can preview their data before syncing.
 */
export async function POST(_request: NextRequest) {
  const auth = await requireRole("admin");
  if (auth.error) return auth.error;

  const config = await db.integrationConfig.findUnique({
    where: { provider: "hubspot" },
  });

  if (!config) {
    return NextResponse.json(
      { error: "HubSpot integration not configured" },
      { status: 404 }
    );
  }

  let decrypted: Record<string, unknown>;
  try {
    decrypted = decryptJson(config.configJson);
  } catch {
    return NextResponse.json(
      { error: "Failed to decrypt config" },
      { status: 400 }
    );
  }

  const accessToken = decrypted.accessToken as string;
  if (!accessToken) {
    return NextResponse.json(
      { error: "Access token not configured" },
      { status: 400 }
    );
  }

  const headers = { Authorization: `Bearer ${accessToken}` };

  try {
    // Fetch pipelines, sample deals, and sample companies in parallel
    const [pipelinesRes, dealsRes, companiesRes] = await Promise.all([
      fetch("https://api.hubapi.com/crm/v3/pipelines/deals", { headers }),
      fetch(
        "https://api.hubapi.com/crm/v3/objects/deals?limit=10&properties=dealname,amount,dealstage,closedate,pipeline",
        { headers }
      ),
      fetch(
        "https://api.hubapi.com/crm/v3/objects/companies?limit=10&properties=name,domain,industry",
        { headers }
      ),
    ]);

    const pipelines = pipelinesRes.ok
      ? ((await pipelinesRes.json()) as { results: Array<{ id: string; label: string; stages: Array<{ id: string; label: string }> }> }).results
      : [];

    const dealsData = dealsRes.ok
      ? ((await dealsRes.json()) as { total: number; results: Array<{ id: string; properties: Record<string, string> }> })
      : { total: 0, results: [] };

    const companiesData = companiesRes.ok
      ? ((await companiesRes.json()) as { total: number; results: Array<{ id: string; properties: Record<string, string> }> })
      : { total: 0, results: [] };

    return NextResponse.json({
      success: true,
      pipelines: pipelines.map((p) => ({
        id: p.id,
        label: p.label,
        stages: p.stages?.map((s) => ({ id: s.id, label: s.label })) ?? [],
      })),
      deals: {
        total: dealsData.total,
        samples: dealsData.results.slice(0, 10).map((d) => ({
          id: d.id,
          name: d.properties.dealname,
          amount: d.properties.amount,
          stage: d.properties.dealstage,
          closeDate: d.properties.closedate,
          pipeline: d.properties.pipeline,
        })),
      },
      companies: {
        total: companiesData.total,
        samples: companiesData.results.slice(0, 10).map((c) => ({
          id: c.id,
          name: c.properties.name,
          domain: c.properties.domain,
          industry: c.properties.industry,
        })),
      },
      selectedPipeline: (decrypted.pipelineId as string) || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Discovery failed" },
      { status: 500 }
    );
  }
}
