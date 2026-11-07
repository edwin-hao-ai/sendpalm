/** Multi-account scope helpers.
 *
 *  SendPalm syncs every configured mailbox into one SQLite table, and every
 *  message carries `ac` (the account id). That means the merged view is the
 *  default and needs no filtering at all; switching accounts is the case that
 *  needs one. These helpers turn (accounts, current selection) into the
 *  `accountIds` value `listMessagesPaged` expects, and they are pure so the
 *  rule can be unit-tested without a database.
 *
 *  `privacy` is the merge switch: `unified` accounts join the 全部账户 view,
 *  `isolated` accounts only appear when the user picks them explicitly. The
 *  field existed in the schema since migration 0001 and no code ever read it
 *  — this module is where that ends.
 */

import type { Account, AccountPrivacy, ID } from "../types";

/** Sentinel for the merged view. Account ids never collide with it because
 *  they are `acct_…` slugs generated in Settings. */
export const ALL_ACCOUNTS = "all";

/** Email accounts only. IM / calendar rows live in the same table and must
 *  never show up as an account tab. */
export function emailAccounts(accounts: Account[]): Account[] {
  return accounts.filter((a) => a.type === "email");
}

/** The accounts that participate in the merged view. */
export function mergedAccounts(accounts: Account[]): Account[] {
  return emailAccounts(accounts).filter((a) => a.privacy !== "isolated");
}

/**
 * Resolve the current tab selection into a `listMessagesPaged` filter.
 *
 *  - `undefined` → no account filter at all. This is the merged view when
 *    nothing is isolated: skipping the predicate keeps the query identical to
 *    the pre-multi-account one (and picks up rows whose `ac` is empty, which
 *    legacy imports can have).
 *  - `[]` → the selection matches no account, so the page is empty.
 *  - `[id, …]` → restrict to those accounts.
 *
 *  An `activeAccountId` that no longer exists (account deleted while the app
 *  was open) degrades to the merged view instead of blanking the screen.
 */
export function resolveAccountFilter(
  accounts: Account[],
  activeAccountId: string,
): string[] | undefined {
  if (activeAccountId !== ALL_ACCOUNTS) {
    const exists = emailAccounts(accounts).some((a) => a.id === activeAccountId);
    if (exists) return [activeAccountId];
  }
  const merged = mergedAccounts(accounts);
  // Nothing isolated → no predicate. One email account total → also no
  // predicate: the filter would return the same rows.
  if (merged.length === emailAccounts(accounts).length) return undefined;
  return merged.map((a) => a.id);
}

/** True when the account tabs are worth showing. One mailbox needs no
 *  switcher, and two accounts where one is isolated still does — the user
 *  can only reach the isolated mailbox through the tab. */
export function shouldShowAccountTabs(accounts: Account[]): boolean {
  return emailAccounts(accounts).length > 1;
}

/** Distinct account colours, handed out round-robin as accounts are added.
 *  Every account used to be written with the same brand green, so a merged
 *  list had no way to show where a message came from. */
export const ACCOUNT_COLORS = [
  "#0a8f63",
  "#2f6feb",
  "#7700a2",
  "#b7791f",
  "#c2410c",
  "#0f766e",
] as const;

export function nextAccountColor(existing: Account[]): string {
  return ACCOUNT_COLORS[existing.length % ACCOUNT_COLORS.length]!;
}

/** Short label for an account tab. The full label ("SendPalm 工作邮箱")
 *  is too wide for a pill; the email local-part ("edwinhao") is what the
 *  user recognises. Falls back to the label when there is no email. */
export function accountTabLabel(account: Account): string {
  const email = account.email?.trim();
  if (email) {
    const local = email.split("@")[0];
    if (local) return local;
  }
  return account.label;
}

/** One or two characters for the account dot on a merged message row. */
export function accountInitial(account: Account | undefined): string {
  if (!account) return "?";
  const email = account.email?.trim();
  const source = email?.split("@")[0] || account.label;
  return (source[0] ?? "?").toUpperCase();
}

/** Look up the account for a message's `ac`, tolerating stale ids. */
export function accountById(
  accounts: Account[],
  id: ID | undefined,
): Account | undefined {
  if (!id) return undefined;
  return accounts.find((a) => a.id === id);
}

/** Persisted privacy value guard — settings_json can hold anything. */
export function isAccountPrivacy(v: unknown): v is AccountPrivacy {
  return v === "unified" || v === "isolated";
}
