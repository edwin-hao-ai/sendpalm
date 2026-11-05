/** Mail date presentation — pure helpers.
 *
 *  Two timestamps travel with every message: the sender-declared `Date`
 *  header (`sentAt`, untrustworthy — the sender controls it) and the mail
 *  server's `INTERNALDATE` (`receivedAt`, the real arrival time). Inbox
 *  chronology uses `receivedAt`; the detail view shows both when they differ.
 *
 *  Everything here formats in the user's configured `profile.timezone`
 *  (IANA). Invalid zones fall back to the runtime (OS) timezone. The legacy
 *  preformatted `tm` string is never read.
 */

import type { Message } from "../types";
import type { DateBucketKey } from "./date";

/* ── Timezone resolution ─────────────────────────────────── */

const ZONE_CACHE = new Map<string, boolean>();

/** Validate an IANA timezone name. Returns the name when usable, else
 *  `undefined` (callers then fall back to the runtime timezone). */
export function resolveTimeZone(tz: string | undefined | null): string | undefined {
  if (!tz) return undefined;
  const cached = ZONE_CACHE.get(tz);
  if (cached !== undefined) return cached ? tz : undefined;
  let ok = false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    ok = true;
  } catch {
    // leave ok = false
  }
  ZONE_CACHE.set(tz, ok);
  return ok ? tz : undefined;
}

/* ── Zone-aware calendar primitives ──────────────────────── */

interface ZoneParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  weekday: number; // 0=Sunday … 6=Saturday
}

function zonedParts(iso: string, tz: string | undefined): ZoneParts | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
    weekday: "short",
  };
  if (tz) options.timeZone = tz;
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat("en-US", options);
  } catch {
    return null;
  }
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const weekdayNames: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  let hour = Number(parts.hour);
  // hourCycle h23 can still render midnight as "24" in some engines.
  if (hour === 24) hour = 0;
  const minute = Number(parts.minute);
  const weekday = weekdayNames[parts.weekday ?? ""] ?? 0;
  if ([year, month, day, hour, minute].some(Number.isNaN)) return null;
  return { year, month, day, hour, minute, weekday };
}

/** Local calendar-date key "YYYY-MM-DD" in the given zone. */
export function localDateKeyInZone(
  iso: string,
  tz: string | undefined,
): string {
  const p = zonedParts(iso, tz);
  if (!p) return "";
  const m = String(p.month).padStart(2, "0");
  const d = String(p.day).padStart(2, "0");
  return `${p.year}-${m}-${d}`;
}

/** Build a Date at local noon from a YYYY-MM-DD key so DST edge cases
 *  cannot shift the calendar day. */
function dateFromKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

/** Monday-start calendar week start ("YYYY-MM-DD") for the zone-local date
 *  of `iso`. */
export function weekStartKeyInZone(
  iso: string,
  tz: string | undefined,
): string {
  const key = localDateKeyInZone(iso, tz);
  if (!key) return "";
  const d = dateFromKey(key);
  const offset = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - offset);
  return localDateKey(d);
}

