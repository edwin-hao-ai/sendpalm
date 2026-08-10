/** Tests for the heuristic AI draft generator. */

import { describe, expect, it } from "vitest";
import { generateAiDraft } from "../utils/draft";
import type { Contact, Message } from "../types";

const mkMsg = (subj: string, body: string): Message =>
  ({
    id: "m1",
    pid: "c1",
    subj,
    prev: "",
    body,
    tm: "",
    st: "2026-01-01T00:00:00Z",
    ac: "a1",
    bucket: "imbox",
    unread: true,
    labels: [],
    attachments: [],
  }) as Message;

const contact: Contact = {
  id: "c1",
  name: "Alice Smith",
  firstName: "Alice",
  lastName: "Smith",
} as Contact;

describe("generateAiDraft", () => {
  it("strips Re: prefix from subject", () => {
    const draft = generateAiDraft(mkMsg("Re: metrics", "numbers"), contact);
    expect(draft).toContain("ARR");
    expect(draft).toContain("Alice");
  });

  it("picks the metrics template", () => {
    const draft = generateAiDraft(mkMsg("Monthly metrics", ""), contact);
    expect(draft).toContain("ARR: $2.4M");
    expect(draft).toContain("Net revenue retention");
  });

  it("picks the contract template for Chinese keywords", () => {
    const draft = generateAiDraft(mkMsg("合同修订", "付款节奏确认"), contact);
    expect(draft).toContain("付款节奏同意按 30-40-30");
  });

  it("picks the meeting template", () => {
    const draft = generateAiDraft(
      mkMsg("Catch up", "Are you available tomorrow?"),
      contact,
    );
    expect(draft).toContain("Tuesday afternoon");
  });

  it("picks the urgent template", () => {
    const draft = generateAiDraft(mkMsg("Issue", " urgent decision needed"));
    expect(draft).toContain("by end of day");
  });

  it("falls back to generic template", () => {
    const draft = generateAiDraft(mkMsg("Hello", "Just saying hi"));
    expect(draft).toContain("Thanks for the note");
  });

  it("uses sender email when contact is missing", () => {
    const draft = generateAiDraft(
      mkMsg("Hello", "Just saying hi"),
      undefined,
      "bob@x.com",
    );
    expect(draft).toContain("Hi bob@x.com");
  });
});
