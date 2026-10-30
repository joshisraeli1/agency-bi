import { db } from "@/lib/db";

export interface BookedMeeting {
  id: string;
  /** When it is scheduled to happen, null if HubSpot held no start time. */
  scheduledFor: string | null;
  outcome: string | null;
  upcoming: boolean;
}

export interface MeetingDay {
  date: string; // YYYY-MM-DD
  label: string; // "9 Sep"
  booked: number;
  /** The meetings behind the bar. Counts only — the sync carries no title,
   *  attendee or note, so this says when each one lands, not who it is with. */
  meetings: BookedMeeting[];
}

export interface MeetingsBooked {
  days: MeetingDay[];
  total: number;
  /** Meetings booked in the window that are still in the future. */
  upcoming: number;
  /** Days in the window on which at least one meeting was booked. */
  activeDays: number;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Meetings booked per day, by the day they were BOOKED.
 *
 * A meeting set today for March is today's work, so it lands in today's column
 * rather than March's — the sync stamps the row with the creation date and
 * keeps the scheduled time in `status`, which is what `upcoming` reads.
 */
export async function getMeetingsBooked(
  days = 30,
  ownerId?: string
): Promise<MeetingsBooked> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const rows = await db.hubspotActivity.findMany({
    where: { type: "meeting", timestamp: { gte: start }, ...(ownerId ? { ownerId } : {}) },
    select: { id: true, timestamp: true, status: true, outcome: true },
    orderBy: { timestamp: "asc" },
  });

  // Seed every day so a quiet day is a visible zero rather than a gap.
  const buckets = new Map<string, MeetingDay>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    buckets.set(dayKey(d), {
      date: dayKey(d),
      label: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
      booked: 0,
      meetings: [],
    });
  }

  const now = new Date();
  let upcoming = 0;
  for (const r of rows) {
    const bucket = buckets.get(dayKey(r.timestamp));
    if (!bucket) continue;
    bucket.booked++;
    const scheduled = r.status ? new Date(r.status) : null;
    const valid = scheduled && !Number.isNaN(scheduled.getTime());
    const ahead = !!valid && scheduled! > now;
    if (ahead) upcoming++;
    bucket.meetings.push({
      id: r.id,
      scheduledFor: valid ? scheduled!.toISOString() : null,
      outcome: r.outcome,
      upcoming: ahead,
    });
  }
  for (const b of buckets.values()) {
    b.meetings.sort((a, c) => (a.scheduledFor ?? "").localeCompare(c.scheduledFor ?? ""));
  }

  const out = [...buckets.values()];
  return {
    days: out,
    total: out.reduce((s, d) => s + d.booked, 0),
    upcoming,
    activeDays: out.filter((d) => d.booked > 0).length,
  };
}
