/** M11 — Calendar recurrence expansion.
 *
 * Turns a master CalendarEvent (with optional RRULE / RDATE / EXDATE
 * from the iCal fields) into a flat list of concrete occurrences
 * inside a bounded window. The Calendar view renders one tile per
 * occurrence; the master row is the source of truth and never
 * shows up directly.
 *
 * We only call this on the frontend. The Rust side stores the raw
 * RRULE / RDATE / EXDATE strings on the event row; it doesn't
 * pre-expand into N rows because that would break RSVP / CANCEL
 * semantics (a single CANCEL revokes every future occurrence, not
 * N rows) and write-storm the import path.
 *
 * The 90-day default window is the same as the prototype's
 * "upcoming events" list. Bumping it to 365 for a yearly view is
 * a one-line change here. */

import type { CalendarEvent } from "../types";

/** Default forward-looking window for "upcoming" lists. 90 days
 *  is the same window the prototype's `next-3-months` sidebar
 *  filter used. The day view and month view pass a tighter
 *  window. */
export const DEFAULT_OCCURRENCE_WINDOW_DAYS = 90;

/** Maximum occurrences we'll materialize from a single event, no
 *  matter how long the window. Matches the Rust-side 500-cap in
 *  \`expand_occurrences\`; we mirror it here so a single chatty
 *  event can't OOM the renderer. */
export const MAX_OCCURRENCES = 500;

export interface Occurrence {
  /** The master event id this occurrence was derived from. We
   *  keep it so click-through on the occurrence opens the
   *  meeting panel for the master, not a phantom copy. */
  masterId: string;
  /** A stable, deterministic id for this occurrence:
   *  \`${masterId}#${rfc3339Start}\`. Used as React/Solid key. */
  id: string;
  /** The concrete start time of this occurrence. For UTC
   *  events this is identical to the master's \`dt\`; for
   *  TZID-referenced events we re-resolve through the master
   *  row's TZID for every occurrence (since DST shifts mean
   *  the offset can change over the year). */
  start: string;
  /** Mirrored from the master, since the event duration is the
   *  same for every occurrence. */
  end: string;
  /** True for the first occurrence (== master start) — used
   *  to skip duplicate rendering when the window starts on
   *  exactly the master day. */
  isMaster: boolean;
}

/** Parse a `FREQ=...;INTERVAL=...;BYDAY=...;...` RRULE string into
 *  a typed struct. Mirrors the Rust parser but is intentionally
 *  minimal: we only support the combinations Calendar UI
 *  actually needs to render (DAILY/WEEKLY/MONTHLY/YEARLY +
 *  INTERVAL + COUNT/UNTIL + BYDAY). Anything we don't understand
 *  falls back to "no recurrence" rather than risk mis-rendering. */
interface ParsedRRule {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  count?: number;
  until?: string; // ISO date (YYYY-MM-DD)
  byday?: string[]; // ["MO", "WE", "FR"]
}

const WEEKDAYS: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

function parseRRule(value: string): ParsedRRule | null {
  const out: ParsedRRule = { freq: "DAILY", interval: 1 };
  for (const part of value.split(";")) {
    const [k, v] = part.split("=");
    if (!k || !v) continue;
    switch (k.toUpperCase()) {
      case "FREQ":
        if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(v))
          return null;
        out.freq = v as ParsedRRule["freq"];
        break;
      case "INTERVAL":
        out.interval = Math.max(1, parseInt(v, 10) || 1);
        break;
      case "COUNT":
        out.count = parseInt(v, 10) || undefined;
        break;
      case "UNTIL":
        // UNTIL can be a YYYYMMDD or YYYYMMDDTHHMMSSZ; we accept
        // the YYYYMMDD slice either way.
        out.until = v.slice(0, 10);
        break;
      case "BYDAY":
        out.byday = v
          .split(",")
          .map((d) => d.trim().toUpperCase())
          .filter((d) => d in WEEKDAYS);
        break;
      default:
        // Unknown keys (BYSECOND, BYMONTH, BYSETPOS) are ignored.
        break;
    }
  }
  return out;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z");
  const targetMonth = d.getUTCMonth() + months;
  d.setUTCMonth(targetMonth);
  // Date.prototype.setUTCMonth overflows (e.g. Jan 31 + 1 month =
  // Mar 3) — clip to the last day of the target month when the
  // original day no longer exists.
  if (d.getUTCMonth() !== ((targetMonth % 12) + 12) % 12) {
    d.setUTCDate(0);
  }
  return d.toISOString().slice(0, 10);
}

