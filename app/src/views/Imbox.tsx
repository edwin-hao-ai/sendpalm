/** Imbox view — main workhorse. M1: bundles, splits, piles, keyboard nav.
 * Spec mirrors prototype-v11 §3.1 exactly.
 */

import {
  For,
  Show,
  createMemo,
  createResource,
  createSignal,
  createEffect,
  onCleanup,
} from "solid-js";
import { WindowVirtualizer } from "virtua/solid";
import {
  listContacts,
  listMessages,
  upsertMessage,
  moveMessageToBucket,
  listBundleConfigs,
  listAccounts,
  countGateCandidates,
} from "../stores/data";
import { usePaginatedMessages } from "../utils/paginated-messages";
import type { Contact, Message, BundleConfig } from "../types";
import {
  setDetailOpen,
  setSelectedMessageId,
  cursorIndex,
  setCursorIndex,
  selectedIds,
  setSelectedIds,
  setComposeOpen,
  setComposeContext,
  setView,
  showToast,
  gateCandidateCount,
  setGateCandidateCount,
  refreshTick,
} from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { Empty } from "../components/Empty";
import { SkeletonList } from "../components/Skeleton";

import { LabelPicker } from "../components/LabelPicker";
import { MovePicker } from "../components/MovePicker";
import { syncNow } from "../services/backend";
import { useRefreshEffect, useViewport } from "../utils/gestures";
import { priorityScore } from "../utils/priority";
import { SwipeActions } from "../components/SwipeActions";

interface Bundle {
  contactId: string;
  contact: Contact;
  messages: Message[];
}

type PileKey = "replyLater" | "setAside" | "remind";

