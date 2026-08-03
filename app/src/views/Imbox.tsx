/** Imbox view — main workhorse. M1: bundles, splits, piles, keyboard nav.
 * Spec mirrors prototype-v11 §3.1 exactly.
 */

import { For, Show, createMemo, createResource, createSignal, createEffect } from "solid-js";
import { listMessages, listContacts, upsertMessage, listBundleConfigs, listAccounts } from "../stores/data";
import type { Contact, Message, BundleConfig } from "../types";
import {
  setDetailOpen,
  setSelectedMessageId,
  cursorIndex,
  setCursorIndex,
  selectedIds,
  setSelectedIds,
  setComposeOpen,
  setView,
  showToast,
} from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { Empty } from "../components/Empty";
import { Modal } from "../components/Modal";
import { syncNow } from "../services/backend";

interface Bundle {
  contactId: string;
  contact: Contact;
  messages: Message[];
}

type PileKey = "replyLater" | "setAside" | "remind";

export function Imbox() {
  const [contacts] = createResource(listContacts);
  const [messages, { refetch: refetchMessages }] = createResource(listMessages);
  const [bundles] = createResource(listBundleConfigs);

  /* ── Derived ── */

  const imboxMsgs = createMemo<Message[]>(() => {
    return (messages() ?? [])
      .filter((m) => m.bucket === "imbox")
      .filter((m) => !m.setAside && !m.replyLater)
      .sort((a, b) => new Date(b.st).getTime() - new Date(a.st).getTime());
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
    return new Set([...counts.entries()].filter(([, c]) => c >= 3).map(([id]) => id));
  });

  const renderList = createMemo<(Message | Bundle)[]>(() => {
    const out: (Message | Bundle)[] = [];
    const bundledIds = new Set<string>();

    // Auto-bundled: 3+ unread OR explicit bundle config
    const bundlesByContact = new Map<string, Message[]>();
    for (const m of imboxMsgs()) {
      const cfg = bundlesEnabled().get(m.pid);
      const enabled =
        cfg !== undefined
          ? cfg.enabled
          : detectedBundleSenders().has(m.pid);
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
  const previouslySeen = createMemo<Message[]>(() => imboxMsgs().filter((m) => !m.unread));

  const replyLater = createMemo<Message[]>(() => (messages() ?? []).filter((m) => m.replyLater));
  const setAside = createMemo<Message[]>(() => (messages() ?? []).filter((m) => m.setAside));
  const reminded = createMemo<Message[]>(() => (messages() ?? []).filter((m) => m.bubbleUpAt));

  const [pileOpen, setPileOpen] = createSignal<PileKey | null>(null);
  const pileItems = createMemo<Message[]>(() => {
    const which = pileOpen();
    if (which === "replyLater") return replyLater();
    if (which === "setAside") return setAside();
    if (which === "remind") return reminded();
    return [];
  });
  const pileTitle = createMemo(() => {
    const which = pileOpen();
    if (which === "replyLater") return "Reply Later";
    if (which === "setAside") return "Set Aside";
    if (which === "remind") return "Remind";
    return "";
  });

  /* ── UI ── */

  const contactById = (id: string) => contacts()?.find((c) => c.id === id);

  const open = (id: string) => {
    setSelectedMessageId(id);
    setDetailOpen(true);
  };

  const reply = (m: Message) => {
    setComposeOpen(true);
    showToast({ message: `Reply to ${contactById(m.pid)?.name ?? m.pid}`, kind: "info" });
  };

  const markUnread = async (m: Message) => {
    await upsertMessage({ ...m, unread: true });
    await refetchMessages();
  };

  /* ── Keyboard nav ── */

  const flatIds = createMemo(() =>
    renderList().map((x) => ("messages" in x ? x.contactId : x.id))
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
    if (e.key === "j") { e.preventDefault(); moveCursor(1); }
    else if (e.key === "k") { e.preventDefault(); moveCursor(-1); }
    else if (e.key === "Enter") {
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
    }
    else if (e.key === "x") {
      const cur = cursorIndex();
      const id = flatIds()[cur];
      if (!id) return;
      const sel = new Set(selectedIds());
      if (sel.has(id)) sel.delete(id);
      else sel.add(id);
      setSelectedIds(sel);
    }
    else if (e.key === "l") {
      const cur = cursorIndex();
      const item = renderList()[cur];
      if (!item) return;
      const m = "messages" in item ? item.messages[0] : item;
      if (m) {
        awaitReplyLater(m);
      }
    }
  };

  document.addEventListener("keydown", handleKey);

  const awaitReplyLater = async (m: Message) => {
    await upsertMessage({ ...m, replyLater: true });
    await refetchMessages();
    showToast({ message: "已 Reply Later", kind: "success" });
  };

  return (
    <div style={{ padding: "0", animation: "view-enter 0.3s var(--ease-out) both" }}>
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
          onClick={async () => {
            const list = (await listAccounts()) ?? [];
            const emailAccounts = list.filter((a) => a.type === "email");
            if (emailAccounts.length === 0) {
              showToast({ message: "请先到 Settings → Accounts 添加邮箱账户", kind: "info" });
              return;
            }
            showToast({ message: `正在从 IMAP 同步 ${emailAccounts.length} 个账户…`, kind: "info", ttlMs: 2000 });
            await Promise.all(
              emailAccounts.map((a) => syncNow(a.id, "INBOX")),
            );
            await refetchMessages();
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
      <Show when={newForYou().length > 0} fallback={<InboxZero />}>
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
          <For each={newForYou()}>
            {(item, i) => {
              const isBundle = "messages" in item;
              const cursorHere = () => cursorIndex() === i();
              return (
                <li
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
                    "padding-left": cursorHere() ? "calc(var(--space-3) - 2px)" : "var(--space-3)",
                    "border-bottom": "0.5px solid var(--border)",
                    "border-left": cursorHere() ? "2px solid var(--palm)" : "2px solid transparent",
                    cursor: "pointer",
                    position: "relative",
                    background: cursorHere() ? "var(--palm-soft)" : "transparent",
                    "box-shadow": cursorHere() ? "inset 2px 0 0 var(--palm)" : "none",
                    transition: "background var(--duration-fast) var(--ease-out), transform 0.18s var(--ease-out), box-shadow var(--duration-fast) var(--ease-out)",
                    animation: i() < 12
                      ? `list-item-enter 0.34s var(--ease-out) both`
                      : undefined,
                    "animation-delay": i() < 12 ? `${i() * 28}ms` : undefined,
                  }}
                  onMouseEnter={(e) => {
                    if (!cursorHere()) e.currentTarget.style.background = "rgba(35,28,51,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    if (!cursorHere()) e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Show when={!isBundle && (item as Message).unread}>
                    <div
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        left: "var(--space-2)",
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: "6px",
                        height: "6px",
                        "border-radius": "50%",
                        background: "var(--palm)",
                      }}
                    />
                  </Show>
                  <div style={{ "margin-left": !isBundle && (item as Message).unread ? "var(--space-3)" : 0, "flex-shrink": 0 }}>
                    <Avatar
                      name={isBundle ? (item as Bundle).contact.name : contactById((item as Message).pid)?.name ?? "?"}
                      src={isBundle ? (item as Bundle).contact.avatar : contactById((item as Message).pid)?.avatar}
                      size={36}
                    />
                  </div>
                  <div style={{ flex: 1, "min-width": 0 }}>
                    <Show
                      when={isBundle}
                      fallback={
                        <MessageSummary
                          m={item as Message}
                          contactName={contactById((item as Message).pid)?.name ?? "?"}
                        />
                      }
                    >
                      <BundleSummary bundle={item as Bundle} onOpen={open} />
                    </Show>
                  </div>
                  <Show when={!isBundle}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reply(item as Message);
                      }}
                      title="Reply"
                      aria-label="Reply"
                      style={{
                        "align-self": "center",
                        color: "var(--text-muted)",
                        padding: "6px",
                        "border-radius": "var(--radius-pill)",
                      }}
                    >
                      <Icon name="ph-arrow-u-up-left" size={16} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); markUnread(item as Message); }}
                      title="Mark unread"
                      aria-label="Mark unread"
                      style={{
                        "align-self": "center",
                        color: "var(--text-muted)",
                        padding: "6px",
                        "border-radius": "var(--radius-pill)",
                      }}
                    >
                      <Icon name="ph-envelope" size={16} />
                    </button>
                  </Show>
                </li>
              );
            }}
          </For>
        </ul>
      </Show>

      <Show when={previouslySeen().length > 0}>
        <SectionHeader title="Previously seen" count={previouslySeen().length} />
        <ul style={{ "list-style": "none", margin: 0, padding: "0 var(--space-5)", "max-width": "720px", "margin-left": "auto", "margin-right": "auto" }}>
          <For each={previouslySeen()}>
            {(m) => (
              <li
                onClick={() => open(m.id)}
                style={{
                  display: "flex",
                  gap: "var(--space-3)",
                  padding: "var(--space-3)",
                  "border-bottom": "0.5px solid var(--border)",
                  cursor: "pointer",
                  opacity: 0.75,
                }}
              >
                <Avatar name={contactById(m.pid)?.name ?? "?"} src={contactById(m.pid)?.avatar} size={36} />
                <div style={{ flex: 1, "min-width": 0 }}>
                  <MessageSummary m={m} contactName={contactById(m.pid)?.name ?? "?"} />
                </div>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <Show when={replyLater().length + setAside().length + reminded().length > 0}>
        <SectionHeader title="Piles" />
        <Piles
          replyLater={replyLater().length}
          setAside={setAside().length}
          reminded={reminded().length}
          onOpenPile={(pile) => setPileOpen(pile as PileKey)}
        />
      </Show>

      <Modal
        open={pileOpen() !== null}
        onClose={() => setPileOpen(null)}
        title={pileTitle()}
        width="560px"
      >
        <Show when={pileItems().length > 0} fallback={
          <Empty icon="ph-tray" title={`${pileTitle()} 是空的`} description="还没有放进来。" />
        }>
          <For each={pileItems()}>
            {(m) => (
              <PileRow
                m={m}
                contactName={contactById(m.pid)?.name ?? "?"}
                contactAvatar={contactById(m.pid)?.avatar}
                onOpen={(id) => { setPileOpen(null); open(id); }}
                onClear={async (which) => {
                  await upsertMessage({
                    ...m,
                    replyLater: which === "replyLater" ? false : m.replyLater,
                    setAside: which === "setAside" ? false : m.setAside,
                    bubbleUpAt: which === "remind" ? null : m.bubbleUpAt,
                  });
                }}
                pileKey={pileOpen() ?? "replyLater"}
              />
            )}
          </For>
        </Show>
      </Modal>

      <FocusAndReplyButton onClick={() => setView("imbox")} />
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
        <span style={{ "font-family": "var(--font-body)", "font-size": "var(--text-caption)", color: "var(--text-muted)", "font-weight": "500" }}>
          {props.count}
        </span>
      )}
    </div>
  );
}

