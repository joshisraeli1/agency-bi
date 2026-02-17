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
  deliverableStats: {
    total: number;
    byStatus: Record<string, number>;
  };
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
  monthlyTrend: {
    month: string;
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
}
