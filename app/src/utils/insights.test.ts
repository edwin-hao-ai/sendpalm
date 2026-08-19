/** Unit tests for app/src/utils/insights.ts (computeReplyTimeStats). */

import { describe, expect, test } from "vitest";
import { computeReplyTimeStats, formatDuration } from "./insights";
import type { Message } from "../types";

const NOW = new Date("2026-08-19T12:00:00.000Z");

/** Build a message stub with sensible defaults. */
function mkMsg(over: Partial<Message> & { st: string; bucket: string }): Message {
  return {
    id: over.id ?? `m_${over.st}`,
    pid: over.pid ?? "c_alice",
    subj: over.subj ?? "",
    prev: "",
    body: "",
    bodyHtml: null,
    tm: over.st,
    st: over.st,
    ac: "acct_1",
    bucket: over.bucket as Message["bucket"],
    direction: over.direction ?? "in",
    unread: false,
    labels: [],
    attachments: [],
    ...over,
  } as Message;
}

describe("computeReplyTimeStats", () => {
  test("empty input returns null median", () => {
    const s = computeReplyTimeStats([], { now: NOW });
    expect(s).toEqual({
      medianHours: null,
      replied: 0,
      noReply: 0,
      total: 0,
    });
  });

  test("incoming without outgoing counts as noReply", () => {
    const msgs: Message[] = [
      mkMsg({ id: "m1", st: "2026-08-18T10:00:00Z", bucket: "imbox" }),
    ];
    const s = computeReplyTimeStats(msgs, { now: NOW });
    expect(s.medianHours).toBeNull();
    expect(s.replied).toBe(0);
    expect(s.noReply).toBe(1);
    expect(s.total).toBe(1);
  });

  test("same-thread pairing by threadId", () => {
    const msgs: Message[] = [
      mkMsg({
        id: "inc1",
        st: "2026-08-18T10:00:00Z",
        bucket: "imbox",
        threadId: "t_1",
      }),
      mkMsg({
        id: "out1",
        st: "2026-08-18T13:00:00Z",
        bucket: "sent",
        direction: "out",
        threadId: "t_1",
      }),
    ];
    const s = computeReplyTimeStats(msgs, { now: NOW });
    expect(s.medianHours).toBe(3); // 3 hours
    expect(s.replied).toBe(1);
    expect(s.noReply).toBe(0);
  });

  test("pid fallback pairing when threadId null", () => {
    const msgs: Message[] = [
      mkMsg({
        id: "inc1",
        pid: "c_alice",
        st: "2026-08-18T10:00:00Z",
        bucket: "imbox",
      }),
      mkMsg({
        id: "out1",
        pid: "c_alice",
        st: "2026-08-18T12:00:00Z",
        bucket: "sent",
        direction: "out",
      }),
    ];
    const s = computeReplyTimeStats(msgs, { now: NOW });
    expect(s.medianHours).toBe(2);
    expect(s.replied).toBe(1);
  });

  test("picks the EARLIEST reply that came after the incoming message", () => {
    const msgs: Message[] = [
      mkMsg({ id: "inc1", st: "2026-08-18T10:00:00Z", bucket: "imbox" }),
      // Late reply — should be ignored.
      mkMsg({
        id: "out_late",
        st: "2026-08-19T08:00:00Z",
        bucket: "sent",
        direction: "out",
      }),
      // Early reply — should be used.
      mkMsg({
        id: "out_early",
        st: "2026-08-18T11:00:00Z",
        bucket: "sent",
        direction: "out",
      }),
    ];
    const s = computeReplyTimeStats(msgs, { now: NOW });
    expect(s.medianHours).toBe(1);
  });

  test("median: odd sample size picks the middle", () => {
    const msgs: Message[] = [
      mkMsg({ id: "i1", st: "2026-08-18T08:00:00Z", bucket: "imbox" }),
      mkMsg({ id: "i2", st: "2026-08-18T09:00:00Z", bucket: "imbox" }),
      mkMsg({ id: "i3", st: "2026-08-18T10:00:00Z", bucket: "imbox" }),
      mkMsg({ id: "o1", st: "2026-08-18T09:00:00Z", bucket: "sent", direction: "out" }),
      mkMsg({ id: "o2", st: "2026-08-18T10:00:00Z", bucket: "sent", direction: "out" }),
      mkMsg({ id: "o3", st: "2026-08-18T13:00:00Z", bucket: "sent", direction: "out" }),
    ];
    // deltas: 1, 1, 3 → median 1
    const s = computeReplyTimeStats(msgs, { now: NOW });
    expect(s.medianHours).toBe(1);
  });

  test("median: even sample size averages the two middle values", () => {
    const msgs: Message[] = [
      mkMsg({ id: "i1", st: "2026-08-18T08:00:00Z", bucket: "imbox" }),
      mkMsg({ id: "i2", st: "2026-08-18T10:00:00Z", bucket: "imbox" }),
      mkMsg({ id: "o1", st: "2026-08-18T09:00:00Z", bucket: "sent", direction: "out" }),
      mkMsg({ id: "o2", st: "2026-08-18T14:00:00Z", bucket: "sent", direction: "out" }),
    ];
    // deltas: 1, 4 → median 2.5
    const s = computeReplyTimeStats(msgs, { now: NOW });
    expect(s.medianHours).toBe(2.5);
  });

  test("messages outside the window are excluded", () => {
    const msgs: Message[] = [
      // 60 days ago — outside default 30-day window
      mkMsg({ id: "old", st: "2026-06-19T10:00:00Z", bucket: "imbox" }),
      mkMsg({
        id: "oldReply",
        st: "2026-06-19T13:00:00Z",
        bucket: "sent",
        direction: "out",
      }),
      // 5 days ago — inside window
      mkMsg({ id: "new", st: "2026-08-14T10:00:00Z", bucket: "imbox" }),
      mkMsg({
        id: "newReply",
        st: "2026-08-14T16:00:00Z",
        bucket: "sent",
        direction: "out",
      }),
    ];
    const s = computeReplyTimeStats(msgs, { now: NOW });
    expect(s.total).toBe(1);
    expect(s.replied).toBe(1);
    expect(s.medianHours).toBe(6);
  });

  test("non-imbox incoming messages are ignored", () => {
    const msgs: Message[] = [
      mkMsg({ id: "spam", st: "2026-08-18T10:00:00Z", bucket: "spam" }),
      mkMsg({
        id: "spamReply",
        st: "2026-08-18T13:00:00Z",
        bucket: "sent",
        direction: "out",
      }),
    ];
    const s = computeReplyTimeStats(msgs, { now: NOW });
    expect(s.total).toBe(0);
    expect(s.replied).toBe(0);
  });

  test("explicit since/until override the 30-day default", () => {
    const msgs: Message[] = [
      mkMsg({ id: "i1", st: "2026-07-01T10:00:00Z", bucket: "imbox" }),
      mkMsg({
        id: "o1",
        st: "2026-07-01T11:00:00Z",
        bucket: "sent",
        direction: "out",
      }),
    ];
    const s = computeReplyTimeStats(msgs, {
      now: NOW,
      since: "2026-06-30T00:00:00Z",
      until: "2026-07-31T00:00:00Z",
    });
    expect(s.medianHours).toBe(1);
    expect(s.total).toBe(1);
  });
});

describe("formatDuration", () => {
  test("under an hour shows minutes", () => {
    expect(formatDuration(0.5)).toBe("30 分钟");
    expect(formatDuration(0.0167)).toBe("1 分钟"); // 1 minute, floor to 1
  });

  test("under 48 hours shows rounded hours", () => {
    expect(formatDuration(2)).toBe("2 小时");
    expect(formatDuration(23.4)).toBe("23 小时");
  });

  test("under 14 days shows decimal days", () => {
    expect(formatDuration(48)).toBe("2.0 天");
    expect(formatDuration(72)).toBe("3.0 天");
  });

  test(">= 14 days shows rounded days", () => {
    expect(formatDuration(24 * 14)).toBe("14 天");
    expect(formatDuration(24 * 30)).toBe("30 天");
  });
});
