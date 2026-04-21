import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number, currency = "AUD"): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(date: string | Date, fmt = "dd MMM yyyy"): string {
  const d = typeof date === "string" ? parseISO(date) : date;
  return format(d, fmt);
}

export function formatMonth(month: string): string {
  return format(parseISO(`${month}-01`), "MMM yyyy");
}

export function formatHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

export function toMonthKey(date: Date): string {
  return format(date, "yyyy-MM");
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function getMonthRange(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(format(d, "yyyy-MM"));
  }
  return months;
}

/** Markup applied to base salary to cover leave entitlements and superannuation */
export const SALARY_MARKUP = 1.25;

/** Annual salary × markup (leave + super) */
export function getAnnualRate(annualSalary: number | null | undefined): number | null {
  if (!annualSalary) return null;
  return annualSalary * SALARY_MARKUP;
}

/**
 * Monthly loaded cost for a team member — applies the 1.25× super/leave markup
 * to salaried members, or computes from hourly rate × weekly hours for hourly.
 */
export function getLoadedMonthlyCost(member: {
  annualSalary?: number | null;
  hourlyRate?: number | null;
  weeklyHours?: number | null;
}): number {
  if (member.annualSalary) {
    return (member.annualSalary * SALARY_MARKUP) / 12;
  }
  if (member.hourlyRate && member.weeklyHours) {
    return (member.hourlyRate * member.weeklyHours * 52) / 12;
  }
  return 0;
}

/**
 * Parse divisionAllocations JSON. Returns a normalized map of division → fraction.
 * If the input is null/invalid/empty, returns null (caller falls back to single division).
 */
export function parseDivisionAllocations(
  raw: unknown
): Record<string, number> | null {
  if (!raw || typeof raw !== "object") return null;
  const entries = Object.entries(raw as Record<string, unknown>).filter(
    ([, v]) => typeof v === "number" && v > 0
  ) as [string, number][];
  if (entries.length === 0) return null;
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total <= 0) return null;
  return Object.fromEntries(entries.map(([k, v]) => [k, v / total]));
}

export function getEffectiveHourlyRate(member: {
  costType?: string | null;
  hourlyRate?: number | null;
  annualSalary?: number | null;
  weeklyHours?: number | null;
}): number | null {
  if (member.costType === "hourly" && member.hourlyRate) {
    return member.hourlyRate;
  }
  if (member.annualSalary) {
    const weeklyHours = member.weeklyHours || 38;
    const annualRate = member.annualSalary * SALARY_MARKUP;
    return annualRate / (52 * weeklyHours);
  }
  return null;
}
