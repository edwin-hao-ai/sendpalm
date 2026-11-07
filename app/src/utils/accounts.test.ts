/** Multi-account scope rules — pure logic, no database. */

import { describe, expect, it } from "vitest";
import {
  ACCOUNT_COLORS,
  ALL_ACCOUNTS,
  accountById,
  accountInitial,
  accountTabLabel,
  emailAccounts,
  mergedAccounts,
  nextAccountColor,
  resolveAccountFilter,
  shouldShowAccountTabs,
} from "./accounts";
import type { Account } from "../types";

function acct(
  id: string,
  overrides: Partial<Account> = {},
): Account {
  return {
    id,
    type: "email",
    provider: "custom",
    email: `${id}@example.com`,
    label: `Label ${id}`,
    displayName: id,
    status: "connected",
    synced: 0,
    total: 0,
    privacy: "unified",
    color: "#0a8f63",
    avatar: id[0] ?? "?",
    lastSync: "",
    ...overrides,
  } as Account;
}

describe("emailAccounts", () => {
  it("drops non-email rows so they never become tabs", () => {
    const list = [
      acct("a"),
      acct("im1", { type: "im" }),
      acct("cal1", { type: "calendar" }),
    ];
    expect(emailAccounts(list).map((a) => a.id)).toEqual(["a"]);
  });
});

describe("mergedAccounts", () => {
  it("excludes isolated mailboxes from the merged view", () => {
    const list = [
      acct("work"),
      acct("private", { privacy: "isolated" }),
      acct("side"),
    ];
    expect(mergedAccounts(list).map((a) => a.id)).toEqual(["work", "side"]);
  });
});

describe("resolveAccountFilter", () => {
  it("returns undefined for the merged view when nothing is isolated", () => {
    // Undefined is the fast path: the query runs with no account predicate.
    expect(resolveAccountFilter([acct("a"), acct("b")], ALL_ACCOUNTS)).toBe(
      undefined,
    );
  });

  it("returns the non-isolated ids for the merged view when some are isolated", () => {
    const list = [acct("work"), acct("secret", { privacy: "isolated" })];
    expect(resolveAccountFilter(list, ALL_ACCOUNTS)).toEqual(["work"]);
  });

  it("returns the single id when a mailbox is selected", () => {
    const list = [acct("work"), acct("side")];
    expect(resolveAccountFilter(list, "side")).toEqual(["side"]);
  });

  it("can select an isolated mailbox explicitly", () => {
    const list = [acct("work"), acct("secret", { privacy: "isolated" })];
    expect(resolveAccountFilter(list, "secret")).toEqual(["secret"]);
  });

  it("degrades a stale selection back to the merged view", () => {
    // The account was deleted while the app was open; blanking the list
    // would look like data loss.
    const list = [acct("work"), acct("side")];
    expect(resolveAccountFilter(list, "deleted-id")).toBe(undefined);
  });

  it("returns an empty array when every mailbox is isolated and the merged tab is active", () => {
    // The caller short-circuits to an empty page — `IN ()` is invalid SQL.
    const list = [
      acct("one", { privacy: "isolated" }),
      acct("two", { privacy: "isolated" }),
    ];
    expect(resolveAccountFilter(list, ALL_ACCOUNTS)).toEqual([]);
  });

  it("treats an empty account list as the unfiltered merged view", () => {
    expect(resolveAccountFilter([], ALL_ACCOUNTS)).toBe(undefined);
  });
});

describe("shouldShowAccountTabs", () => {
  it("hides the strip for a single mailbox", () => {
    expect(shouldShowAccountTabs([acct("only")])).toBe(false);
  });

  it("shows the strip for two mailboxes", () => {
    expect(shouldShowAccountTabs([acct("a"), acct("b")])).toBe(true);
  });

  it("shows the strip even when one of two is isolated — the tab is the only route in", () => {
    expect(
      shouldShowAccountTabs([acct("a"), acct("b", { privacy: "isolated" })]),
    ).toBe(true);
  });
});

describe("nextAccountColor", () => {
  it("hands the first account the brand colour", () => {
    expect(nextAccountColor([])).toBe(ACCOUNT_COLORS[0]);
  });

  it("returns a different colour for each of the first N accounts", () => {
    const seen = new Set<string>();
    const list: Account[] = [];
    for (let i = 0; i < ACCOUNT_COLORS.length; i++) {
      seen.add(nextAccountColor(list));
      list.push(acct(`a${i}`));
    }
    expect(seen.size).toBe(ACCOUNT_COLORS.length);
  });

  it("wraps around past the palette length", () => {
    const full = ACCOUNT_COLORS.map((_, i) => acct(`a${i}`));
    expect(nextAccountColor(full)).toBe(ACCOUNT_COLORS[0]);
  });
});

describe("accountTabLabel", () => {
  it("prefers the email local-part", () => {
    expect(accountTabLabel(acct("x", { email: "edwin@sendpalm.com" }))).toBe(
      "edwin",
    );
  });

  it("falls back to the label when there is no email", () => {
    expect(accountTabLabel(acct("x", { email: undefined }))).toBe("Label x");
  });
});

describe("accountInitial", () => {
  it("uppercases the email local-part's first letter", () => {
    expect(accountInitial(acct("x", { email: "edwin@sendpalm.com" }))).toBe(
      "E",
    );
  });

  it("returns ? for an unknown account", () => {
    expect(accountInitial(undefined)).toBe("?");
  });
});

describe("accountById", () => {
  it("finds the account for a message's ac", () => {
    const list = [acct("a"), acct("b")];
    expect(accountById(list, "b")?.id).toBe("b");
  });

  it("returns undefined for a stale or missing id", () => {
    expect(accountById([acct("a")], "gone")).toBeUndefined();
    expect(accountById([acct("a")], undefined)).toBeUndefined();
  });
});
