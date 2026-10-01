import { db } from "@/lib/db";
import { MICHAEL_OWNER_ID } from "./michael-sales";

/** Outcome buckets, in the order they stack. HubSpot's dispositions are
 *  Connected / No answer / Busy / Left voicemail / Left live message /
 *  Wrong number / Meeting booked; the long tail is grouped so the chart stays
 *  readable, and calls the dialler logged without an outcome are kept visible
 *  rather than dropped, so the daily bar still equals the calls made. */
export const OUTCOME_BUCKETS = ["Meeting booked", "Connected", "No answer", "Other outcome", "Not logged"] as const;
export type OutcomeBucket = (typeof OUTCOME_BUCKETS)[number];

function bucketFor(outcome: string | null): OutcomeBucket {
  if (!outcome) return "Not logged";
  if (outcome === "Meeting booked") return "Meeting booked";
  if (outcome === "Connected") return "Connected";
  if (outcome === "No answer") return "No answer";
  return "Other outcome"; // Busy, Wrong number, Left voicemail, Left live message
}

export interface CallDay {
  date: string; // YYYY-MM-DD
  label: string; // "9 Sep"
  calls: number;
  /** Placed through the dialler — these carry a number, duration and outcome. */
  diallerCalls: number;
  /** Logged by hand in HubSpot afterwards. Real calls; they just arrive with
   *  no duration and usually no outcome. */
  manualCalls: number;
  talkMinutes: number;
  counts: Record<OutcomeBucket, number>;
}

export interface CallActivity {
  days: CallDay[];
  totalCalls: number;
  totalDiallerCalls: number;
  totalManualCalls: number;
  totalTalkMinutes: number;
  connected: number; // Connected + Meeting booked
  meetingsBooked: number;
  /** Dialler numbers seen in the window, newest activity first. */
  numbers: { number: string; calls: number; firstSeen: string }[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Daily call output and outcomes.
 *
 * Counts BOTH dialler calls and the ones Michael logs by hand afterwards. The
 * hand-logged ones carry no from-number, no duration and usually no outcome,
 * which is why they were originally excluded — but they are three quarters of
 * his calls, and leaving them out reported a fraction of the work as the whole
 * of it.
 *
 * They are kept separable rather than merged: talk time still comes only from
 * dialler calls, since a hand-logged call has no duration to contribute, and
 * the split is reported so a day of manual logging is never mistaken for a day
 * on the dialler.
 */
export async function getCallActivity(
  days = 30,
  ownerId: string = MICHAEL_OWNER_ID
): Promise<CallActivity> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const rows = await db.hubspotActivity.findMany({
    where: { ownerId, type: "call", timestamp: { gte: start } },
    select: { timestamp: true, durationMs: true, outcome: true, fromNumber: true },
    orderBy: { timestamp: "asc" },
  });

  // Seed every day so a quiet day is a visible zero, not a gap in the axis.
  const buckets = new Map<string, CallDay>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    buckets.set(dayKey(d), {
      date: dayKey(d),
      label: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
      calls: 0,
      diallerCalls: 0,
      manualCalls: 0,
      talkMinutes: 0,
      counts: { "Meeting booked": 0, Connected: 0, "No answer": 0, "Other outcome": 0, "Not logged": 0 },
    });
  }

  let totalTalkMs = 0;
  const numbers = new Map<string, { calls: number; firstSeen: string }>();

  for (const r of rows) {
    const day = buckets.get(dayKey(r.timestamp));
    if (!day) continue;
    day.calls++;
    day.counts[bucketFor(r.outcome)]++;
    const ms = r.durationMs ?? 0;
    day.talkMinutes += ms / 60000;
    totalTalkMs += ms;

    // No from-number means it was logged by hand, not dialled.
    if (!r.fromNumber) {
      day.manualCalls++;
      continue;
    }
    day.diallerCalls++;

    const num = r.fromNumber;
    const seen = numbers.get(num);
    const key = dayKey(r.timestamp);
    if (!seen) numbers.set(num, { calls: 1, firstSeen: key });
    else {
      seen.calls++;
      if (key < seen.firstSeen) seen.firstSeen = key;
    }
  }

  const days_ = [...buckets.values()].map((d) => ({ ...d, talkMinutes: Math.round(d.talkMinutes) }));
  const sum = (b: OutcomeBucket) => days_.reduce((s, d) => s + d.counts[b], 0);

  return {
    days: days_,
    totalCalls: days_.reduce((s, d) => s + d.calls, 0),
    totalDiallerCalls: days_.reduce((s, d) => s + d.diallerCalls, 0),
    totalManualCalls: days_.reduce((s, d) => s + d.manualCalls, 0),
    totalTalkMinutes: Math.round(totalTalkMs / 60000),
    connected: sum("Connected") + sum("Meeting booked"),
    meetingsBooked: sum("Meeting booked"),
    numbers: [...numbers.entries()]
      .map(([number, v]) => ({ number, ...v }))
      .sort((a, b) => b.calls - a.calls),
  };
}
