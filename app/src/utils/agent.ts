/** Pure Agent UI helpers. */

import type { AgentSession, AgentTask } from "../types";

export function sessionIcon(kind: AgentSession["kind"]): string {
  switch (kind) {
    case "freeform":
      return "ph-chat-circle";
    case "message":
      return "ph-envelope";
    case "contact":
      return "ph-user";
    case "event":
      return "ph-calendar-blank";
    case "file":
      return "ph-file";
    default:
      return "ph-sparkle";
  }
}

export function statusColor(status: AgentTask["status"]): string {
  switch (status) {
    case "done":
      return "var(--palm)";
    case "doing":
      return "var(--yellow)";
    case "error":
      return "var(--danger)";
    default:
      return "var(--text-muted)";
  }
}