export function Imbox() {
  const [contacts] = createResource(listContacts);
  const [bundles] = createResource(listBundleConfigs);
  const [allMessages, { refetch: refetchAll }] = createResource(listMessages);
  const { isMobile } = useViewport();

  // Main list is paginated — only the first 100 imbox rows render in memory
  // until the user scrolls; pile slices below need every message in DB to
  // filter by replyLater/setAside/bubbleUpAt flags, so a second resource
  // (unchanged from before) keeps them accurate without slowing down the
  // hot list path.
  const paged = usePaginatedMessages({
    bucket: "imbox",
    direction: "in",
  });
  const items = paged.items;
  const refresh = paged.refresh;

  useRefreshEffect(() => {
    void refresh();
    void refetchAll();
  });

  const loadMoreIfNearEnd = () => {
    if (!paged.hasMore() || paged.loadingMore()) return;
    void paged.loadMore();
  };

  /* ── Multi-select ── */
  const [lastSelectedId, setLastSelectedId] = createSignal<string | null>(null);
  const [bulkLabelOpen, setBulkLabelOpen] = createSignal(false);
  const [bulkMoveOpen, setBulkMoveOpen] = createSignal(false);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    setLastSelectedId(id);
  };

  const selectRange = (fromId: string, toId: string, ids: string[]) => {
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const start = Math.min(fromIdx, toIdx);
    const end = Math.max(fromIdx, toIdx);
    const next = new Set(selectedIds());
    for (let i = start; i <= end; i++) next.add(ids[i]!);
    setSelectedIds(next);
    setLastSelectedId(toId);
  };

  const clearSelection = () => {
    setSelectedIds(new Set<string>());
    setLastSelectedId(null);
  };

  const bundleSelectedState = (bundle: Bundle): "none" | "partial" | "all" => {
    const ids = bundle.messages.map((m) => m.id);
    const selectedCount = ids.filter((id) => selectedIds().has(id)).length;
    if (selectedCount === 0) return "none";
    if (selectedCount === ids.length) return "all";
    return "partial";
  };

  const toggleBundle = (bundle: Bundle) => {
    const state = bundleSelectedState(bundle);
    const next = new Set(selectedIds());
    for (const m of bundle.messages) {
      if (state === "all") next.delete(m.id);
      else next.add(m.id);
    }
    setSelectedIds(next);
    setLastSelectedId(bundle.contactId);
  };

  /* ── Derived ── */

  const contactMap = createMemo<Map<string, Contact>>(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts() ?? []) map.set(c.id, c);
    return map;
  });

  const imboxMsgs = createMemo<Message[]>(() => {
    const list = items()
      .filter((m) => m.bucket === "imbox")
      .filter((m) => !m.setAside && !m.replyLater)
      .filter((m) => {
        const c = contactMap().get(m.pid);
        // Gate contract: unscreened or blocked senders must not appear in Imbox.
        return c && c.screened && !c.blocked;
      });

    const unread = list
      .filter((m) => m.unread)
      .sort(
        (a, b) =>
          priorityScore(b, contactMap().get(b.pid)) -
          priorityScore(a, contactMap().get(a.pid)),
      );
    const read = list
      .filter((m) => !m.unread)
      .sort((a, b) => new Date(b.st).getTime() - new Date(a.st).getTime());

    return [...unread, ...read];
  });

  const bundlesEnabled = createMemo(() => {
    const cfg = new Map<string, BundleConfig>();
    for (const b of bundles() ?? []) cfg.set(b.contactId, b);
    return cfg;
  });

  /* Auto-detect bundles: senders with >= 3 unread in imbox. */
  const detectedBundleSenders = createMemo<Set<string>>(() => {
    const counts = new Map<string, number>();
    for (const m of imboxMsgs()) {
      if (!m.unread) continue;
      counts.set(m.pid, (counts.get(m.pid) ?? 0) + 1);
    }
    return new Set(
      [...counts.entries()].filter(([, c]) => c >= 3).map(([id]) => id),
    );
  });

  const renderList = createMemo<(Message | Bundle)[]>(() => {
    const out: (Message | Bundle)[] = [];
    const bundledIds = new Set<string>();

    // Auto-bundled: 3+ unread OR explicit bundle config
    const bundlesByContact = new Map<string, Message[]>();
    for (const m of imboxMsgs()) {
      const cfg = bundlesEnabled().get(m.pid);
      const enabled =
        cfg !== undefined ? cfg.enabled : detectedBundleSenders().has(m.pid);
      if (!enabled || !m.unread) continue;
      bundledIds.add(m.id);
      const arr = bundlesByContact.get(m.pid) ?? [];
      arr.push(m);
      bundlesByContact.set(m.pid, arr);
    }

    for (const [contactId, msgs] of bundlesByContact) {
      const c = contacts()?.find((x) => x.id === contactId);
      if (!c) continue;
      out.push({ contactId, contact: c, messages: msgs });
    }

    // Remaining unread (not bundled) — appear as individual rows.
    for (const m of imboxMsgs()) {
      if (!m.unread) continue;
      if (bundledIds.has(m.id)) continue;
      out.push(m);
    }
    return out;
  });

  const newForYou = createMemo<(Message | Bundle)[]>(() => renderList());
  const previouslySeen = createMemo<Message[]>(() =>
    imboxMsgs().filter((m) => !m.unread),
  );

  const selectableIds = createMemo(() => [
    ...newForYou().flatMap((x) =>
      "messages" in x ? x.messages.map((m) => m.id) : [x.id],
    ),
    ...previouslySeen().map((m) => m.id),
  ]);

  const replyLater = createMemo<Message[]>(() =>
    (allMessages() ?? []).filter((m) => m.replyLater),
  );
  const setAside = createMemo<Message[]>(() =>
    (allMessages() ?? []).filter((m) => m.setAside),
  );
  const reminded = createMemo<Message[]>(() =>
    (allMessages() ?? []).filter((m) => m.bubbleUpAt),
  );

  /* ── UI ── */

  const contactById = (id: string) => contacts()?.find((c) => c.id === id);

  const open = (id: string) => {
    setSelectedMessageId(id);
    setDetailOpen(true);
  };

  /* ── Keyboard nav ── */

  const flatIds = createMemo(() =>
    renderList().map((x) => ("messages" in x ? x.contactId : x.id)),
  );

  createEffect(() => {
    if (cursorIndex() >= flatIds().length) setCursorIndex(-1);
  });

  const moveCursor = (delta: number) => {
    const len = flatIds().length;
    if (len === 0) return;
    const cur = cursorIndex() < 0 ? 0 : cursorIndex();
    const next = (cur + delta + len) % len;
    setCursorIndex(next);
    const item = renderList()[next];
    if (item) {
      const id = "messages" in item ? item.messages[0]?.id : item.id;
      if (id) setSelectedMessageId(id);
    }
  };

  const handleKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    // Local cursor/select/open only; per-message shortcuts (a/l/z/e/t/u/b/v)
    // are handled by the global shortcut router so they stay editable.
    if (e.key === "j") {
      e.preventDefault();
      moveCursor(1);
    } else if (e.key === "k") {
      e.preventDefault();
      moveCursor(-1);
    } else if (e.key === "Enter") {
      const cur = cursorIndex();
      if (cur >= 0) {
        const item = renderList()[cur];
        if (item) {
          if ("messages" in item) {
            const first = item.messages[0];
            if (first) open(first.id);
          } else {
            open(item.id);
          }
        }
      }
    } else if (e.key === "x") {
      const cur = cursorIndex();
      const item = renderList()[cur];
      if (!item) return;
      if ("messages" in item) {
        toggleBundle(item);
      } else {
        toggleSelect(item.id);
      }
    } else if (e.key === "o" || e.key === "O") {
      e.preventDefault();
      setView("readTogether");
    }
  };

  document.addEventListener("keydown", handleKey);
  onCleanup(() => document.removeEventListener("keydown", handleKey));

  // Centralized refresh that keeps the paginated imbox list AND the pile
  // slices (which need every message to filter replyLater/setAside/bubbleUpAt)
  // in sync after an upsert/move. Both fire in parallel; the UI then
  // re-derives everything from the resources.
  const refreshAll = async () => {
    await Promise.all([refresh(), refetchAll()]);
  };

  const awaitReplyLater = async (m: Message) => {
    await upsertMessage({ ...m, replyLater: true });
    await refreshAll();
    showToast({ message: "已 Reply Later", kind: "success" });
  };

  const awaitSetAside = async (m: Message) => {
    await upsertMessage({ ...m, setAside: true });
    await refreshAll();
    showToast({ message: "已 Set Aside", kind: "success" });
  };

  return (
    <div
      style={{
        padding: "0",
        animation: "view-enter 0.3s var(--ease-out) both",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
          padding: "var(--space-4) var(--space-5) var(--space-2)",
        }}
      >
        <SectionHeader title="New for you" count={newForYou().length} />
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setView("readTogether")}
          title="Read Together"
          aria-label="Read Together"
          data-read-together
          style={{
            display: "inline-flex",
            "align-items": "center",
            gap: "4px",
            padding: "4px 10px",
            background: "var(--paper-light)",
            color: "var(--text-secondary)",
            "border-radius": "var(--radius-pill)",
            "font-size": "var(--text-micro)",
            "font-weight": "700",
            border: "0.5px solid var(--border)",
            cursor: "pointer",
          }}
        >
          <Icon name="ph-eye" size={12} /> 一起读
        </button>
        <button
          onClick={async () => {
            const list = (await listAccounts()) ?? [];
            const emailAccounts = list.filter((a) => a.type === "email");
            if (emailAccounts.length === 0) {
              showToast({
                message: "请先到 Settings → Accounts 添加邮箱账户",
                kind: "info",
              });
              return;
            }
            showToast({
              message: `正在从 IMAP 同步 ${emailAccounts.length} 个账户…`,
              kind: "info",
              ttlMs: 2000,
            });
            await Promise.all(emailAccounts.map((a) => syncNow(a.id, "INBOX")));
            await refreshAll();
            showToast({ message: "同步完成", kind: "success" });
          }}
          title="立即从 IMAP 同步所有账户"
          aria-label="同步所有账户"
          data-sync-now
          style={{
            display: "inline-flex",
            "align-items": "center",
            gap: "4px",
            padding: "4px 10px",
            background: "var(--palm-soft)",
            color: "var(--palm)",
            "border-radius": "var(--radius-pill)",
            "font-size": "var(--text-micro)",
            "font-weight": "700",
          }}
        >
          <Icon name="arrows-clockwise" size={12} /> 同步
        </button>
      </div>
      <Show
        when={paged.resource.state !== "pending"}
        fallback={
          <div
            style={{
              padding: "0 var(--space-5)",
              "max-width": "720px",
              margin: "var(--space-4) auto",
            }}
          >
            <SkeletonList count={8} />
          </div>
        }
      >
        <Show
          when={newForYou().length > 0 || previouslySeen().length > 0}
          fallback={<InboxEmptyState />}
        >
          <ul
            style={{
              "list-style": "none",
              margin: 0,
              padding: "0 var(--space-5)",
              "max-width": "720px",
              "margin-left": "auto",
              "margin-right": "auto",
            }}
          >
            <WindowVirtualizer
              data={newForYou()}
              onScrollEnd={loadMoreIfNearEnd}
            >
              {(item: Message | Bundle, i: () => number) => {
                const isBundle = "messages" in item;
                const cursorHere = () => cursorIndex() === i();
                const isSelected = () =>
                  !isBundle && selectedIds().has((item as Message).id);
                const rowContent = (
                  <div
                    data-message-id={
                      !isBundle ? (item as Message).id : undefined
                    }
                    onClick={() => {
                      setCursorIndex(i());
                      if (isBundle) {
                        const first = (item as Bundle).messages[0];
                        if (first) open(first.id);
                      } else {
                        open((item as Message).id);
                      }
                    }}
                    style={{
                      display: "flex",
                      gap: "var(--space-3)",
                      padding: "var(--space-3)",
                      "padding-left": cursorHere()
                        ? "calc(var(--space-3) - 2px)"
                        : "var(--space-3)",
                      cursor: "pointer",
                      position: "relative",
                      background: isSelected()
                        ? "var(--palm-soft)"
                        : cursorHere()
                          ? "var(--palm-soft)"
                          : "transparent",
                      "box-shadow": cursorHere()
                        ? "inset 2px 0 0 var(--palm)"
                        : "none",
                      transition:
                        "background var(--duration-fast) var(--ease-out), transform 0.18s var(--ease-out), box-shadow var(--duration-fast) var(--ease-out)",
                    }}
                    onMouseEnter={(e) => {
                      if (!cursorHere())
                        e.currentTarget.style.background =
                          "rgba(35,28,51,0.03)";
                    }}
                    onMouseLeave={(e) => {
                      if (!cursorHere())
                        e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Show when={!isBundle}>
                      <input
                        type="checkbox"
                        checked={selectedIds().has((item as Message).id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          const id = (item as Message).id;
                          if (e.shiftKey && lastSelectedId()) {
                            selectRange(lastSelectedId()!, id, selectableIds());
                          } else {
                            toggleSelect(id);
                          }
                        }}
                        style={{
                          width: "16px",
                          height: "16px",
                          "flex-shrink": 0,
                          "margin-top": "10px",
                          cursor: "pointer",
                          "accent-color": "var(--palm)",
                        }}
                      />
                    </Show>
                    <Show when={isBundle}>
                      <IndeterminateCheckbox
                        checked={() =>
                          bundleSelectedState(item as Bundle) === "all"
                        }
                        indeterminate={() =>
                          bundleSelectedState(item as Bundle) === "partial"
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleBundle(item as Bundle);
                        }}
                      />
                    </Show>
                    <div
                      style={{
                        "flex-shrink": 0,
                      }}
                    >
                      <Avatar
                        name={
                          isBundle
                            ? (item as Bundle).contact.name
                            : (contactById((item as Message).pid)?.name ?? "?")
                        }
                        src={
                          isBundle
                            ? (item as Bundle).contact.avatar
                            : contactById((item as Message).pid)?.avatar
                        }
                        size={36}
                      />
                    </div>
                    <div style={{ flex: 1, "min-width": 0 }}>
                      <Show
                        when={isBundle}
                        fallback={
                          <MessageSummary
                            m={item as Message}
                            contactName={
                              contactById((item as Message).pid)?.name ?? "?"
                            }
                          />
                        }
                      >
                        <BundleSummary bundle={item as Bundle} onOpen={open} />
                      </Show>
                    </div>
                    <Show when={!isBundle}>
                      <MessageActions
                        m={item as Message}
                        onReply={(m) => {
                          setComposeContext({ mode: "reply", originalMsg: m });
                          setComposeOpen(true);
                        }}
                        onChange={refreshAll}
                      />
                    </Show>
                  </div>
                );
                return (
                  <li
                    style={{
                      "list-style": "none",
                      animation:
                        i() < 12
                          ? `list-item-enter 0.34s var(--ease-out) both`
                          : undefined,
                      "animation-delay": i() < 12 ? `${i() * 28}ms` : undefined,
                    }}
                  >
                    <SwipeActions
                      role="listitem"
                      style={{
                        "border-bottom": "0.5px solid var(--border)",
                        "border-left": cursorHere()
                          ? "2px solid var(--palm)"
                          : "2px solid transparent",
                      }}
                      leftAction={
                        isBundle
                          ? undefined
                          : {
                              label: "Set Aside",
                              icon: "ph-push-pin",
                              color: "green",
                              onClick: () =>
                                void awaitSetAside(item as Message),
                            }
                      }
                      rightAction={
                        isBundle
                          ? undefined
                          : {
                              label: "Reply Later",
                              icon: "ph-clock",
                              color: "yellow",
                              onClick: () =>
                                void awaitReplyLater(item as Message),
                            }
                      }
                      disabled={isBundle || !isMobile()}
                    >
                      {rowContent}
                    </SwipeActions>
                  </li>
                );
              }}
            </WindowVirtualizer>
          </ul>
        </Show>

        <Show when={previouslySeen().length > 0}>
          <SectionHeader
            title="Previously seen"
            count={previouslySeen().length}
          />
          <ul
            style={{
              "list-style": "none",
              margin: 0,
              padding: "0 var(--space-5)",
              "max-width": "720px",
              "margin-left": "auto",
              "margin-right": "auto",
            }}
          >
            <For each={previouslySeen()}>
              {(m) => {
                const isSelected = () => selectedIds().has(m.id);
                const content = (
                  <div
                    data-message-id={m.id}
                    onClick={() => open(m.id)}
                    style={{
                      display: "flex",
                      gap: "var(--space-3)",
                      padding: "var(--space-3)",
                      cursor: "pointer",
                      opacity: 0.75,
                      background: isSelected()
                        ? "var(--palm-soft)"
                        : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected()}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (e.shiftKey && lastSelectedId()) {
                          selectRange(lastSelectedId()!, m.id, selectableIds());
                        } else {
                          toggleSelect(m.id);
                        }
                      }}
                      style={{
                        width: "16px",
                        height: "16px",
                        "flex-shrink": 0,
                        "margin-top": "10px",
                        cursor: "pointer",
                        "accent-color": "var(--palm)",
                      }}
                    />
                    <Avatar
                      name={contactById(m.pid)?.name ?? "?"}
                      src={contactById(m.pid)?.avatar}
                      size={36}
                    />
                    <div style={{ flex: 1, "min-width": 0 }}>
                      <MessageSummary
                        m={m}
                        contactName={contactById(m.pid)?.name ?? "?"}
                      />
                    </div>
                    <MessageActions
                      m={m}
                      onReply={(m) => {
                        setComposeContext({ mode: "reply", originalMsg: m });
                        setComposeOpen(true);
                      }}
                      onChange={refreshAll}
                    />
                  </div>
                );
                return (
                  <SwipeActions
                    role="listitem"
                    style={{ "border-bottom": "0.5px solid var(--border)" }}
                    leftAction={{
                      label: "Set Aside",
                      icon: "ph-push-pin",
                      color: "green",
                      onClick: () => void awaitSetAside(m),
                    }}
                    rightAction={{
                      label: "Reply Later",
                      icon: "ph-clock",
                      color: "yellow",
                      onClick: () => void awaitReplyLater(m),
                    }}
                    disabled={!isMobile()}
                  >
                    {content}
                  </SwipeActions>
                );
              }}
            </For>
          </ul>
        </Show>

        <Show
          when={replyLater().length + setAside().length + reminded().length > 0}
        >
          <SectionHeader title="Piles" />
          <InlinePiles
            replyLater={replyLater()}
            setAside={setAside()}
            reminded={reminded()}
            contactById={contactById}
            onOpen={open}
            onChange={async () => {
              await refreshAll();
            }}
          />
        </Show>

        <Show when={selectedIds().size > 0}>
          <BulkActionBar
            count={selectedIds().size}
            onClear={clearSelection}
            onArchive={async () => {
              const ids = selectedIds();
              for (const id of ids) {
                await moveMessageToBucket(id, "paperTrail");
              }
              clearSelection();
              await refreshAll();
              showToast({ message: "已批量归档", kind: "success" });
            }}
            onTrash={async () => {
              const ids = selectedIds();
              for (const id of ids) {
                await moveMessageToBucket(id, "trash");
              }
              clearSelection();
              await refreshAll();
              showToast({ message: "已批量移到 Trash", kind: "info" });
            }}
            onSpam={async () => {
              const ids = selectedIds();
              for (const id of ids) {
                await moveMessageToBucket(id, "spam");
              }
              clearSelection();
              await refreshAll();
              showToast({ message: "已批量移到 Spam", kind: "info" });
            }}
            onLabel={() => setBulkLabelOpen(true)}
            onMove={() => setBulkMoveOpen(true)}
          />

          <LabelPicker
            open={bulkLabelOpen()}
            onClose={() => setBulkLabelOpen(false)}
            messageIds={Array.from(selectedIds())}
            onChange={async () => {
              clearSelection();
              await refreshAll();
            }}
          />
          <MovePicker
            open={bulkMoveOpen()}
            onClose={() => setBulkMoveOpen(false)}
            messageIds={Array.from(selectedIds())}
            onChange={async () => {
              clearSelection();
              await refreshAll();
            }}
          />
        </Show>

        <FocusAndReplyButton onClick={() => setView("focusReply")} />
      </Show>
    </div>
  );
}

