import { hubspotRateLimiter } from "@/lib/sync/rate-limiter";

const BASE_URL = "https://api.hubapi.com";

interface HubSpotPaging {
  next?: {
    after: string;
  };
}

interface HubSpotDealProperties {
  dealname: string;
  amount: string | null;
  dealstage: string | null;
  closedate: string | null;
  pipeline: string | null;
  hs_object_id: string;
}

interface HubSpotCompanyProperties {
  name: string;
  domain: string | null;
  industry: string | null;
  hs_object_id: string;
}

interface HubSpotContactProperties {
  firstname: string | null;
  lastname: string | null;
  email: string | null;
  company: string | null;
  hs_object_id: string;
}

export interface HubSpotDeal {
  id: string;
  properties: HubSpotDealProperties;
  associations?: {
    companies?: {
      results: { id: string; type: string }[];
    };
  };
}

export interface HubSpotCompany {
  id: string;
  properties: HubSpotCompanyProperties;
}

export interface HubSpotContact {
  id: string;
  properties: HubSpotContactProperties;
}

export interface HubSpotOwner {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface HubSpotPipeline {
  id: string;
  label: string;
  stages: {
    id: string;
    label: string;
    displayOrder: number;
  }[];
}

interface HubSpotListResponse<T> {
  results: T[];
  paging?: HubSpotPaging;
}

async function hubspotFetch<T>(
  token: string,
  path: string,
  params?: Record<string, string>
): Promise<T> {
  await hubspotRateLimiter.acquire();

  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    let message = `HubSpot API error: ${response.status}`;
    try {
      const parsed = JSON.parse(errorBody);
      message = parsed.message || message;
    } catch {
      // Use default message
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function* fetchDeals(
  token: string,
  pipelineId?: string
): AsyncGenerator<HubSpotDeal[], void, unknown> {
  let after: string | undefined;
  const properties = "dealname,amount,dealstage,closedate,pipeline,hs_object_id";

  do {
    const params: Record<string, string> = {
      limit: "100",
      properties,
      associations: "companies",
    };
    if (after) params.after = after;

    const response = await hubspotFetch<HubSpotListResponse<HubSpotDeal>>(
      token,
      "/crm/v3/objects/deals",
      params
    );

    let deals = response.results;

    // Filter by pipeline if specified
    if (pipelineId) {
      deals = deals.filter(
        (deal) => deal.properties.pipeline === pipelineId
      );
    }

    if (deals.length > 0) {
      yield deals;
    }

    after = response.paging?.next?.after;
  } while (after);
}

export async function* fetchCompanies(
  token: string
): AsyncGenerator<HubSpotCompany[], void, unknown> {
  let after: string | undefined;
  const properties = "name,domain,industry,hs_object_id";

  do {
    const params: Record<string, string> = {
      limit: "100",
      properties,
    };
    if (after) params.after = after;

    const response = await hubspotFetch<HubSpotListResponse<HubSpotCompany>>(
      token,
      "/crm/v3/objects/companies",
      params
    );

    if (response.results.length > 0) {
      yield response.results;
    }

    after = response.paging?.next?.after;
  } while (after);
}

export async function* fetchContacts(
  token: string
): AsyncGenerator<HubSpotContact[], void, unknown> {
  let after: string | undefined;
  const properties = "firstname,lastname,email,company,hs_object_id";

  do {
    const params: Record<string, string> = {
      limit: "100",
      properties,
    };
    if (after) params.after = after;

    const response = await hubspotFetch<HubSpotListResponse<HubSpotContact>>(
      token,
      "/crm/v3/objects/contacts",
      params
    );

    if (response.results.length > 0) {
      yield response.results;
    }

    after = response.paging?.next?.after;
  } while (after);
}

export async function fetchOwners(token: string): Promise<HubSpotOwner[]> {
  const response = await hubspotFetch<{ results: HubSpotOwner[] }>(
    token,
    "/crm/v3/owners",
    { limit: "100" }
  );
  return response.results;
}

export async function fetchPipelines(token: string): Promise<HubSpotPipeline[]> {
  const response = await hubspotFetch<{ results: HubSpotPipeline[] }>(
    token,
    "/crm/v3/pipelines/deals"
  );
  return response.results;
}
