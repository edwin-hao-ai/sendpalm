/** Data store queries — unit tests for the SQL-backed helpers. */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../services/tauri-shim", () => ({ IS_BROWSER: () => true }));

import {
  listGateQueue,
  upsertContact,
  upsertMessage,
  listContactMessages,
  listContactFiles,
  listContactEvents,
  listContactTasks,
  listContactFollowUps,
  listContactClips,
  listCompanyContacts,
  listCompanyMessages,
  listCompanyFiles,
  listCompanyEvents,
  upsertFile,
  upsertEvent,
  upsertTask,
  upsertFollowUp,
  upsertClip,
} from "./data";
import { resetMockDb } from "../services/mock-db";
import type { Contact, Message, FileItem, CalendarEvent, Task, FollowUp, Clip } from "../types";

const isoNow = () => new Date().toISOString();

function makeContact(id: string, overrides?: Partial<Contact>): Contact {
  return {
    id,
    firstName: "First",
    lastName: "Last",
    nickname: "",
    name: `Contact ${id}`,
    company: "",
    title: "",
    emails: [{ value: `${id}@example.com`, label: "work" }],
    phones: [],
    stage: "explore",
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
    grp: "",
    trd: "stable",
    pattern: "",
    accounts: [],
    stageHistory: [],
    firstContact: isoNow(),
    milestones: [],
    merged: false,
    blocked: false,
    notify: false,
    firstSeen: true,
    screened: false,
    defaultBucket: "imbox",
    autoLabel: [],
    recycling: false,
    ch: [],
    ...overrides,
  };
}

function makeMessage(id: string, pid: string, overrides?: Partial<Message>): Message {
  return {
    id,
    pid,
    subj: `Subject ${id}`,
    prev: "",
    body: `Body ${id}`,
    bodyHtml: null,
    tm: "10:00",
    st: isoNow(),
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
    threadId: undefined,
    calendarInvite: null,
    ...overrides,
  };
}

describe("listGateQueue", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("returns an empty array when no contacts need screening", async () => {
    expect(await listGateQueue()).toEqual([]);
  });

  it("returns a contact and its newest message for the Gate", async () => {
    const contact = makeContact("c-new");
    await upsertContact(contact);
    await upsertMessage(makeMessage("m-old", contact.id, { st: "2024-01-01T00:00:00.000Z", subj: "Old" }));
    await upsertMessage(makeMessage("m-new", contact.id, { st: "2024-02-01T00:00:00.000Z", subj: "New" }));

    const queue = await listGateQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]!.contact.id).toBe(contact.id);
    expect(queue[0]!.message.id).toBe("m-new");
    expect(queue[0]!.message.subj).toBe("New");
  });

  it("only includes first-seen, unscreened, unblocked contacts", async () => {
    await upsertContact(makeContact("c-unscreened"));
    await upsertContact(makeContact("c-screened", { firstSeen: false, screened: true }));
    await upsertContact(makeContact("c-blocked", { blocked: true }));
    await upsertMessage(makeMessage("m1", "c-unscreened"));
    await upsertMessage(makeMessage("m2", "c-screened"));
    await upsertMessage(makeMessage("m3", "c-blocked"));

    const queue = await listGateQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]!.contact.id).toBe("c-unscreened");
  });

  it("ignores outgoing messages when screening", async () => {
    const contact = makeContact("c-out");
    await upsertContact(contact);
    await upsertMessage(makeMessage("m-out", contact.id, { direction: "out" }));

    expect(await listGateQueue()).toEqual([]);
  });

  it("skips contacts that have no messages", async () => {
    await upsertContact(makeContact("c-no-msg"));
    await upsertContact(makeContact("c-with-msg"));
    await upsertMessage(makeMessage("m1", "c-with-msg"));

    const queue = await listGateQueue();
    expect(queue).toHaveLength(1);
    expect(queue[0]!.contact.id).toBe("c-with-msg");
  });
});

function makeFile(id: string, pid: string, overrides?: Partial<FileItem>): FileItem {
  return {
    id,
    pid,
    name: `${id}.pdf`,
    type: "pdf",
    mime: "application/pdf",
    size: 1024,
    url: undefined,
    content: undefined,
    st: isoNow(),
    sender: undefined,
    thumbUrl: undefined,
    md: undefined,
    sourceMessageIds: [],
    ...overrides,
  };
}

function makeEvent(id: string, pids: string[], overrides?: Partial<CalendarEvent>): CalendarEvent {
  return {
    id,
    title: `Event ${id}`,
    dt: isoNow().slice(0, 10),
    endDt: undefined,
    allDay: false,
    tm: "10:00",
    dur: 60,
    pids,
    color: "#0A8F63",
    location: undefined,
    videoLink: undefined,
    reminder: undefined,
    agenda: [],
    notes: "",
    brief: "",
    actionItems: [],
    materials: [],
    transcriptUrl: undefined,
    recordingUrl: undefined,
    habit: false,
    sometimeBucket: undefined,
    timeTrackingMs: 0,
    photoUrl: undefined,
    circled: false,
    dayNote: undefined,
    ...overrides,
  };
}