function SectionHeader(props: { title: string; count?: number }) {
  return (
    <div
      style={{
        display: "flex",
        "align-items": "baseline",
        gap: "var(--space-2)",
        padding: "var(--space-4) var(--space-5) var(--space-2)",
        "font-family": "var(--font-display)",
        "font-size": "var(--text-h4)",
        "font-weight": "800",
        color: "var(--text-primary)",
      }}
    >
      {props.title}
      {props.count !== undefined && (
        <span
          style={{
            "font-family": "var(--font-body)",
            "font-size": "var(--text-caption)",
            color: "var(--text-muted)",
            "font-weight": "500",
          }}
        >
          {props.count}
        </span>
      )}
    </div>
  );
}

function MessageSummary(props: { m: Message; contactName: string }) {
  const { isMobile } = useViewport();
  const displayDate = () => {
    if (!isMobile()) return props.m.tm;
    // On mobile, keep the time portion only to leave room for the sender name.
    const parts = props.m.tm.split(" ");
    return parts.length === 2 ? parts[1] : props.m.tm;
  };
  return (
    <>
      <div
        style={{
          display: "flex",
          "align-items": "baseline",
          gap: "var(--space-2)",
        }}
      >
        <strong
          style={{
            "font-weight": props.m.unread ? "700" : "500",
            "white-space": "nowrap",
            overflow: "hidden",
            "text-overflow": "ellipsis",
          }}
        >
          {props.contactName}
        </strong>
        <span
          style={{
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
            "margin-left": "auto",
            "white-space": "nowrap",
          }}
        >
          {displayDate()}
        </span>
      </div>
      <div
        style={{
          "font-size": "var(--text-body-sm)",
          color: props.m.unread
            ? "var(--text-primary)"
            : "var(--text-secondary)",
          "white-space": "nowrap",
          overflow: "hidden",
          "text-overflow": "ellipsis",
          "margin-top": "2px",
        }}
      >
        <span
          style={{
            "font-family": "var(--font-display)",
            "font-weight": props.m.unread ? "650" : "500",
            "letter-spacing": props.m.unread ? "-0.012em" : "-0.005em",
            color: props.m.unread
              ? "var(--text-primary)"
              : "var(--text-secondary)",
          }}
        >
          {props.m.subj}
        </span>
        <span style={{ color: "var(--text-muted)", "margin-left": "6px" }}>
          — {props.m.prev}
        </span>
      </div>
    </>
  );
}

