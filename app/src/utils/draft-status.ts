/** Chinese display label for a draft lifecycle status.
 * Mirrors the prototype's `statusLabel()` (prototype-v11.js:7027). */

import type { Draft } from "../types";

export const DRAFT_STATUS_LABEL: Record<Draft["status"], string> = {
  pending: "待审批",
  approved: "已批准",
  edited: "编辑中",
  sent: "已发送",
  discarded: "已丢弃",
};

export function draftStatusLabel(status: Draft["status"]): string {
  return DRAFT_STATUS_LABEL[status] ?? status;
}
