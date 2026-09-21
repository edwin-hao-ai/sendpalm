/** Tests for the shared Agent helpers (Chinese labels, chat history
 *  assembly) introduced in the 2026-09-22 UX pass. */

import { describe, expect, it } from "vitest";
import {
  buildChatMessages,
  sessionKindLabel,
  taskStatusLabel,
  draftStatusLabel,
  auditKindLabel,
  confidenceLabel,
  CHAT_HISTORY_LIMIT,
} from "./useAgent";
import type { AgentSession, AgentTask, DraftStatus } from "../types";

describe("sessionKindLabel", () => {
  const cases: [AgentSession["kind"], string][] = [
    ["freeform", "自由对话"],
    ["message", "邮件"],
    ["contact", "联系人"],
    ["event", "日程"],
    ["file", "文件"],
  ];
  it.each(cases)("maps %s to %s", (kind, expected) => {
    expect(sessionKindLabel(kind)).toBe(expected);
  });
});

describe("taskStatusLabel", () => {
  const cases: [AgentTask["status"], string][] = [
    ["todo", "待处理"],
    ["doing", "进行中"],
    ["done", "已完成"],
    ["error", "失败"],
  ];
  it.each(cases)("maps %s to %s", (status, expected) => {
    expect(taskStatusLabel(status)).toBe(expected);
  });
});

describe("draftStatusLabel", () => {
  const cases: [DraftStatus, string][] = [
    ["pending", "待审批"],
    ["approved", "已批准"],
    ["sent", "已发送"],
    ["edited", "编辑中"],
    ["discarded", "已丢弃"],
  ];
  it.each(cases)("maps %s to %s", (status, expected) => {
    expect(draftStatusLabel(status)).toBe(expected);
  });
});

describe("auditKindLabel", () => {
  it("maps known kinds to Chinese", () => {
    expect(auditKindLabel("user_input")).toBe("我");
    expect(auditKindLabel("agent_response")).toBe("Agent");
  });
  it("falls back to the raw kind for unknown values", () => {
    expect(auditKindLabel("something_new")).toBe("something_new");
  });
});

describe("confidenceLabel", () => {
  it("hides zero / missing confidence", () => {
    expect(confidenceLabel(0)).toBeNull();
    expect(confidenceLabel(undefined)).toBeNull();
  });
  it("maps ranges to 高 / 中 / 低", () => {
    expect(confidenceLabel(95)).toBe("高");
    expect(confidenceLabel(80)).toBe("高");
    expect(confidenceLabel(55)).toBe("中");
    expect(confidenceLabel(10)).toBe("低");
  });
});

describe("buildChatMessages", () => {
  const history = [
    { kind: "session_new", message: "新建会话" },
    { kind: "user_input", message: "第一句" },
    { kind: "agent_response", message: "第一答" },
    { kind: "user_input", message: "第二句" },
    { kind: "agent_response", message: "第二答" },
  ];

  it("replays prior user/agent turns as user/assistant roles", () => {
    const msgs = buildChatMessages("", history, "第三句");
    expect(msgs).toEqual([
      { role: "user", content: "第一句" },
      { role: "assistant", content: "第一答" },
      { role: "user", content: "第二句" },
      { role: "assistant", content: "第二答" },
      { role: "user", content: "第三句" },
    ]);
  });

  it("prepends a trimmed system prompt when configured", () => {
    const msgs = buildChatMessages("  你是助手  ", [], "hi");
    expect(msgs[0]).toEqual({ role: "system", content: "你是助手" });
    expect(msgs[1]).toEqual({ role: "user", content: "hi" });
  });

  it("omits the system role when the prompt is blank", () => {
    const msgs = buildChatMessages("   ", [], "hi");
    expect(msgs).toEqual([{ role: "user", content: "hi" }]);
  });

  it("caps replayed history at CHAT_HISTORY_LIMIT turns", () => {
    const long = Array.from({ length: CHAT_HISTORY_LIMIT + 10 }, (_, i) => ({
      kind: i % 2 === 0 ? "user_input" : "agent_response",
      message: `m${i}`,
    }));
    const msgs = buildChatMessages("", long, "latest");
    // history cap + the new input
    expect(msgs.length).toBe(CHAT_HISTORY_LIMIT + 1);
    expect(msgs[msgs.length - 1]).toEqual({ role: "user", content: "latest" });
    // oldest turns are dropped, newest kept
    expect(msgs[0]!.content).toBe(`m${10}`);
  });
});