function BundleSummary(props: {
  bundle: Bundle;
  onOpen: (id: string) => void;
}) {
  const [expanded, setExpanded] = createSignal(false);
  const last = () => props.bundle.messages[0];
  return (
    <>
      <div
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded());
        }}
        style={{
          display: "flex",
          "align-items": "baseline",
          gap: "var(--space-2)",
          cursor: "pointer",
        }}
      >
        <strong style={{ "font-weight": "700" }}>
          {props.bundle.contact.name}
        </strong>
        <span
          style={{
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
            "font-weight": "600",
          }}
        >
          · {props.bundle.messages.length} 封未读
        </span>
        <span
          style={{
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
            "margin-left": "auto",
            "white-space": "nowrap",
          }}
        >
          {last()?.tm}
        </span>
      </div>
      <div
        style={{
          "font-size": "var(--text-body-sm)",
          color: "var(--text-secondary)",
          "white-space": "nowrap",
          overflow: "hidden",
          "text-overflow": "ellipsis",
          "margin-top": "2px",
        }}
      >
        <span
          style={{
            "font-family": "var(--font-display)",
            "font-weight": "650",
            "letter-spacing": "-0.012em",
            color: "var(--text-primary)",
          }}
        >
          {last()?.subj}
        </span>
        <span style={{ color: "var(--text-muted)", "margin-left": "6px" }}>
          — {last()?.prev}
        </span>
      </div>
      <Show when={expanded()}>
        <div
          style={{
            "margin-top": "var(--space-3)",
            "padding-top": "var(--space-3)",
            "border-top": "0.5px dashed var(--border)",
            animation: "list-item-enter 0.3s var(--ease-out) both",
          }}
        >
          <For each={props.bundle.messages}>
            {(m) => (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  props.onOpen(m.id);
                }}
                style={{
                  display: "block",
                  width: "100%",
                  "text-align": "left",
                  padding: "4px 0",
                  color: "var(--text-secondary)",
                  "font-size": "var(--text-caption)",
                }}
              >
                <Icon name="ph-envelope-simple" size={12} /> {m.subj}
              </button>
            )}
          </For>
        </div>
      </Show>
    </>
  );
}

