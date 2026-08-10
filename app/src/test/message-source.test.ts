/** Tests for the message source-mode formatter. */

import { describe, expect, it } from "vitest";
import { formatMessageSource, messagePreview } from "../panels/message-source";
import type { Message } from "../types";

const baseMessage = (overrides?: Partial<Message>): Message => ({
  id: "msg-1",
  pid: "ct-1",
  subj: "Test subject",
  prev: "Preview text",
  body: "Hello world.\n\nThis is the body.",
  tm: "10:00",
  st: "2026-08-05T08:00:00.000Z",
  ac: "acct-1",
  bucket: "imbox",
  unread: false,
  labels: [],
  attachments: [],
  to: "me@example.com",
  cc: ["cc@example.com"],
  threadId: undefined,
  calendarInvite: null,
  ...overrides,
});

describe("formatMessageSource", () => {
  it("renders From/To/Subject/Date/body", () => {
    const source = formatMessageSource(baseMessage(), {
      name: "Sender Name",
      email: "sender@example.com",
    });
    expect(source).toContain("From: Sender Name <sender@example.com>");
    expect(source).toContain("To: me@example.com");
    expect(source).toContain("Cc: cc@example.com");
    expect(source).toContain("Subject: Test subject");
    expect(source).toContain("Date: 2026-08-05T08:00:00.000Z");
    expect(source).toContain("Hello world.");
  });

  it("falls back to preview when body is empty", () => {
    const source = formatMessageSource(
      baseMessage({ body: "", prev: "Fallback preview" }),
      { name: "Sender", email: "sender@example.com" },
    );
    expect(source).toContain("Fallback preview");
  });

  it("labels missing subject as (no subject)", () => {
    const source = formatMessageSource(baseMessage({ subj: "" }), {
      name: "Sender",
      email: "sender@example.com",
    });
    expect(source).toContain("Subject: (no subject)");
  });

  it("omits To and Cc when missing", () => {
    const source = formatMessageSource(
      baseMessage({ to: undefined, cc: undefined }),
      { name: "Sender", email: "sender@example.com" },
    );
    expect(source).not.toContain("To:");
    expect(source).not.toContain("Cc:");
  });
});

describe("messagePreview", () => {
  it("returns the full text when short", () => {
    expect(messagePreview("Short text")).toBe("Short text");
  });

  it("collapses whitespace", () => {
    expect(messagePreview("Hello\n\nworld")).toBe("Hello world");
  });

  it("truncates long text with ellipsis", () => {
    const long = "a".repeat(200);
    const preview = messagePreview(long);
    expect(preview.length).toBeLessThanOrEqual(111);
    expect(preview.endsWith("…")).toBe(true);
  });
});
