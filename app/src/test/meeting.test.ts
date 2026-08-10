/** Meeting helper tests. */

import { describe, expect, it } from "vitest";
import { generateMeetingBrief, linkedMaterialIds } from "../utils/meeting";
import type { CalendarEvent, Contact, FileItem, Message } from "../types";

const contactA: Contact = {
  id: "c_a",
  name: "Alice",
  firstName: "Alice",
  lastName: "",
  nickname: "",
  company: "",
  title: "",
  emails: [],
  phones: [],
  stage: "active",
  labels: [],
  topics: [],
  notes: "",
  avatar: "",
  photo: "",
  health: 80,
  sc: 0,
  scC: "",
  scL: "",
  lc: "",
  grp: "active",
  trd: "stable",
  pattern: "",
  accounts: [],
  stageHistory: [],
  firstContact: "",
  milestones: [],
  merged: false,
  blocked: false,
  notify: true,
  firstSeen: true,
  screened: true,
  defaultBucket: "imbox",
  autoLabel: [],
  recycling: false,
  ch: [],
};

const contactB: Contact = {
  ...contactA,
  id: "c_b",
  name: "Bob",
  firstName: "Bob",
  lastName: "",
};

const event: CalendarEvent = {
  id: "evt_1",
  title: "Sync",
  dt: new Date().toISOString(),
  tm: "10:00",
  pids: [contactA.id, contactB.id],
  color: "#0A8F63",
  agenda: [],
  notes: "",
  brief: "",
  actionItems: [],
  materials: [],
};

function message(pid: string, overrides: Partial<Message> = {}): Message {
  return {
    id: `m_${pid}_${Date.now()}`,
    pid,
    subj: "Update",
    prev: "",
    body: "Just a quick update.",
    tm: "09:00",
    st: new Date().toISOString(),
    ac: "acct_1",
    bucket: "imbox",
    direction: "in",
    unread: false,
    labels: [],
    attachments: [],
    ...overrides,
  };
}

function file(pid: string, name: string): FileItem {
  return {
    id: `f_${pid}_${name}`,
    pid,
    name,
    type: "pdf",
    mime: "application/pdf",
    size: 1024,
    st: new Date().toISOString(),
  };
}

describe("generateMeetingBrief", () => {
  it("returns empty when no context exists", () => {
    expect(generateMeetingBrief(event, [], [], [])).toEqual([]);
  });

  it("counts recent messages from attendees", () => {
    const msgs = [
      message(contactA.id),
      message(contactA.id),
      message(contactB.id),
    ];
    const brief = generateMeetingBrief(event, msgs, [], [contactA, contactB]);
    expect(brief[0]).toMatch(/共有 3 条沟通/);
  });

  it("ignores messages older than 30 days", () => {
    const old = message(contactA.id, {
      st: new Date(Date.now() - 31 * 86400_000).toISOString(),
    });
    const brief = generateMeetingBrief(event, [old], [], [contactA, contactB]);
    expect(brief).toEqual([]);
  });

  it("reports waiting replies from me", () => {
    const waiting = message(contactA.id, {
      direction: "out",
      replyLater: true,
    });
    const brief = generateMeetingBrief(event, [waiting], [], [contactA]);
    expect(brief.some((s) => s.includes("等对方回复"))).toBe(true);
  });

  it("reports shared files", () => {
    const files = [file(contactA.id, "a.pdf"), file(contactB.id, "b.pdf")];
    const brief = generateMeetingBrief(event, [], files, [contactA, contactB]);
    expect(brief[0]).toMatch(/共享 2 个附件/);
  });

  it("extracts top topic from message text", () => {
    const msgs = [
      message(contactA.id, { body: "合同 合同 terms", subj: "Contract" }),
      message(contactA.id, { body: "合同 draft" }),
      message(contactA.id, { body: "invoice please" }),
    ];
    const brief = generateMeetingBrief(event, msgs, [], [contactA]);
    expect(brief.some((s) => s.includes("主要话题：合同"))).toBe(true);
  });
});

describe("linkedMaterialIds", () => {
  it("includes explicit event materials", () => {
    const evt: CalendarEvent = {
      ...event,
      materials: [{ fileId: "f_explicit" }],
    };
    expect(linkedMaterialIds(evt, [])).toContain("f_explicit");
  });

  it("includes up to 3 files per attendee", () => {
    const files = [
      file(contactA.id, "1.pdf"),
      file(contactA.id, "2.pdf"),
      file(contactA.id, "3.pdf"),
      file(contactA.id, "4.pdf"),
      file(contactB.id, "b1.pdf"),
    ];
    const ids = linkedMaterialIds(event, files);
    expect(ids).toContain("f_c_a_1.pdf");
    expect(ids).toContain("f_c_a_2.pdf");
    expect(ids).toContain("f_c_a_3.pdf");
    expect(ids).not.toContain("f_c_a_4.pdf");
    expect(ids).toContain("f_c_b_b1.pdf");
  });
});
