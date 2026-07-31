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