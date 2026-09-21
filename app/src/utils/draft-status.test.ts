import { describe, expect, it } from "vitest";
import { DRAFT_STATUS_LABEL, draftStatusLabel } from "./draft-status";
import type { DraftStatus } from "../types";

describe("draftStatusLabel", () => {
  it("maps every DraftStatus to a Chinese label", () => {
    const statuses: DraftStatus[] = [
      "pending",
      "approved",
      "edited",
      "sent",
      "discarded",
    ];
    for (const s of statuses) {
      expect(draftStatusLabel(s)).toBe(DRAFT_STATUS_LABEL[s]);
      // No raw enum leaks to the UI.
      expect(draftStatusLabel(s)).not.toBe(s);
    }
  });

  it("matches the prototype statusLabel() mapping", () => {
    // prototype-v11.js:7027 — 待审批/已批准/已发送/编辑中/已丢弃
    expect(draftStatusLabel("pending")).toBe("待审批");
    expect(draftStatusLabel("approved")).toBe("已批准");
    expect(draftStatusLabel("sent")).toBe("已发送");
    expect(draftStatusLabel("edited")).toBe("编辑中");
    expect(draftStatusLabel("discarded")).toBe("已丢弃");
  });
});