function makeTask(id: string, relatedContactId: string, overrides?: Partial<Task>): Task {
  return {
    id,
    title: `Task ${id}`,
    due: undefined,
    status: "todo",
    priority: "normal",
    relatedContactId,
    relatedEventId: undefined,
    notes: "",
    createdAt: isoNow(),
    ...overrides,
  };
}

function makeFollowUp(id: string, msgId: string, overrides?: Partial<FollowUp>): FollowUp {
  return {
    id,
    msgId,
    dueAt: isoNow().slice(0, 10),
    status: "pending",
    note: undefined,
    surfacedAt: null,
    ...overrides,
  };
}

function makeClip(id: string, contactId: string, overrides?: Partial<Clip>): Clip {
  return {
    id,
    text: `Clip ${id}`,
    msgId: undefined,
    contactId,
    createdAt: isoNow(),
    ...overrides,
  };
}

describe("per-contact queries", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("listContactMessages returns only messages for the contact", async () => {
    await upsertContact(makeContact("c1"));
    await upsertContact(makeContact("c2"));
    await upsertMessage(makeMessage("m1", "c1"));
    await upsertMessage(makeMessage("m2", "c2"));

    const msgs = await listContactMessages("c1");
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.id).toBe("m1");
  });

  it("listContactFiles returns only files for the contact", async () => {
    await upsertFile(makeFile("f1", "c1"));
    await upsertFile(makeFile("f2", "c2"));

    const files = await listContactFiles("c1");
    expect(files).toHaveLength(1);
    expect(files[0]!.id).toBe("f1");
  });

  it("listContactEvents returns events that include the contact", async () => {
    await upsertEvent(makeEvent("e1", ["c1"]));
    await upsertEvent(makeEvent("e2", ["c2"]));

    const evts = await listContactEvents("c1");
    expect(evts).toHaveLength(1);
    expect(evts[0]!.id).toBe("e1");
  });

  it("listContactTasks returns only tasks related to the contact", async () => {
    await upsertTask(makeTask("t1", "c1"));
    await upsertTask(makeTask("t2", "c2"));

    const tasks = await listContactTasks("c1");
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.id).toBe("t1");
  });

  it("listContactFollowUps returns follow-ups for the contact's messages", async () => {
    await upsertContact(makeContact("c1"));
    await upsertContact(makeContact("c2"));
    await upsertMessage(makeMessage("m1", "c1"));
    await upsertMessage(makeMessage("m2", "c2"));
    await upsertFollowUp(makeFollowUp("fu1", "m1"));
    await upsertFollowUp(makeFollowUp("fu2", "m2"));

    const fus = await listContactFollowUps("c1");
    expect(fus).toHaveLength(1);
    expect(fus[0]!.id).toBe("fu1");
  });

  it("listContactClips returns only clips for the contact", async () => {
    await upsertClip(makeClip("cl1", "c1"));
    await upsertClip(makeClip("cl2", "c2"));

    const clips = await listContactClips("c1");
    expect(clips).toHaveLength(1);
    expect(clips[0]!.id).toBe("cl1");
  });
});

describe("per-company queries", () => {
  beforeEach(() => {
    resetMockDb();
  });

  it("listCompanyContacts returns contacts with the company name", async () => {
    await upsertContact(makeContact("c1", { company: "Acme" }));
    await upsertContact(makeContact("c2", { company: "Acme" }));
    await upsertContact(makeContact("c3", { company: "Other" }));

    const contacts = await listCompanyContacts("Acme");
    expect(contacts).toHaveLength(2);
    expect(contacts.map((c) => c.id).sort()).toEqual(["c1", "c2"]);
  });

  it("listCompanyMessages returns messages for company contacts", async () => {
    await upsertContact(makeContact("c1", { company: "Acme" }));
    await upsertContact(makeContact("c2", { company: "Acme" }));
    await upsertContact(makeContact("c3", { company: "Other" }));
    await upsertMessage(makeMessage("m1", "c1"));
    await upsertMessage(makeMessage("m2", "c2"));
    await upsertMessage(makeMessage("m3", "c3"));

    const msgs = await listCompanyMessages(["c1", "c2"]);
    expect(msgs).toHaveLength(2);
    expect(msgs.map((m) => m.id).sort()).toEqual(["m1", "m2"]);
  });

  it("listCompanyFiles returns files for company contacts", async () => {
    await upsertFile(makeFile("f1", "c1"));
    await upsertFile(makeFile("f2", "c2"));
    await upsertFile(makeFile("f3", "c3"));

    const files = await listCompanyFiles(["c1", "c2"]);
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.id).sort()).toEqual(["f1", "f2"]);
  });

  it("listCompanyEvents returns events that include any company contact", async () => {
    await upsertEvent(makeEvent("e1", ["c1"]));
    await upsertEvent(makeEvent("e2", ["c1", "c2"]));
    await upsertEvent(makeEvent("e3", ["c3"]));

    const evts = await listCompanyEvents(["c1", "c2"]);
    expect(evts).toHaveLength(2);
    expect(evts.map((e) => e.id).sort()).toEqual(["e1", "e2"]);
  });
});
