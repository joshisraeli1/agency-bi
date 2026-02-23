import type Anthropic from "@anthropic-ai/sdk";

export const chatTools: Anthropic.Tool[] = [
  {
    name: "query_clients",
    description:
      "Search and list clients. Can filter by status, name, or list all. Returns client names, IDs, status, retainer values.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: {
          type: "string",
          description: "Filter by status: active, paused, churned, prospect",
        },
        search: {
          type: "string",
          description: "Search by client name (case-insensitive partial match)",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 20)",
        },
      },
      required: [],
    },
  },
  {
    name: "query_financials",
    description:
      "Query financial records. Can filter by client, month range, type (retainer/project/cost/hours). Returns amounts and breakdowns.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientId: { type: "string", description: "Filter by specific client ID" },
        months: {
          type: "number",
          description: "Number of recent months to include (default 6)",
        },
        type: {
          type: "string",
          description: "Filter by type: retainer, project, cost, hours",
        },
      },
      required: [],
    },
  },
  {
    name: "query_time_entries",
    description:
      "Query time tracking entries. Can filter by client, team member, date range. Returns hours, descriptions, team member names.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientId: { type: "string", description: "Filter by client ID" },
        teamMemberId: { type: "string", description: "Filter by team member ID" },
        months: { type: "number", description: "Number of recent months (default 3)" },
        limit: { type: "number", description: "Max results (default 50)" },
      },
      required: [],
    },
  },
  {
    name: "query_team_members",
    description:
      "List team members. Can filter by division, role, active status. Returns names, roles, rates, divisions.",
    input_schema: {
      type: "object" as const,
      properties: {
        division: { type: "string", description: "Filter by division" },
        active: { type: "boolean", description: "Filter by active status" },
        search: { type: "string", description: "Search by name" },
      },
      required: [],
    },
  },
  {
    name: "query_deliverables",
    description:
      "Query deliverables/creative assets. Can filter by client, status. Returns names, statuses, revision counts, assignments.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientId: { type: "string", description: "Filter by client ID" },
        status: { type: "string", description: "Filter by status" },
        limit: { type: "number", description: "Max results (default 30)" },
      },
      required: [],
    },
  },
  {
    name: "get_client_profitability",
    description:
      "Get detailed profitability analysis for a specific client including revenue, costs, margin, team breakdown, and monthly trends.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientId: { type: "string", description: "The client ID to analyze" },
        months: { type: "number", description: "Number of months to analyze (default 6)" },
      },
      required: ["clientId"],
    },
  },
  {
    name: "get_team_utilization",
    description:
      "Get utilization analysis for a specific team member including hours, client allocation, and monthly trends.",
    input_schema: {
      type: "object" as const,
      properties: {
        memberId: { type: "string", description: "The team member ID to analyze" },
        months: { type: "number", description: "Number of months (default 6)" },
      },
      required: ["memberId"],
    },
  },
  {
    name: "get_revenue_overview",
    description:
      "Get agency-wide revenue overview including trends, by-client breakdown, and at-risk clients.",
    input_schema: {
      type: "object" as const,
      properties: {
        months: { type: "number", description: "Number of months (default 6)" },
      },
      required: [],
    },
  },
  {
    name: "get_agency_kpis",
    description:
      "Get agency KPIs including utilization, margin, revenue per head, retention, and division breakdown.",
    input_schema: {
      type: "object" as const,
      properties: {
        months: { type: "number", description: "Number of months (default 6)" },
      },
      required: [],
    },
  },
  {
    name: "query_communications",
    description:
      "Query Slack communication logs. Returns message counts and recent messages per client. Use to analyze communication overhead and client engagement.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientId: {
          type: "string",
          description: "Filter by specific client ID",
        },
        startDate: {
          type: "string",
          description: "Start date (ISO format, e.g. 2025-01-01)",
        },
        endDate: {
          type: "string",
          description: "End date (ISO format, e.g. 2025-06-30)",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 50)",
        },
      },
      required: [],
    },
  },
  {
    name: "query_meetings",
    description:
      "Query Google Calendar meeting logs. Returns meeting counts, durations, and attendees per client. Use to analyze meeting overhead and time spent with clients.",
    input_schema: {
      type: "object" as const,
      properties: {
        clientId: {
          type: "string",
          description: "Filter by specific client ID",
        },
        startDate: {
          type: "string",
          description: "Start date (ISO format, e.g. 2025-01-01)",
        },
        endDate: {
          type: "string",
          description: "End date (ISO format, e.g. 2025-06-30)",
        },
        limit: {
          type: "number",
          description: "Max results to return (default 50)",
        },
      },
      required: [],
    },
  },
  {
    name: "generate_chart",
    description:
      "Generate a chart to visually display data. Use this when the user asks to see data visually or when a chart would help explain the data.",
    input_schema: {
      type: "object" as const,
      properties: {
        chartType: {
          type: "string",
          enum: ["line", "bar", "pie", "area"],
          description: "The type of chart to generate",
        },
        title: { type: "string", description: "Chart title" },
        data: {
          type: "array",
          description: "Array of data objects for the chart",
          items: { type: "object" },
        },
        xKey: { type: "string", description: "Key for X axis (not needed for pie)" },
        yKeys: {
          type: "array",
          items: { type: "string" },
          description: "Keys for Y axis values / pie values",
        },
        yLabels: {
          type: "array",
          items: { type: "string" },
          description: "Display labels for Y keys",
        },
      },
      required: ["chartType", "title", "data"],
    },
  },
];
