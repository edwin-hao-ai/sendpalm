import { describe, it, expect } from "vitest";
import { computeReplyTimeStats } from "./reply-time";
import type { Message } from "../types";

function makeMessage(overrides?: Partial<Message>): Message {
  return {
    id: "msg-1",
    pid: "ct-1",
    subj: "Test",
    prev: "",
    body: "",
    bodyHtml: null,
    tm: "10:00",
    st: new Date().toISOString(),
    ac: "acct-1",
    bucket: "imbox",
    direction: "in",
    unread: true,
    labels: [],
    attachments: [],
    trackers: [],
    replyLater: false,
    setAside: false,
    bubbleUpAt: null,
    remindAt: null,
    deletedAt: null,
    to: "me@example.com",
    cc: [],
    bcc: [],
    ...overrides,
  };
}

function at(hoursFromBase: number): string {
  return new Date(1000 * 60 * 60 * hoursFromBase).toISOString();
}

describe("computeReplyTimeStats", () => {
  it("returns null when there are no messages", () => {
    expect(computeReplyTimeStats([])).toEqual({
      averageHours: null,
      medianHours: null,
    });
  });

  it("computes average and median for a single in/out pair", () => {
    const messages = [
      makeMessage({ direction: "in", st: at(0) }),
      makeMessage({ direction: "out", st: at(4) }),
    ];
    expect(computeReplyTimeStats(messages)).toEqual({
      averageHours: 4,
      medianHours: 4,
    });
  });

  it("computes average and median for multiple pairs", () => {
    const messages = [
      makeMessage({ direction: "in", st: at(0) }),
      makeMessage({ direction: "out", st: at(2) }),
      makeMessage({ direction: "in", st: at(5) }),
      makeMessage({ direction: "out", st: at(11) }),
      makeMessage({ direction: "in", st: at(20) }),
      makeMessage({ direction: "out", st: at(30) }),
    ];
    expect(computeReplyTimeStats(messages)).toEqual({
      averageHours: 6,
      medianHours: 6,
    });
  });
});