function InlinePiles(props: {
  replyLater: Message[];
  setAside: Message[];
  reminded: Message[];
  contactById: (id: string) => Contact | undefined;
  onOpen: (id: string) => void | Promise<void>;
  onChange: () => Promise<void>;
}) {
  const { isMobile } = useViewport();
  const [expanded, setExpanded] = createSignal<PileKey | null>(null);

  const piles: {
    key: PileKey;
    label: string;
    icon: string;
    items: Message[];
  }[] = [
    {
      key: "replyLater",
      label: "Reply Later",
      icon: "ph-clock",
      items: props.replyLater,
    },
    {
      key: "setAside",
      label: "Set Aside",
      icon: "ph-push-pin",
      items: props.setAside,
    },
    {
      key: "remind",
      label: "Remind",
      icon: "ph-arrow-fat-line-up",
      items: props.reminded,
    },
  ];

  const clearFlag = async (m: Message, key: PileKey) => {
    await upsertMessage({
      ...m,
      replyLater: key === "replyLater" ? false : m.replyLater,
      setAside: key === "setAside" ? false : m.setAside,
      bubbleUpAt: key === "remind" ? null : m.bubbleUpAt,
    });
    await props.onChange();
  };

  return (
    <div
      data-testid="piles"
      style={{
        display: "grid",
        "grid-template-columns": isMobile() ? "1fr" : "repeat(3, 1fr)",
        gap: "var(--space-3)",
        padding: "var(--space-4) var(--space-5)",
        "max-width": "720px",
        margin: "0 auto",
      }}
    >
      <For each={piles}>
        {(pile) => {
          const isOpen = () => expanded() === pile.key;
          return (
            <div
              data-pile={pile.key}
              style={{
                background: "var(--paper-light)",
                border: "0.5px solid var(--border)",
                "border-radius": "var(--radius-lg)",
                overflow: "hidden",
                "box-shadow": isOpen()
                  ? "var(--shadow-md)"
                  : "var(--shadow-sm)",
                transition: "box-shadow var(--duration-fast) var(--ease-out)",
              }}
            >
              <button
                onClick={() => setExpanded(isOpen() ? null : pile.key)}
                data-testid={`pile-${pile.key}`}
                style={{
                  width: "100%",
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--space-2)",
                  padding: "var(--space-3) var(--space-4)",
                  background: isOpen() ? "var(--paper-mid)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  "text-align": "left",
                }}
              >
                <Icon name={pile.icon} size={18} color="var(--text-muted)" />
                <span
                  style={{
                    flex: 1,
                    "font-weight": "700",
                    "font-size": "var(--text-body-sm)",
                    color: "var(--text-primary)",
                  }}
                >
                  {pile.label}
                </span>
                <span
                  style={{
                    padding: "2px 8px",
                    background: "var(--paper-mid)",
                    "border-radius": "var(--radius-pill)",
                    "font-size": "10px",
                    "font-weight": "700",
                    color: "var(--text-muted)",
                  }}
                >
                  {pile.items.length}
                </span>
                <Icon
                  name={isOpen() ? "ph-caret-up" : "ph-caret-down"}
                  size={12}
                  color="var(--text-muted)"
                />
              </button>
              <Show when={isOpen()}>
                <div
                  style={{
                    padding: "0 var(--space-3) var(--space-3)",
                    animation: "list-item-enter 0.25s var(--ease-out) both",
                  }}
                >
                  <For each={pile.items.slice(0, 5)}>
                    {(m, i) => (
                      <InlinePileRow
                        m={m}
                        contact={props.contactById(m.pid)}
                        index={i()}
                        pileKey={pile.key}
                        onOpen={() => props.onOpen(m.id)}
                        onClear={() => clearFlag(m, pile.key)}
                      />
                    )}
                  </For>
                  <Show when={pile.items.length > 5}>
                    <div
                      style={{
                        padding: "var(--space-2) 0",
                        "text-align": "center",
                        "font-size": "var(--text-caption)",
                        color: "var(--text-muted)",
                      }}
                    >
                      +{pile.items.length - 5} more
                    </div>
                  </Show>
                  <div
                    style={{
                      display: "flex",
                      gap: "var(--space-2)",
                      "margin-top": "var(--space-2)",
                    }}
                  >
                    <Show when={pile.key === "replyLater"}>
                      <button
                        onClick={() => setView("focusReply")}
                        style={{
                          flex: 1,
                          padding: "6px 10px",
                          background: "var(--agent-soft)",
                          color: "var(--agent)",
                          "border-radius": "var(--radius-pill)",
                          "font-size": "10px",
                          "font-weight": "700",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        <Icon name="ph-target" size={10} /> Focus & Reply
                      </button>
                    </Show>
                    <button
                      onClick={async () => {
                        for (const m of pile.items) {
                          await clearFlag(m, pile.key);
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: "6px 10px",
                        background: "var(--paper-mid)",
                        color: "var(--text-secondary)",
                        "border-radius": "var(--radius-pill)",
                        "font-size": "10px",
                        "font-weight": "700",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      Clear all
                    </button>
                  </div>
                </div>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}

function InlinePileRow(props: {
  m: Message;
  contact?: Contact;
  index: number;
  pileKey: PileKey;
  onOpen: () => void | Promise<void>;
  onClear: () => Promise<void>;
}) {
  return (
    <div
      data-pile-item={props.m.id}
      style={{
        display: "flex",
        gap: "var(--space-2)",
        padding: "var(--space-2) 0",
        "border-bottom": "0.5px solid var(--border)",
        "align-items": "center",
        animation: "list-item-enter 0.25s var(--ease-out) both",
        "animation-delay": `${props.index * 40}ms`,
      }}
    >
      <Avatar
        name={props.contact?.name ?? "?"}
        src={props.contact?.avatar}
        size={28}
      />
      <div
        style={{ flex: 1, "min-width": 0, cursor: "pointer" }}
        onClick={() => props.onOpen()}
      >
        <div
          style={{
            "font-size": "var(--text-caption)",
            "font-weight": "600",
            color: "var(--text-primary)",
            "white-space": "nowrap",
            overflow: "hidden",
            "text-overflow": "ellipsis",
          }}
        >
          {props.m.subj}
        </div>
        <div
          style={{
            "font-size": "10px",
            color: "var(--text-secondary)",
            "white-space": "nowrap",
            overflow: "hidden",
            "text-overflow": "ellipsis",
          }}
        >
          {props.contact?.name ?? "?"} · {props.m.tm}
        </div>
        <Show when={props.m.bubbleUpAt && props.pileKey === "remind"}>
          <div
            style={{
              "font-size": "10px",
              color: "var(--blurple)",
            }}
          >
            回浮于 {new Date(props.m.bubbleUpAt!).toLocaleString()}
          </div>
        </Show>
      </div>
      <button
        onClick={() => props.onClear()}
        title="从 pile 移除"
        aria-label="Remove from pile"
        style={{
          padding: "4px 8px",
          background: "transparent",
          color: "var(--text-muted)",
          "border-radius": "var(--radius-pill)",
          "font-size": "10px",
          border: "none",
          cursor: "pointer",
        }}
      >
        <Icon name="ph-x" size={12} />
      </button>
    </div>
  );
}

function MessageActions(props: {
  m: Message;
  onReply: (m: Message) => void;
  onChange: () => void;
}) {
  const { isMobile } = useViewport();
  const [moreOpen, setMoreOpen] = createSignal(false);
  const [wrapRef, setWrapRef] = createSignal<HTMLDivElement | undefined>(
    undefined,
  );
  const [labelOpen, setLabelOpen] = createSignal(false);
  const [moveOpen, setMoveOpen] = createSignal(false);

  const onDocClick = (e: MouseEvent) => {
    const el = wrapRef();
    if (!el) return;
    if (!el.contains(e.target as Node)) setMoreOpen(false);
  };
  document.addEventListener("click", onDocClick);
  onCleanup(() => document.removeEventListener("click", onDocClick));

  const run = async (fn: () => Promise<void>) => {
    await fn();
    props.onChange();
  };

  const replyLater = async (m: Message) => {
    await upsertMessage({ ...m, replyLater: true });
  };
  const setAside = async (m: Message) => {
    await upsertMessage({ ...m, setAside: true });
  };
  const bubbleUp = async (m: Message) => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    t.setHours(9, 0, 0, 0);
    await upsertMessage({ ...m, bubbleUpAt: t.toISOString() });
  };
  const archive = async (m: Message) => {
    await moveMessageToBucket(m.id, "paperTrail");
  };
  const trash = async (m: Message) => {
    await moveMessageToBucket(m.id, "trash");
  };
  const spam = async (m: Message) => {
    await moveMessageToBucket(m.id, "spam");
  };
  const toggleUnread = async (m: Message) => {
    await upsertMessage({ ...m, unread: !m.unread });
  };

  const showUndoToast = (message: string, undo: () => Promise<void>) => {
    showToast({
      message,
      kind: "success",
      action: {
        label: "撤销",
        run: async () => {
          await undo();
          props.onChange();
          showToast({ message: "已撤销", kind: "success" });
        },
      },
    });
  };

  const iconBtn = (
    title: string,
    icon: string,
    onClick: (e: MouseEvent) => void,
  ) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      title={title}
      aria-label={title}
      style={{
        "align-self": "center",
        color: "var(--text-muted)",
        padding: "6px",
        "border-radius": "var(--radius-pill)",
        "flex-shrink": 0,
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.background = "var(--paper-mid)")
      }
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Icon name={icon} size={16} />
    </button>
  );

  const moreItems = () => [
    {
      label: "Reply",
      icon: "ph-arrow-u-up-left",
      action: () => {
        props.onReply(props.m);
        props.onChange();
      },
    },
    {
      label: "Reply later",
      icon: "ph-clock",
      action: () =>
        run(async () => {
          const m = props.m;
          await replyLater(m);
          showUndoToast("已 Reply Later", async () => {
            await upsertMessage({ ...m, replyLater: false });
          });
        }),
    },
    {
      label: "Set aside",
      icon: "ph-push-pin",
      action: () =>
        run(async () => {
          const m = props.m;
          await setAside(m);
          showUndoToast("已 Set Aside", async () => {
            await upsertMessage({ ...m, setAside: false });
          });
        }),
    },
    {
      label: "Bubble up",
      icon: "ph-arrow-fat-line-up",
      action: () =>
        run(async () => {
          const m = props.m;
          const previous = m.bubbleUpAt;
          await bubbleUp(m);
          showUndoToast("已 Bubble Up 到明天 9:00", async () => {
            await upsertMessage({ ...m, bubbleUpAt: previous });
          });
        }),
    },
    {
      label: "Archive",
      icon: "ph-tray",
      action: () =>
        run(async () => {
          const m = props.m;
          const previousBucket = m.bucket;
          await archive(m);
          showUndoToast("已归档到 Records", async () => {
            await moveMessageToBucket(m.id, previousBucket);
          });
        }),
    },
    {
      label: "Trash",
      icon: "ph-trash",
      action: () =>
        run(async () => {
          const m = props.m;
          const previousBucket = m.bucket;
          await trash(m);
          showUndoToast("已移到 Trash", async () => {
            await moveMessageToBucket(m.id, previousBucket);
          });
        }),
    },
    {
      label: props.m.unread ? "Mark read" : "Mark unread",
      icon: "ph-envelope",
      action: () =>
        run(async () => {
          await toggleUnread(props.m);
          showToast({
            message: props.m.unread ? "已标为已读" : "已标为未读",
            kind: "success",
          });
        }),
    },
    {
      label: "Forward",
      icon: "ph-arrow-u-up-right",
      action: () => {
        setComposeContext({
          mode: "forward",
          originalMsg: props.m,
        });
        setComposeOpen(true);
      },
    },
    {
      label: "Label",
      icon: "ph-tag",
      action: () => setLabelOpen(true),
    },
    {
      label: "Move",
      icon: "ph-folder",
      action: () => setMoveOpen(true),
    },
    {
      label: "Spam",
      icon: "ph-warning-circle",
      action: () =>
        run(async () => {
          const m = props.m;
          const previousBucket = m.bucket;
          await spam(m);
          showUndoToast("已移到 Spam", async () => {
            await moveMessageToBucket(m.id, previousBucket);
          });
        }),
    },
  ];

  return (
    <div
      ref={setWrapRef}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "2px",
        position: "relative",
        "flex-shrink": 0,
      }}
    >
      {isMobile() ? (
        iconBtn("More", "ph-dots-three", () => setMoreOpen(true))
      ) : (
        <>
          {iconBtn("Reply", "ph-arrow-u-up-left", () => {
            props.onReply(props.m);
            props.onChange();
          })}
          {iconBtn("Reply later", "ph-clock", () =>
            run(async () => {
              const m = props.m;
              await replyLater(m);
              showUndoToast("已 Reply Later", async () => {
                await upsertMessage({ ...m, replyLater: false });
              });
            }),
          )}
          {iconBtn("Set aside", "ph-push-pin", () =>
            run(async () => {
              const m = props.m;
              await setAside(m);
              showUndoToast("已 Set Aside", async () => {
                await upsertMessage({ ...m, setAside: false });
              });
            }),
          )}
          {iconBtn("Bubble up", "ph-arrow-fat-line-up", () =>
            run(async () => {
              const m = props.m;
              const previous = m.bubbleUpAt;
              await bubbleUp(m);
              showUndoToast("已 Bubble Up 到明天 9:00", async () => {
                await upsertMessage({ ...m, bubbleUpAt: previous });
              });
            }),
          )}
          {iconBtn("Archive", "ph-tray", () =>
            run(async () => {
              const m = props.m;
              const previousBucket = m.bucket;
              await archive(m);
              showUndoToast("已归档到 Records", async () => {
                await moveMessageToBucket(m.id, previousBucket);
              });
            }),
          )}
          {iconBtn("Trash", "ph-trash", () =>
            run(async () => {
              const m = props.m;
              const previousBucket = m.bucket;
              await trash(m);
              showUndoToast("已移到 Trash", async () => {
                await moveMessageToBucket(m.id, previousBucket);
              });
            }),
          )}
          <div style={{ position: "relative" }}>
            {iconBtn("More", "ph-dots-three", () => setMoreOpen(true))}
          </div>
        </>
      )}

      <Show when={moreOpen()}>
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            "z-index": 20,
            "background-color": "var(--paper-light)",
            border: "0.5px solid var(--border-strong)",
            "border-radius": "var(--radius-md)",
            "box-shadow": "var(--shadow-lg)",
            "min-width": "160px",
            padding: "4px",
          }}
        >
          <For each={moreItems()}>
            {(item) => (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  item.action();
                  setMoreOpen(false);
                }}
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--space-2)",
                  width: "100%",
                  padding: "8px 10px",
                  "text-align": "left",
                  "font-size": "var(--text-caption)",
                  color: "var(--text-secondary)",
                  "border-radius": "var(--radius-sm)",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--paper-mid)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                <Icon name={item.icon} size={14} />
                {item.label}
              </button>
            )}
          </For>
        </div>
      </Show>

      <LabelPicker
        open={labelOpen()}
        onClose={() => setLabelOpen(false)}
        messageIds={[props.m.id]}
        onChange={props.onChange}
      />
      <MovePicker
        open={moveOpen()}
        onClose={() => setMoveOpen(false)}
        messageIds={[props.m.id]}
        onChange={props.onChange}
      />
    </div>
  );
}

