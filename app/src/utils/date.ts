/** Date helpers — pure functions only. */

export function isoNow(): string {
  return new Date().toISOString();
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = now.getTime() - t;
  const abs = Math.abs(diff);
  const sign = diff >= 0 ? "ago" : "from now";

  const sec = 1000;
  const min = 60 * sec;
  const hour = 60 * min;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  if (abs < min) return `just now`;
  if (abs < hour) return `${Math.round(abs / min)} min ${sign}`;
  if (abs < day) return `${Math.round(abs / hour)}h ${sign}`;
  if (abs < week) return `${Math.round(abs / day)}d ${sign}`;
  if (abs < month) return `${Math.round(abs / week)}w ${sign}`;
  if (abs < year) return `${Math.round(abs / month)}mo ${sign}`;
  return `${Math.round(abs / year)}y ${sign}`;
}

export function formatDate(iso: string, locale = "zh-CN"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatTime(iso: string, locale = "zh-CN"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(iso: string, locale = "zh-CN"): string {
  return `${formatDate(iso, locale)} ${formatTime(iso, locale)}`;
}

export function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function isYesterday(iso: string): boolean {
  const d = new Date(iso);
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return (
    d.getFullYear() === y.getFullYear() &&
    d.getMonth() === y.getMonth() &&
    d.getDate() === y.getDate()
  );
}

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Days from now until `iso`. Null if `iso` is invalid. */
export function daysUntil(iso: string, now = new Date()): number | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const ms = t - now.getTime();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

export function addHours(d: Date, n: number): Date {
  const x = new Date(d);
  x.setHours(x.getHours() + n);
  return x;
}

export function nextWeekday(d: Date, weekday: number): Date {
  const x = new Date(d);
  const diff = (weekday - x.getDay() + 7) % 7 || 7;
  return addDays(x, diff);
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const offset = (day + 6) % 7; // Monday-start
  x.setDate(x.getDate() - offset);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfWeek(d: Date): Date {
  const s = startOfWeek(d);
  const x = new Date(s);
  x.setDate(x.getDate() + 6);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

export function sameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Group emails into date buckets for the Imbox tabs. The keys are
 *  stable across renders (same date → same key) so SolidJS For can
 *  reuse DOM nodes. Use `bucketLabel()` for the user-facing string. */
export type DateBucketKey =
  | "today"
  | "yesterday"
  | "this-week"
  | "this-month"
  | { kind: "month"; year: number; month: number };

export function dateBucket(iso: string, now: Date = new Date()): DateBucketKey {
  const d = new Date(iso);
  if (sameDate(d, now)) return "today";
  const yest = new Date(now);
  yest.setDate(now.getDate() - 1);
  if (sameDate(d, yest)) return "yesterday";
  if (d >= startOfWeek(now)) return "this-week";
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
    return "this-month";
  }
  return { kind: "month", year: d.getFullYear(), month: d.getMonth() };
}

/** Human label for a DateBucketKey. Localised Chinese labels for the
 *  "today/yesterday/this-week/this-month" cases; older months use the
 *  Intl.DateTimeFormat zh-CN "long month" form (e.g. "2026年7月"). */
export function bucketLabel(bucket: DateBucketKey, now: Date = new Date()): string {
  if (bucket === "today") return "今天";
  if (bucket === "yesterday") return "昨天";
  if (bucket === "this-week") return "本周早些";
  if (bucket === "this-month") return "本月早些";
  const d = new Date(bucket.year, bucket.month, 1);
  const sameYear = d.getFullYear() === now.getFullYear();
  const m = new Intl.DateTimeFormat("zh-CN", {
    year: sameYear ? undefined : "numeric",
    month: "long",
  }).format(d);
  // For same-year buckets, strip the year prefix the formatter adds
  // (e.g. "2026年1月" → "1月"); cross-year buckets keep the year.
  if (!sameYear) return m;
  return m.replace(/^\d+\s*年/, "").trim();
}

export function timeToMinutes(tm: string): number {
  const parts = tm.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const n = parseFloat((bytes / k ** i).toFixed(1));
  return `${n} ${sizes[i]}`;
}