function MessageSummary(props: { m: Message; contactName: string }) {
  return (
    <>
      <div style={{ display: "flex", "align-items": "baseline", gap: "var(--space-2)" }}>
        <strong style={{ "font-weight": props.m.unread ? "700" : "500", "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>
          {props.contactName}
        </strong>
        <span style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)", "margin-left": "auto", "white-space": "nowrap" }}>
          {props.m.tm}
        </span>
      </div>
      <div
        style={{
          "font-size": "var(--text-body-sm)",
          color: props.m.unread ? "var(--text-primary)" : "var(--text-secondary)",
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
            color: props.m.unread ? "var(--text-primary)" : "var(--text-secondary)",
          }}
        >
          {props.m.subj}
        </span>
        <span style={{ color: "var(--text-muted)", "margin-left": "6px" }}>— {props.m.prev}</span>
      </div>
    </>
  );
}

function BundleSummary(props: { bundle: Bundle; onOpen: (id: string) => void }) {
  const [expanded, setExpanded] = createSignal(false);
  const last = () => props.bundle.messages[0];
  return (
    <>
      <div
        onClick={(e) => { e.stopPropagation(); setExpanded(!expanded()); }}
        style={{
          display: "flex",
          "align-items": "baseline",
          gap: "var(--space-2)",
          cursor: "pointer",
        }}
      >
        <strong style={{ "font-weight": "700" }}>{props.bundle.contact.name}</strong>
        <span style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)", "font-weight": "600" }}>
          · {props.bundle.messages.length} 封未读
        </span>
        <span style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)", "margin-left": "auto", "white-space": "nowrap" }}>
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
        <span style={{ color: "var(--text-muted)", "margin-left": "6px" }}>— {last()?.prev}</span>
      </div>
      <Show when={expanded()}>
        <div style={{ "margin-top": "var(--space-3)", "padding-top": "var(--space-3)", "border-top": "0.5px dashed var(--border)", animation: "list-item-enter 0.3s var(--ease-out) both" }}>
          <For each={props.bundle.messages}>
            {(m) => (
              <button
                onClick={(e) => { e.stopPropagation(); props.onOpen(m.id); }}
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

function Piles(props: { replyLater: number; setAside: number; reminded: number; onOpenPile: (pile: string) => void }) {
  return (
    <div style={{ display: "flex", gap: "var(--space-3)", padding: "var(--space-4) var(--space-5)" }}>
      <Pile icon="ph-clock" label="Reply Later" count={props.replyLater} onClick={() => props.onOpenPile("Reply Later")} />
      <Pile icon="ph-push-pin" label="Set Aside" count={props.setAside} onClick={() => props.onOpenPile("Set Aside")} />
      <Pile icon="ph-arrow-fat-line-up" label="Remind" count={props.reminded} onClick={() => props.onOpenPile("Remind")} />
    </div>
  );
}

function Pile(props: { icon: string; label: string; count: number; onClick: () => void }) {
  return (
    <button
      onClick={props.onClick}
      style={{
        flex: 1,
        display: "flex",
        "align-items": "center",
        gap: "var(--space-3)",
        padding: "var(--space-3) var(--space-4)",
        background: "var(--paper-mid)",
        "border-radius": "var(--radius-lg)",
        border: "0.5px solid var(--border)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper-dark)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--paper-mid)")}
    >
      <Icon name={props.icon} size={20} />
      <span style={{ flex: 1, "font-weight": "600", "text-align": "left" }}>{props.label}</span>
      <span style={{ color: "var(--text-muted)", "font-size": "var(--text-caption)" }}>
        {props.count}
      </span>
    </button>
  );
}

function PileRow(props: {
  m: Message;
  contactName: string;
  contactAvatar?: string;
  onOpen: (id: string) => void;
  onClear: (which: PileKey) => Promise<void>;
  pileKey: PileKey;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "var(--space-3)",
        padding: "var(--space-3) 0",
        "border-bottom": "0.5px solid var(--border)",
        "align-items": "center",
      }}
    >
      <Avatar name={props.contactName} src={props.contactAvatar} size={32} />
      <div style={{ flex: 1, "min-width": 0, cursor: "pointer" }} onClick={() => props.onOpen(props.m.id)}>
        <strong style={{ "font-size": "var(--text-body-sm)" }}>{props.m.subj}</strong>
        <p style={{ margin: "2px 0 0", color: "var(--text-secondary)", "font-size": "var(--text-caption)" }}>
          {props.contactName} · {props.m.tm}
        </p>
        <Show when={props.m.bubbleUpAt && props.pileKey === "remind"}>
          <p style={{ margin: "2px 0 0", "font-size": "var(--text-micro)", color: "var(--blurple)" }}>
            回浮于 {new Date(props.m.bubbleUpAt!).toLocaleString()}
          </p>
        </Show>
      </div>
      <button
        onClick={() => props.onClear(props.pileKey)}
        title="从 pile 移除"
        aria-label="Remove from pile"
        style={{
          padding: "6px 10px",
          background: "var(--paper-mid)",
          "border-radius": "var(--radius-pill)",
          "font-size": "var(--text-micro)",
          "font-weight": "600",
          color: "var(--text-secondary)",
        }}
      >
        Unmark
      </button>
    </div>
  );
}

function InboxZero() {
  return (
    <Empty
      icon="ph-tray"
      title="Inbox 是空的"
      description={
        "请到 Settings → Accounts → Add account 接入真实邮箱。背景同步会从 IMAP 拉取最近的邮件。"
      }
      action={{ label: "打开 Settings", onClick: () => setView("settings") }}
    />
  );
}

function FocusAndReplyButton(props: { onClick: () => void }) {
  return (
    <div style={{ display: "flex", "justify-content": "center", padding: "var(--space-4)" }}>
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