function BulkActionBar(props: {
  count: number;
  onClear: () => void;
  onArchive: () => Promise<void> | void;
  onTrash: () => Promise<void> | void;
  onSpam: () => Promise<void> | void;
  onLabel: () => void;
  onMove: () => void;
}) {
  const btn = (
    icon: string,
    label: string,
    onClick: () => Promise<void> | void,
  ) => (
    <button
      onClick={() => void onClick()}
      style={{
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        gap: "2px",
        padding: "8px 10px",
        "border-radius": "var(--radius-md)",
        color: "var(--text-secondary)",
        background: "var(--paper-light)",
        "font-size": "10px",
        "font-weight": "600",
        border: "0.5px solid var(--border)",
        cursor: "pointer",
      }}
    >
      <Icon name={icon} size={18} />
      <span>{label}</span>
    </button>
  );

  const { isMobile } = useViewport();

  return (
    <div
      style={{
        position: "fixed",
        bottom: isMobile()
          ? "calc(var(--bottom-tab-height) + env(safe-area-inset-bottom) + var(--space-4))"
          : "var(--space-4)",
        left: "50%",
        transform: "translateX(-50%)",
        "z-index": 30,
        display: "flex",
        "align-items": "center",
        gap: "var(--space-2)",
        padding: "var(--space-2) var(--space-3)",
        background: "var(--paper-light)",
        border: "0.5px solid var(--border-strong)",
        "border-radius": "var(--radius-xl)",
        "box-shadow": "var(--shadow-xl)",
      }}
    >
      <span
        style={{
          "font-size": "var(--text-caption)",
          "font-weight": "700",
          padding: "0 var(--space-2)",
          color: "var(--text-primary)",
        }}
      >
        已选 {props.count}
      </span>
      {btn("ph-archive", "Archive", props.onArchive)}
      {btn("ph-trash", "Trash", props.onTrash)}
      {btn("ph-warning-circle", "Spam", props.onSpam)}
      {btn("ph-tag", "Label", props.onLabel)}
      {btn("ph-folder", "Move", props.onMove)}
      <button
        onClick={props.onClear}
        style={{
          padding: "8px 10px",
          color: "var(--text-muted)",
          "font-size": "10px",
          "font-weight": "600",
        }}
      >
        清除
      </button>
    </div>
  );
}