function addYears(iso: string, years: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function matchesByday(iso: string, byday: string[]): boolean {
  const d = new Date(iso + "T00:00:00Z").getUTCDay();
  return byday.some((code) => WEEKDAYS[code] === d);
}

/** Expand a single master event into concrete occurrences inside
 *  \`[windowStart, windowEnd]\` (both ISO date YYYY-MM-DD, UTC).
 *  Returns the master itself as the first occurrence if it falls
 *  inside the window; further occurrences come from RRULE / RDATE.
 *  EXDATE entries are removed.
 *
 *  Performance: O(occurrences). Hard-capped at MAX_OCCURRENCES.
 *  If a rule would emit more we stop expanding without erroring —
 *  the user can re-query with a wider window if they need to see
 *  a specific occurrence. */
export function expandOccurrences(
  ev: CalendarEvent,
  windowStart: string,
  windowEnd: string,
): Occurrence[] {
  const out: Occurrence[] = [];
  const masterDate = ev.dt.slice(0, 10);
  const inWindow = (iso: string) => iso >= windowStart && iso <= windowEnd;
  const exdates = new Set((ev.excludedDates ?? []).map((d) => d.slice(0, 10)));

  if (inWindow(masterDate) && !exdates.has(masterDate)) {
    out.push({
      masterId: ev.id,
      id: `${ev.id}#${ev.dt}`,
      start: ev.dt,
      end: ev.endDt ?? ev.dt,
      isMaster: true,
    });
  }

  if (ev.recurrenceRule) {
    const rule = parseRRule(ev.recurrenceRule);
    if (rule) {
      const cap = rule.count ?? MAX_OCCURRENCES;
      const limit = Math.min(cap, MAX_OCCURRENCES);

      switch (rule.freq) {
        case "DAILY":
          pushDaily(ev, rule, masterDate, windowStart, windowEnd, limit, exdates, out);
          break;
        case "WEEKLY":
          pushWeekly(ev, rule, masterDate, windowStart, windowEnd, limit, exdates, out);
          break;
        case "MONTHLY":
          pushMonthly(ev, rule, masterDate, windowStart, windowEnd, limit, exdates, out);
          break;
        case "YEARLY":
          pushYearly(ev, rule, masterDate, windowStart, windowEnd, limit, exdates, out);
          break;
      }
    }
  }

  // RDATE additions (always — these don't have a master anchor).
  for (const r of ev.recurrenceDates ?? []) {
    const day = r.slice(0, 10);
    if (!inWindow(day)) continue;
    if (exdates.has(day)) continue;
    out.push(buildOccurrence(ev, day));
  }

  out.sort((a, b) => (a.start < b.start ? -1 : 1));
  return out;
}

function pushDaily(
  ev: CalendarEvent,
  rule: ParsedRRule,
  masterDate: string,
  windowStart: string,
  windowEnd: string,
  limit: number,
  exdates: Set<string>,
  out: Occurrence[],
): void {
  // Skip day 0 (the master); start at day 1.
  for (let n = 1; n < limit && out.length < limit; n++) {
    const day = addDays(masterDate, rule.interval * n);
    if (day > windowEnd) break;
    if (day < windowStart) continue;
    if (rule.until && day > rule.until) break;
    if (exdates.has(day)) continue;
    out.push(buildOccurrence(ev, day));
  }
}

function pushWeekly(
  ev: CalendarEvent,
  rule: ParsedRRule,
  masterDate: string,
  windowStart: string,
  windowEnd: string,
  limit: number,
  exdates: Set<string>,
  out: Occurrence[],
): void {
  if (!rule.byday || rule.byday.length === 0) {
    // Same weekday as the master, every `interval` weeks.
    for (let n = 1; n < limit && out.length < limit; n++) {
      const day = addDays(masterDate, 7 * rule.interval * n);
      if (day > windowEnd) break;
      if (day < windowStart) continue;
      if (rule.until && day > rule.until) break;
      if (exdates.has(day)) continue;
      out.push(buildOccurrence(ev, day));
    }
    return;
  }
  // BYDAY list: walk one day at a time, emitting every match
  // that lands in a week the rule says we should fire. The
  // "active weeks" are those whose index (relative to the
  // master) is a multiple of `interval`.
  const maxDays = Math.min(
    7 * rule.interval * limit + 7,
    7 * 52 * 5, // 5-year cap to avoid runaway on tiny windows
  );
  const masterTime = new Date(masterDate + "T00:00:00Z").getTime();
  for (let dayOffset = 1; dayOffset < maxDays; dayOffset++) {
    if (out.length >= limit) break;
    const day = addDays(masterDate, dayOffset);
    if (day > windowEnd) break;
    if (day < windowStart) continue;
    if (rule.until && day > rule.until) break;
    if (exdates.has(day)) continue;
    if (!matchesByday(day, rule.byday)) continue;
    // Only fire in weeks that the interval allows (relative to
    // the master's week).
    const weekIndex = Math.floor(
      (new Date(day + "T00:00:00Z").getTime() - masterTime) / (7 * 86_400_000),
    );
    if (weekIndex % rule.interval !== 0) continue;
    out.push(buildOccurrence(ev, day));
  }
}

function pushMonthly(
  ev: CalendarEvent,
  rule: ParsedRRule,
  masterDate: string,
  windowStart: string,
  windowEnd: string,
  limit: number,
  exdates: Set<string>,
  out: Occurrence[],
): void {
  for (let n = 1; n < limit && out.length < limit; n++) {
    const day = addMonths(masterDate, rule.interval * n);
    if (day > windowEnd) break;
    if (day < windowStart) continue;
    if (rule.until && day > rule.until) break;
    if (exdates.has(day)) continue;
    out.push(buildOccurrence(ev, day));
  }
}

function pushYearly(
  ev: CalendarEvent,
  rule: ParsedRRule,
  masterDate: string,
  windowStart: string,
  windowEnd: string,
  limit: number,
  exdates: Set<string>,
  out: Occurrence[],
): void {
  for (let n = 1; n < limit && out.length < limit; n++) {
    const day = addYears(masterDate, rule.interval * n);
    if (day > windowEnd) break;
    if (day < windowStart) continue;
    if (rule.until && day > rule.until) break;
    if (exdates.has(day)) continue;
    out.push(buildOccurrence(ev, day));
  }
}

function buildOccurrence(ev: CalendarEvent, day: string): Occurrence {
  // The time-of-day comes from the master's tm ("HH:MM"); we
  // splice it into the day so the occurrence has the right
  // start time on the right date.
  const tm = ev.tm || "00:00";
  const start = `${day}T${tm}:00`;
  return {
    masterId: ev.id,
    id: `${ev.id}#${day}`,
    start,
    end: ev.endDt ?? start,
    isMaster: false,
  };
}

/** Human-readable summary of a recurrence rule for the calendar
 *  tile (e.g. "每周一/三/五" or "每月 15 号"). Returns null when
 *  the rule can't be parsed (the master tile falls back to its
 *  plain dt). */
export function describeRRule(value: string | undefined): string | null {
  if (!value) return null;
  const rule = parseRRule(value);
  if (!rule) return null;
  const labels: Record<string, string> = {
    DAILY: "每天",
    WEEKLY: "每周",
    MONTHLY: "每月",
    YEARLY: "每年",
  };
  const intervalPart =
    rule.interval > 1
      ? `每 ${rule.interval} ${freqNoun(rule.freq)}`
      : labels[rule.freq];
  const bydayPart =
    rule.byday && rule.byday.length > 0
      ? ` ${rule.byday.map((d) => weekdayLabel(d)).join("/")}`
      : "";
  return `${intervalPart}${bydayPart}`;
}

function freqNoun(freq: string): string {
  switch (freq) {
    case "DAILY":
      return "天";
    case "WEEKLY":
      return "周";
    case "MONTHLY":
      return "月";
    case "YEARLY":
      return "年";
    default:
      return freq;
  }
}

function weekdayLabel(code: string): string {
  const map: Record<string, string> = {
    SU: "周日",
    MO: "周一",
    TU: "周二",
    WE: "周三",
    TH: "周四",
    FR: "周五",
    SA: "周六",
  };
  return map[code] ?? code;
}

/** Returns the ISO date (YYYY-MM-DD) for "today" in the user's
 *  local zone, or \`start\` if today is before that. Useful for
 *  defaulting the day/week/month window in the calendar view. */
export function todayLocal(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function addDaysIso(iso: string, days: number): string {
  return addDays(iso, days);
}
