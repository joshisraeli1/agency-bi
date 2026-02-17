/**
 * Monday.com column value parsers.
 *
 * Each Monday item has `column_values` containing `{ id, type, text, value }`.
 * The `value` field is a JSON string whose shape depends on the column `type`.
 */

/**
 * Parse a Monday column value based on its type.
 * Returns a typed JS value or null if the value is empty / unparseable.
 */
export function parseColumnValue(
  type: string,
  value: string | null,
  text?: string
): unknown {
  if (!value && !text) return null;

  switch (type) {
    case "status":
    case "color":
      return parseStatus(value, text);

    case "people":
    case "multiple-person":
      return parsePeople(value);

    case "date":
      return parseDate(value, text);

    case "time_tracking":
    case "timetracking":
      return parseTimeTracking(value ?? text ?? null);

    case "numbers":
    case "numeric":
      return parseNumber(value, text);

    case "dropdown":
      return parseDropdown(value, text);

    case "text":
    case "long_text":
    case "long-text":
      return text ?? tryParseJsonString(value) ?? null;

    default:
      // For unknown types, return the text representation
      return text ?? null;
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

function parseStatus(
  value: string | null,
  text?: string
): string | null {
  if (text) return text;
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as { label?: string; index?: number };
    return parsed.label ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export interface MondayPersonRef {
  id: number;
  kind: string; // "person" | "team"
}

function parsePeople(value: string | null): MondayPersonRef[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value) as {
      personsAndTeams?: Array<{ id: number; kind: string }>;
    };
    return (parsed.personsAndTeams ?? []).map((p) => ({
      id: p.id,
      kind: p.kind ?? "person",
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Date
// ---------------------------------------------------------------------------

function parseDate(
  value: string | null,
  text?: string
): Date | null {
  // value is typically: {"date":"2024-03-15","time":null}
  if (value) {
    try {
      const parsed = JSON.parse(value) as { date?: string };
      if (parsed.date) {
        const d = new Date(parsed.date + "T00:00:00Z");
        if (!isNaN(d.getTime())) return d;
      }
    } catch {
      // fall through to text
    }
  }

  if (text) {
    const d = new Date(text);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Time Tracking
// ---------------------------------------------------------------------------

/**
 * Parse Monday time tracking column value to decimal hours.
 *
 * Monday stores time tracking in several formats:
 * - JSON with `duration` in seconds: `{"duration":3600, ...}`
 * - JSON with `additional_value`: contains a JSON with `duration` in seconds
 * - Text as "HH:MM:SS"
 *
 * Returns decimal hours (e.g., 1.5 for 1h30m) or null if no value.
 */
export function parseTimeTracking(value: string | null): number | null {
  if (!value) return null;

  // Try JSON parse first
  try {
    const parsed = JSON.parse(value);

    // Direct duration in seconds
    if (typeof parsed === "object" && parsed !== null) {
      // Check for duration field (in seconds)
      if (typeof parsed.duration === "number" && parsed.duration > 0) {
        return roundHours(parsed.duration / 3600);
      }

      // Check additional_value which may contain duration
      if (parsed.additional_value) {
        try {
          const additional =
            typeof parsed.additional_value === "string"
              ? JSON.parse(parsed.additional_value)
              : parsed.additional_value;
          if (
            typeof additional.duration === "number" &&
            additional.duration > 0
          ) {
            return roundHours(additional.duration / 3600);
          }
        } catch {
          // not parseable, continue
        }
      }

      // Check for running timer with accumulated
      if (
        typeof parsed.running === "boolean" &&
        typeof parsed.duration === "number"
      ) {
        return roundHours(parsed.duration / 3600);
      }
    }
  } catch {
    // Not JSON, try as HH:MM:SS
  }

  // Try HH:MM:SS format
  return parseHHMMSS(value);
}

/**
 * Parse "HH:MM:SS" or "H:MM:SS" string to decimal hours.
 */
export function parseHHMMSS(text: string): number | null {
  const match = text.trim().match(/^(\d{1,3}):(\d{2}):(\d{2})$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);

  if (minutes >= 60 || seconds >= 60) return null;

  return roundHours(hours + minutes / 60 + seconds / 3600);
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

function parseNumber(
  value: string | null,
  text?: string
): number | null {
  if (value) {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "number") return parsed;
      if (typeof parsed === "string") {
        const n = parseFloat(parsed);
        if (!isNaN(n)) return n;
      }
    } catch {
      // fall through to text
    }
  }

  if (text) {
    const n = parseFloat(text.replace(/,/g, ""));
    if (!isNaN(n)) return n;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Dropdown
// ---------------------------------------------------------------------------

function parseDropdown(
  value: string | null,
  text?: string
): string[] {
  if (value) {
    try {
      const parsed = JSON.parse(value) as { ids?: number[] };
      // Dropdown values: the text field typically has the labels comma-separated
      if (text) {
        return text.split(",").map((s) => s.trim()).filter(Boolean);
      }
      if (Array.isArray(parsed.ids)) {
        return parsed.ids.map(String);
      }
    } catch {
      // fall through
    }
  }

  if (text) {
    return text.split(",").map((s) => s.trim()).filter(Boolean);
  }

  return [];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tryParseJsonString(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "string") return parsed;
    return null;
  } catch {
    return value;
  }
}

function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}