function InboxEmptyState() {
  const [accounts] = createResource(listAccounts);
  const [gate, { refetch: refetchGate }] = createResource(countGateCandidates);

  // Re-fetch the unscreened count on every backend sync event so the copy
  // stays accurate as new senders arrive via IMAP. We mirror the latest
  // resource value into the `gateCandidateCount` UI signal so other surfaces
  // (topbar Gate badge, sidebar counter) can subscribe to a single source
  // instead of each spinning up its own resource.
  createEffect(() => {
    refreshTick();
    void refetchGate();
  });
  createEffect(() => {
    const v = gate();
    if (v !== undefined) setGateCandidateCount(v);
  });

  const emailAccountCount = createMemo(
    () => (accounts() ?? []).filter((a) => a.type === "email").length,
  );
  const unscreened = createMemo(() => gateCandidateCount());

  return (
    <Show when={emailAccountCount() === 0} fallback={
      <Show when={unscreened() > 0} fallback={
        <Empty
          icon="ph-tray"
          title="Inbox 是空的"
          description="新邮件到达时会自动显示在此处。试着给自己发一封测试邮件吧。"
        />
      }>
        <Empty
          icon="ph-shield-check"
          title={`${unscreened()} 个发件人待 Gate 筛选`}
          description="这些发件人的邮件会先沉淀在 Gate，直到你决定是收进 Inbox 还是 Block。"
          action={{
            label: "打开 Gate",
            onClick: () => setView("screener"),
          }}
        />
      </Show>
    }>
      <Empty
        icon="ph-tray"
        title="Inbox 是空的"
        description="请到 Settings → Accounts → Add account 接入真实邮箱。背景同步会从 IMAP 拉取最近的邮件。"
        action={{ label: "打开 Settings", onClick: () => setView("settings") }}
      />
    </Show>
  );
}

function IndeterminateCheckbox(props: {
  checked: () => boolean;
  indeterminate: () => boolean;
  onClick: (e: MouseEvent) => void;
}) {
  let ref: HTMLInputElement | undefined;
  createEffect(() => {
    if (ref) ref.indeterminate = props.indeterminate();
  });
  return (
    <input
      ref={(el) => (ref = el)}
      type="checkbox"
      checked={props.checked()}
      onClick={props.onClick}
      style={{
        width: "16px",
        height: "16px",
        "flex-shrink": 0,
        "margin-top": "10px",
        cursor: "pointer",
        "accent-color": "var(--palm)",
      }}
    />
  );
}

function FocusAndReplyButton(props: { onClick: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        "justify-content": "center",
        padding: "var(--space-4)",
      }}
    >
      <button
        onClick={props.onClick}
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
          padding: "10px 20px",
          background: "var(--paper-light)",
          "border-radius": "var(--radius-pill)",
          border: "0.5px solid var(--border-strong)",
          "font-size": "var(--text-caption)",
          "font-weight": "700",
          color: "var(--text-secondary)",
          cursor: "pointer",
        }}
      >
        <Icon name="ph-crosshair" size={14} />
        Focus & Reply
      </button>
    </div>
  );
}
