/** Tests for pure Agent helpers. */

import { describe, expect, it } from "vitest";
import { sessionIcon, statusColor } from "../utils/agent";
import type { AgentSession, AgentTask } from "../types";

describe("sessionIcon", () => {
  const cases: [AgentSession["kind"], string][] = [
    ["freeform", "ph-chat-circle"],
    ["message", "ph-envelope"],
    ["contact", "ph-user"],
    ["event", "ph-calendar-blank"],
    ["file", "ph-file"],
  ];
  it.each(cases)("maps %s to %s", (kind, expected) => {
    expect(sessionIcon(kind)).toBe(expected);
  });
});

describe("statusColor", () => {
  const cases: [AgentTask["status"], string][] = [
    ["done", "var(--palm)"],
    ["doing", "var(--yellow)"],
    ["error", "var(--danger)"],
    ["todo", "var(--text-muted)"],
  ];
  it.each(cases)("maps %s to %s", (status, expected) => {
    expect(statusColor(status)).toBe(expected);
  });
});