/** Whole local days between two zone-local date keys (a − b). */
function dayDiffKeys(aKey: string, bKey: string): number {
  const a = dateFromKey(aKey);
  const b = dateFromKey(bKey);
  return Math.round((a.getTime() - b.getTime()) / (24 * 60 * 60 * 1000));
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ── Timeline selection ──────────────────────────────────── */

type TimelineMessage = Pick<Message, "st" | "receivedAt">;

/** The timestamp Inbox sorts and groups by: the real server receipt time,
 *  falling back to the stored message date for legacy rows. Never `tm`. */
export function messageTimelineAt(m: TimelineMessage): string {
  return m.receivedAt ?? m.st;
}

/* ── Formatting ──────────────────────────────────────────── */

export interface MessageDatePart {
  label: string;
  value: string;
}

export interface MessageDatePresentation {
  primary: MessageDatePart;
  /** Sender-declared date, shown in detail view when it differs from the
   *  receipt time by more than a minute. */
  secondary?: MessageDatePart;
}

export type MessageDateMode = "list" | "detail";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Format one instant for a message list row: time-only on the same local
 *  day, otherwise a compact date (weekday + date within the week, then
 *  month/day, then full date for other years). */
function formatListValue(
  iso: string,
  tz: string | undefined,
  now: Date,
): string {
  const p = zonedParts(iso, tz);
  if (!p) return "";
  const nowKey = localDateKeyInZone(now.toISOString(), tz);
  const key = localDateKeyInZone(iso, tz);
  const diff = dayDiffKeys(nowKey, key); // today = 0

  if (diff === 0) return `${pad2(p.hour)}:${pad2(p.minute)}`;
  if (diff === 1) return `昨天 ${pad2(p.hour)}:${pad2(p.minute)}`;

  const nowP = zonedParts(now.toISOString(), tz);
  const sameYear = nowP !== null && p.year === nowP.year;
  if (diff < 7 && diff > -7) {
    const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const wd = weekdays[p.weekday] ?? "";
    return sameYear
      ? `${wd} ${p.month}月${p.day}日`
      : `${p.year}年${p.month}月${p.day}日`;
  }
  return sameYear
    ? `${p.month}月${p.day}日`
    : `${p.year}年${p.month}月${p.day}日`;
}

/** Format one instant for the message detail header: full date + time. */
function formatDetailValue(iso: string, tz: string | undefined): string {
  const p = zonedParts(iso, tz);
  if (!p) return "";
  return `${p.year}年${p.month}月${p.day}日 ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Presentation for a message's date(s).
 *
 *  - `receivedAt` present → primary label 收件时间, value in `tz`.
 *  - legacy row → neutral 邮件时间 label over `st`, no secondary.
 *  - detail mode with both times differing by > 60 s → 发件时间 secondary. */
export function formatMessageDate(
  m: Pick<Message, "st" | "sentAt" | "receivedAt">,
  timezone: string | undefined,
  mode: MessageDateMode = "list",
  now: Date = new Date(),
): MessageDatePresentation {
  const tz = resolveTimeZone(timezone);
  const hasReceipt = !!m.receivedAt;
  const timeline = messageTimelineAt(m);

  const primary: MessageDatePart = {
    label: hasReceipt ? "收件时间" : "邮件时间",
    value:
      mode === "detail"
        ? formatDetailValue(timeline, tz)
        : formatListValue(timeline, tz, now),
  };

  let secondary: MessageDatePart | undefined;
  if (mode === "detail" && m.sentAt && m.receivedAt) {
    const diffMs = Math.abs(
      new Date(m.sentAt).getTime() - new Date(m.receivedAt).getTime(),
    );
    if (diffMs > 60_000) {
      secondary = {
        label: "发件时间",
        value: formatDetailValue(m.sentAt, tz),
      };
    }
  }

  return secondary ? { primary, secondary } : { primary };
}

/* ── Inbox date buckets (zone-aware) ─────────────────────── */

/** Zone-aware twin of `dateBucket()` from ./date — same bucket semantics,
 *  but day/week/month boundaries follow the profile timezone. */
export function dateBucketInZone(
  iso: string,
  tz: string | undefined,
  now: Date = new Date(),
): DateBucketKey {
  const key = localDateKeyInZone(iso, tz);
  const nowKey = localDateKeyInZone(now.toISOString(), tz);
  if (!key || !nowKey) return "today";
  const diff = dayDiffKeys(nowKey, key);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";

  const d = dateFromKey(key);
  const nowD = dateFromKey(nowKey);
  // Monday-start week containing `now`.
  const weekStart = new Date(nowD);
  weekStart.setDate(nowD.getDate() - ((nowD.getDay() + 6) % 7));
  if (d >= weekStart) return "this-week";
  if (d.getFullYear() === nowD.getFullYear() && d.getMonth() === nowD.getMonth()) {
    return "this-month";
  }
  return { kind: "month", year: d.getFullYear(), month: d.getMonth() };
}

/* ── Bundle grouping (expanded sender drawer) ────────────── */

export type BundleGroup =
  | { kind: "day"; key: string; label: string }
  | { kind: "week"; key: string; label: string };

const RECENT_DAYS = 7;

/** Group one message for the expanded sender bundle: the most recent seven
 *  local calendar days get an individual day group; anything older falls
 *  into the Monday–Sunday week containing it. */
export function bundleGroupFor(
  iso: string,
  tz: string | undefined,
  now: Date = new Date(),
): BundleGroup {
  const key = localDateKeyInZone(iso, tz);
  const nowKey = localDateKeyInZone(now.toISOString(), tz);
  if (!key || !nowKey) return { kind: "day", key: "", label: "" };

  const diff = dayDiffKeys(nowKey, key);
  if (diff >= 0 && diff < RECENT_DAYS) {
    if (diff === 0) return { kind: "day", key, label: "今天" };
    if (diff === 1) return { kind: "day", key, label: "昨天" };
    const d = dateFromKey(key);
    return { kind: "day", key, label: `${d.getMonth() + 1}月${d.getDate()}日` };
  }

  const weekStart = weekStartKeyInZone(iso, tz);
  const start = dateFromKey(weekStart);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const label = `${start.getMonth() + 1}月${start.getDate()}日 – ${
    end.getMonth() + 1
  }月${end.getDate()}日`;
  return { kind: "week", key: weekStart, label };
}
