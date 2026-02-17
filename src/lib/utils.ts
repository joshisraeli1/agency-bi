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
    maximumFractionDigits: 2,
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
    return member.annualSalary / (52 * weeklyHours);
  }
  return null;
}
