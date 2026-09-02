import { db } from "@/lib/db";
import { MICHAEL_OWNER_ID } from "./michael-sales";

export interface ActivityWeek {
  weekStart: string; // yyyy-MM-dd, Monday
  label: string; // "4 Aug"
  emails: number; // outbound only — emails sent
  calls: number; // every logged call, however it was recorded
  callsWithDuration: number; // subset of `calls` that carry a recorded duration
}

export interface SalesActivity {
  weeks: ActivityWeek[];
  totalEmails: number;
  totalCalls: number;
  /** Calls with a recorded duration. Most are logged manually without one, so a
   *  low number here means the chart is activity logging, not phone-system data. */
  callsWithDuration: number;
}

/** Monday 00:00 of the week containing `d`, in local time. */
function weekStart(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (out.getDay() + 6) % 7; // Mon=0 … Sun=6
  out.setDate(out.getDate() - dow);
  return out;
}

const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Weekly sales activity for one owner (Michael by default).
 *
 * "Emails" counts outbound only — HubSpot marks replies received as
 * INCOMING_EMAIL, which is inbox volume rather than outreach.
 */
export async function getSalesActivity(
  weeks = 26,
  ownerId: string = MICHAEL_OWNER_ID
): Promise<SalesActivity> {
  const firstMonday = weekStart(new Date());
  firstMonday.setDate(firstMonday.getDate() - (weeks - 1) * 7);

  const rows = await db.hubspotActivity.findMany({
    where: { ownerId, timestamp: { gte: firstMonday } },
    select: { type: true, timestamp: true, direction: true, durationMs: true },
  });

  // Seed every week so a quiet week renders as a zero bar rather than a gap.
  const buckets = new Map<string, ActivityWeek>();
  for (let i = 0; i < weeks; i++) {
    const d = new Date(firstMonday);
    d.setDate(d.getDate() + i * 7);
    buckets.set(key(d), {
      weekStart: key(d),
      label: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
      emails: 0,
      calls: 0,
      callsWithDuration: 0,
    });
  }

  let totalEmails = 0;
  let totalCalls = 0;
  let callsWithDuration = 0;

  for (const r of rows) {
    const bucket = buckets.get(key(weekStart(r.timestamp)));
    if (!bucket) continue;
    if (r.type === "email") {
      if (r.direction === "INCOMING_EMAIL") continue; // received, not sent
      bucket.emails++;
      totalEmails++;
    } else if (r.type === "call") {
      bucket.calls++;
      totalCalls++;
      if ((r.durationMs ?? 0) > 0) {
        bucket.callsWithDuration++;
        callsWithDuration++;
      }
    }
  }

  return { weeks: [...buckets.values()], totalEmails, totalCalls, callsWithDuration };
}
