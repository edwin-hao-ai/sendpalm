/** Pure filter helpers for the Files view. Extracted so the logic is
 *  unit-testable without rendering SolidJS components.
 */

import type { FileItem } from "../types";

export type FileTypeFilter =
  | "all"
  | "pdf"
  | "image"
  | "doc"
  | "spreadsheet";

export interface FileFilterState {
  type: FileTypeFilter;
  /** Free-text name search (case-insensitive substring). */
  query: string;
  /** YYYY-MM-DD inclusive lower bound, or "" for none. */
  dateFrom: string;
  /** YYYY-MM-DD inclusive upper bound, or "" for none. */
  dateTo: string;
  /** Sender contact id, or "" for any. */
  senderId: string;
  /** Min size in KB, or "" for none. */
  sizeMinKb: string;
  /** Max size in KB, or "" for none. */
  sizeMaxKb: string;
}

/** Apply the file view's filter state to a list of files and return the
 *  filtered, time-desc-sorted result. The input is not mutated. */
export function applyFileFilters(
  files: readonly FileItem[],
  state: FileFilterState,
): FileItem[] {
  let out = files.slice();
  if (state.type !== "all")
    out = out.filter((f) => f.type === state.type);
  const q = state.query.trim().toLowerCase();
  if (q) out = out.filter((f) => f.name.toLowerCase().includes(q));

  const fromMs = state.dateFrom ? new Date(state.dateFrom).getTime() : null;
  // "to" is inclusive of the whole day, so we add 24h to the upper bound.
  const toMs = state.dateTo
    ? new Date(state.dateTo).getTime() + 86_400_000
    : null;
  if (fromMs !== null || toMs !== null) {
    out = out.filter((f) => {
      const t = new Date(f.st).getTime();
      if (fromMs !== null && t < fromMs) return false;
      if (toMs !== null && t > toMs) return false;
      return true;
    });
  }
  if (state.senderId) out = out.filter((f) => f.pid === state.senderId);
  const minB = state.sizeMinKb ? Number(state.sizeMinKb) * 1024 : null;
  const maxB = state.sizeMaxKb ? Number(state.sizeMaxKb) * 1024 : null;
  if (minB !== null || maxB !== null) {
    const lo = minB ?? -Infinity;
    const hi = maxB ?? Infinity;
    out = out.filter((f) => f.size >= lo && f.size <= hi);
  }

  return out.sort(
    (a, b) => new Date(b.st).getTime() - new Date(a.st).getTime(),
  );
}
