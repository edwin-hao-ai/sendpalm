/** RecipientInput — commit classification + suggestion filtering.
 *  Pure helpers extracted so the picker can be tested without rendering. */

import { describe, it, expect } from "vitest";
import {
  classifyRecipient,
  filterSuggestions,
  SUGGESTION_LIMIT,
  type RecipientContact,
} from "./RecipientInput";

const contact = (
  id: string,
  name: string,
  ...emails: string[]
): RecipientContact => ({
  id,
  name,
  emails: emails.map((value) => ({ value })),
});

describe("classifyRecipient", () => {
  it("classifies an empty field", () => {
    expect(classifyRecipient("   ", [])).toEqual({ kind: "empty" });
  });

  it("rejects malformed addresses", () => {
    expect(classifyRecipient("not-an-email", [])).toEqual({
      kind: "invalid",
      email: "not-an-email",
    });
    expect(classifyRecipient("a@b", [])).toEqual({
      kind: "invalid",
      email: "a@b",
    });
  });

  it("rejects duplicates already in the pill list", () => {
    expect(classifyRecipient("a@b.com", ["a@b.com"])).toEqual({
      kind: "duplicate",
      email: "a@b.com",
    });
  });

  it("accepts a fresh valid address", () => {
    expect(classifyRecipient(" alice@example.com ", [])).toEqual({
      kind: "add",
      email: "alice@example.com",
    });
  });
});

describe("filterSuggestions", () => {
  const contacts = [
    contact("c1", "Alice", "alice@example.com", "alice@work.com"),
    contact("c2", "Bob", "bob@example.com"),
  ];

  it("returns nothing for an empty query", () => {
    expect(filterSuggestions(contacts, "", []).rows).toEqual([]);
  });

  it("matches by name and by address", () => {
    expect(
      filterSuggestions(contacts, "alice", []).rows.map((r) => r.email),
    ).toEqual(["alice@example.com", "alice@work.com"]);
    expect(
      filterSuggestions(contacts, "bob@", []).rows.map((r) => r.email),
    ).toEqual(["bob@example.com"]);
  });

  it("still matches after the user types '@'", () => {
    // Regression: an "@" in the query used to hide every candidate.
    const { rows } = filterSuggestions(contacts, "alice@", []);
    expect(rows.map((r) => r.email)).toContain("alice@example.com");
  });

  it("excludes addresses already in the pill list", () => {
    const { rows } = filterSuggestions(contacts, "alice", [
      "alice@example.com",
    ]);
    expect(rows.map((r) => r.email)).toEqual(["alice@work.com"]);
  });

  it("caps the rendered rows at SUGGESTION_LIMIT but reports the total", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      contact(`c${i}`, `Match ${i}`, `match${i}@example.com`),
    );
    const { rows, total } = filterSuggestions(many, "match", []);
    expect(rows.length).toBe(SUGGESTION_LIMIT);
    expect(total).toBe(12);
  });
});
