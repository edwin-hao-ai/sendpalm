/** Account scoping for list views.
 *
 *  A mail list renders `/` merged (every mailbox) unless the user picked a
 *  tab in `<AccountTabs />`. This hook supplies the two things such a view
 *  needs: the account list (for the tab strip, so it is fetched once rather
 *  than twice) and the `accountIds` predicate for `listMessagesPaged`.
 *
 *  Kept out of `utils/accounts.ts` so that module stays pure and unit-testable
 *  without a SolidJS reactive root or a database.
 */

import { createResource } from "solid-js";
import { listAccounts } from "../stores/data";
import { activeAccountId } from "../stores/ui";
import { resolveAccountFilter } from "./accounts";
import { useRefreshEffect, useSoftRefreshEffect } from "./gestures";
import type { Account } from "../types";
import type { ListMessagesOptions } from "../stores/data";

export interface AccountScope {
  /** Email + IM + calendar accounts. Empty until the resource resolves. */
  accounts: () => Account[];
  /** Spread into the paginated query options. `accountIds` is `undefined`
   *  in the merged view, which keeps the query on the unfiltered path. */
  scope: () => Pick<ListMessagesOptions, "accountIds">;
}

export function useAccountScope(): AccountScope {
  const [accounts, { refetch }] = createResource(listAccounts);

  // A mailbox added or removed in Settings (or a test fixture seeded after
  // the first query landed) must show up in the scope. `createResource`
  // never refetches on its own, so without these two the tab strip and the
  // account filter would stay stuck on whatever the first read saw.
  let firstHard = true;
  useRefreshEffect(() => {
    if (firstHard) {
      firstHard = false;
      return;
    }
    void refetch();
  });
  let firstSoft = true;
  useSoftRefreshEffect(() => {
    if (firstSoft) {
      firstSoft = false;
      return;
    }
    void refetch();
  });

  return {
    accounts: () => accounts() ?? [],
    scope: () => ({
      accountIds: resolveAccountFilter(accounts() ?? [], activeAccountId()),
    }),
  };
}
