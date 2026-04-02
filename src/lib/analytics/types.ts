export interface ClientProfitability {
  clientId: string;
  clientName: string;
  status: string;
  retainerValue: number;
  totalRevenue: number;
  totalCost: number;
  margin: number;
  marginPercent: number;
  totalHours: number;
  effectiveRate: number;
  teamBreakdown: {
    memberId: string;
    memberName: string;
    hours: number;
    cost: number;
  }[];
  monthlyTrend: {
    month: string;
    revenue: number;
    cost: number;
    margin: number;
  }[];
}

export interface TeamMemberUtilization {
  memberId: string;
  memberName: string;
  role: string | null;
  division: string | null;
  employmentType: string | null;
  effectiveRate: number | null;
  totalHours: number;
  billableHours: number;
  overheadHours: number;
  utilizationRate: number;
  clientAllocation: {
    clientId: string;
    clientName: string;
    hours: number;
    percent: number;
  }[];
  monthlyTrend: {
    month: string;
    hours: number;
    billableHours: number;
    overheadHours: number;
  }[];
}

export interface RevenueOverview {
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  avgMarginPercent: number;
  annualizedRevenue: number;
  annualizedProfit: number;
  revenueBySource: {
    source: string;
    revenue: number;
  }[];
  monthlyTrend: {
    month: string;
    revenue: number;
    cost: number;
    margin: number;
    hubspotRevenue: number;
    xeroRevenue: number;
    hubspotRevenueIncGst: number;
    xeroRevenueIncGst: number;
    activeRevenue: number;
    activeRevenueIncGst: number;
  }[];
  quarterlyTrend: {
    quarter: string;
    hubspotRevenue: number;
    xeroRevenue: number;
    hubspotRevenueIncGst: number;
    xeroRevenueIncGst: number;
    revenue: number;
    cost: number;
    margin: number;
  }[];
  byClient: {
    clientId: string;
    clientName: string;
    revenue: number;
    cost: number;
    margin: number;
    marginPercent: number;
  }[];
  atRiskClients: {
    clientId: string;
    clientName: string;
    marginPercent: number;
    reason: string;
  }[];
}

export interface AgencyKPIs {
  avgUtilization: number;
  avgMargin: number;
  revenuePerHead: number;
  totalRevenue: number;
  totalTeamMembers: number;
  activeClients: number;
  clientRetention: number;
  hoursByDivision: {
    division: string;
    hours: number;
  }[];
  monthlyTrend: {
    month: string;
    utilization: number;
    margin: number;
    revenue: number;
  }[];
  marginByDivision: {
    division: string;
    revenue: number;
    cost: number;
    margin: number;
    marginPercent: number;
  }[];
  divisionMarginTrend: Record<string, unknown>[];
  clientLTVByIndustry: {
    industry: string;
    revenue: number;
  }[];
  clientLTVByDivision: {
    division: string;
    revenue: number;
  }[];
  hubspotProfitability: DivisionProfitabilityRow[];
  xeroProfitability: DivisionProfitabilityRow[];
}

export interface DivisionProfitabilityRow {
  division: string;
  revenue: number;
  cost: number;
  ratio: number;
  marginPercent: number;
}

export interface XeroMarginTrend {
  monthlyData: {
    month: string;
    revenue: number;
    cost: number;
    margin: number;
    marginPercent: number;
  }[];
  totalRevenue: number;
  totalCost: number;
  avgMarginPercent: number;
}

export interface NewClientDealSizeData {
  months: {
    month: string;
    clients: {
      clientId: string;
      clientName: string;
      dealSize: number;
      division: string;
    }[];
    avgDealSize: number;
    totalDealSize: number;
    clientCount: number;
  }[];
  churnedMonths: {
    month: string;
    clients: {
      clientId: string;
      clientName: string;
      dealSize: number;
      division: string;
    }[];
    totalDealSize: number;
    clientCount: number;
  }[];
  byDivision: {
    division: string;
    avgDealSize: number;
    clientCount: number;
  }[];
}

// ---------------------------------------------------------------------------
// Margin Analytics Types
// ---------------------------------------------------------------------------

export interface TimesheetClientMarginRow {
  clientId: string;
  clientName: string;
  month: string; // YYYY-MM
  revenue: number;
  timeCost: number;
  hours: number;
  margin: number;
  marginPercent: number;
}

export interface TimesheetClientMarginData {
  clients: TimesheetClientMarginRow[];
  totalRevenue: number;
  totalTimeCost: number;
  totalHours: number;
  avgMarginPercent: number;
  monthlyTrend: {
    month: string;
    revenue: number;
    timeCost: number;
    marginPercent: number;
  }[];
}

export interface HolisticClientMarginRow {
  clientId: string;
  clientName: string;
  month: string; // YYYY-MM
  revenue: number;
  timeCost: number;
  totalCost: number;
  margin: number;
  marginPercent: number;
}

export interface HolisticClientMarginData {
  clients: HolisticClientMarginRow[];
  totalRevenue: number;
  totalCost: number;
  avgMarginPercent: number;
  blendedHourlyRate: number;
}

export interface MonthlyChurnRow {
  month: string;
  activeAtStart: number;
  churned: number;
  churnPercent: number;
  churnedRevenue: number;
}

export interface MonthlyChurnData {
  months: MonthlyChurnRow[];
  avgChurnPercent: number;
  totalChurned: number;
}
