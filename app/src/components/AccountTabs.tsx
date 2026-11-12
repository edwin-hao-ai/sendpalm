/** Account scope tabs — the "全部账户 / 工作邮箱 / Gmail" row above a mail
 *  list.
 *
 *  SendPalm merges every mailbox into one `messages` table, so the merged
 *  view is free and the switcher is the only thing that needs building. This
 *  component is the switcher, and it is deliberately dumb: it reads the
 *  global `activeAccountId` signal and writes back to it, so every mail view
 *  that mounts it shares one selection.
 *
 *  Hidden when there is a single mailbox — a one-item tab strip is noise, and
 *  `shouldShowAccountTabs` is the single place that rule lives.
 */

import { For, Show, createResource } from "solid-js";
import { Icon } from "./Icon";
import { countMessagesByAccount, listAccounts } from "../stores/data";
import {
  ALL_ACCOUNTS,
  accountTabLabel,
  emailAccounts,
  shouldShowAccountTabs,
} from "../utils/accounts";
import { activeAccountId, setActiveAccountId } from "../stores/ui";
import { useCountsRefreshEffect, useRefreshEffect, useSoftRefreshEffect } from "../utils/gestures";
import type { Account, MessageBucket } from "../types";

export interface AccountTabsProps {
  /** Which bucket's rows the badges count. */
  bucket: MessageBucket;
  /** Which rows the badge should describe. Defaults to every row in the
   *  bucket; the Imbox passes `unread` while its 未读 filter is on, so the
   *  badge agrees with the list under it. */
  mode?: "all" | "unread";
  /** Row count for the merged view. */
  total?: () => number;
  /** Account list from `useAccountScope()`. Passing it keeps the tab strip
   *  from issuing a second `listAccounts` for the same view. */
  accounts?: Account[];
  /** Override the global selection writer (tests, or a scoped view). */
  onChange?: (id: string) => void;
}

export function AccountTabs(props: AccountTabsProps) {
  // Only fetch when the caller did not hand the list over. `undefined` as
  // the resource source means "don't fetch", which is how the shared case
  // avoids a duplicate query.
  const [ownAccounts, { refetch: refetchAccounts }] = createResource(
    () => (props.accounts ? undefined : 1),
    async () => listAccounts(),
  );

  // Accounts are created in Settings, which can happen in another view —
  // re-pull on the same soft tick the badges use. Skip the first tick:
  // `createResource` already fetched on mount and a second round-trip for
  // an unchanged list is pure IPC traffic.
  const resolvedAccounts = () => props.accounts ?? ownAccounts() ?? [];

  let firstTick = true;
  useSoftRefreshEffect(() => {
    if (firstTick) {
      firstTick = false;
      return;
    }
    if (!props.accounts) void refetchAccounts();
  });
  let firstHardTick = true;
  useRefreshEffect(() => {
    if (firstHardTick) {
      firstHardTick = false;
      return;
    }
    if (!props.accounts) void refetchAccounts();
  });

  let firstCountsTick = true;
  useCountsRefreshEffect(() => {
    if (firstCountsTick) {
      firstCountsTick = false;
      return;
    }
    void refetchCounts();
  });

  const [counts, { refetch: refetchCounts }] = createResource(
    () => {
      const ids = emailAccounts(resolvedAccounts()).map((a) => a.id);
      if (ids.length === 0) return null;
      return { ids, mode: props.mode ?? "all", bucket: props.bucket };
    },
    async (args) => {
      if (!args) return {};
      return countMessagesByAccount(args.bucket, args.ids, {
        unreadOnly: args.mode === "unread",
      });
    },
  );

  let firstCountTick = true;
  useSoftRefreshEffect(() => {
    if (firstCountTick) {
      firstCountTick = false;
      return;
    }
    void refetchCounts();
  });

  const select = (id: string) => {
    if (props.onChange) props.onChange(id);
    else setActiveAccountId(id);
  };

  return (
    <Show when={shouldShowAccountTabs(resolvedAccounts())}>
      <div
        class="account-tabs"
        data-account-tabs
        role="tablist"
        aria-label="邮箱账户"
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
          /* Horizontal scroller on phones: five mailboxes must not push the
             list off screen, and wrapping to two rows costs more than it
             buys. */
          "overflow-x": "auto",
          "flex-wrap": "nowrap",
          padding: "0 var(--space-5) var(--space-2)",
          "scrollbar-width": "none",
        }}
      >
        <AccountPill
          label="全部账户"
          id={ALL_ACCOUNTS}
          active={activeAccountId() === ALL_ACCOUNTS}
          count={props.total?.()}
          onSelect={select}
        />
        <For each={emailAccounts(resolvedAccounts())}>
          {(a) => (
            <AccountPill
              label={accountTabLabel(a)}
              id={a.id}
              color={a.color}
              active={activeAccountId() === a.id}
              isolated={a.privacy === "isolated"}
              count={counts.latest?.[a.id]}
              onSelect={select}
            />
          )}
        </For>
      </div>
    </Show>
  );
}

function AccountPill(props: {
  id: string;
  label: string;
  active: boolean;
  count?: number;
  color?: string;
  isolated?: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={props.active}
      data-account-tab={props.id}
      onClick={() => props.onSelect(props.id)}
      title={
        props.isolated
          ? `${props.label} · 已隔离（不并入全部账户）`
          : props.label
      }
      style={{
        display: "inline-flex",
        "align-items": "center",
        gap: "var(--space-1)",
        // 32px visual pill, padded to stay a comfortable tap target.
        "min-height": "32px",
        padding: "6px 12px",
        "border-radius": "var(--radius-pill)",
        border: "0.5px solid",
        "border-color": props.active ? "transparent" : "var(--border)",
        background: props.active ? "var(--palm)" : "var(--paper-light)",
        color: props.active ? "#fff" : "var(--text-secondary)",
        "font-size": "var(--text-caption)",
        "font-weight": props.active ? "700" : "600",
        "white-space": "nowrap",
        cursor: "pointer",
        transition:
          "background var(--duration-fast) var(--ease-out), color var(--duration-fast) var(--ease-out)",
      }}
    >
      <Show when={props.color}>
        {(c) => (
          <span
            aria-hidden="true"
            style={{
              width: "8px",
              height: "8px",
              "border-radius": "50%",
              background: props.active ? "#fff" : c(),
              opacity: props.active ? 0.9 : 1,
              "flex-shrink": 0,
            }}
          />
        )}
      </Show>
      <Show when={props.isolated}>
        <Icon
          name="ph-lock-simple"
          size={11}
          style={{ opacity: props.active ? 0.9 : 0.7 }}
        />
      </Show>
      <span>{props.label}</span>
      <Show when={props.count !== undefined}>
        <span
          style={{
            opacity: props.active ? 0.85 : 0.65,
            "font-variant-numeric": "tabular-nums",
          }}
        >
          {props.count}
        </span>
      </Show>
    </button>
  );
}
