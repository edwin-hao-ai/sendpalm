/** Follow-ups view — 已逾期 / 今天 / 本周 / 以后 groups.
 * Spec: prototype-v11 §3.10 + P4.
 *
 * Loads only the messages + contacts referenced by the visible pending
 * follow-ups, not the whole `messages` / `contacts` tables. With ~50
 * pending follow-ups the IPC payload drops from "every body_html in
 * the database + every contact" to "50 lightweight message rows +
 * the few contacts that sent them".
 */

import { For, Show, createMemo, createResource, createEffect, createSignal } from "solid-js";
import {
  listFollowUps,
  listMessagesByIdsLight,
  listContactsByIds,
  upsertFollowUp,
  deleteFollowUp,
} from "../stores/data";
import {
  setSelectedMessageId,
  setDetailOpen,
  setView,
  showToast,
} from "../stores/ui";
import { Empty, ErrorState } from "../components/Empty";
import { Avatar } from "../components/Avatar";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { ResourceGate } from "../components/ResourceGate";
import { SkeletonList } from "../components/Skeleton";
import { addDays, isToday, relativeTime } from "../utils/date";
import { useRefreshEffect } from "../utils/gestures";
import type { FollowUp } from "../types";

export function FollowUps() {
  const [followUps, { refetch: refetchFollowUps }] =
    createResource(listFollowUps);
  const [removeId, setRemoveId] = createSignal<string | null>(null);

  useRefreshEffect(() => {
    void refetchFollowUps();
  });

  /** IDs of every message referenced by a pending follow-up. */
  const visibleMsgIds = createMemo<string[]>(() => {
    const set = new Set<string>();
    for (const f of followUps() ?? []) {
      if (f.status === "pending" && f.msgId) set.add(f.msgId);
    }
    return [...set];
  });

  const [messages, { refetch: refetchMessages }] = createResource(
    visibleMsgIds,
    listMessagesByIdsLight,
  );

  /** Re-fetch the related message rows whenever the visible id set
   *  changes (e.g. a new follow-up appears, or one is removed). */
  createEffect(() => {
    void visibleMsgIds();
    void refetchMessages();
  });

  const grouped = createMemo(() => {
    const items = (followUps() ?? []).filter((f) => f.status === "pending");
    const now = new Date();
    const today: FollowUp[] = [];
    const overdue: FollowUp[] = [];
    const thisWeek: FollowUp[] = [];
    const later: FollowUp[] = [];

    const weekFromNow = addDays(now, 7);

    for (const f of items) {
      const d = new Date(f.dueAt);
      if (d < now && !isToday(f.dueAt)) overdue.push(f);
      else if (isToday(f.dueAt)) today.push(f);
      else if (d <= weekFromNow) thisWeek.push(f);
      else later.push(f);
    }
    return { overdue, today, thisWeek, later };
  });

  const msgById = (id: string) => (messages() ?? []).find((m) => m.id === id);
  const contactIdsByMessage = createMemo<Set<string>>(() => {
    const s = new Set<string>();
    for (const m of messages() ?? []) if (m.pid) s.add(m.pid);
    return s;
  });
  const [contacts, { refetch: refetchContacts }] = createResource(
    contactIdsByMessage,
    (ids) => listContactsByIds([...ids]),
  );
  createEffect(() => {
    void contactIdsByMessage();
    void refetchContacts();
  });
  const contactById = (id: string) =>
    (contacts() ?? []).find((c) => c.id === id);

  /** Resolve the contact for a follow-up without crashing when the
   *  referenced message row is missing (deleted message, partial sync). */
  const contactFor = (f: FollowUp) => {
    const msg = f.msgId ? msgById(f.msgId) : undefined;
    return msg && msg.pid ? contactById(msg.pid) : undefined;
  };

  const open = (msgId: string) => {
    setSelectedMessageId(msgId);
    setDetailOpen(true);
  };

  const markDone = async (id: string) => {
    const fu = (followUps() ?? []).find((f) => f.id === id);
    if (!fu) return;
    await upsertFollowUp({ ...fu, status: "done" });
    await refetchFollowUps();
    showToast({ message: "已标记完成", kind: "success" });
  };

  const remove = async (id: string) => {
    await deleteFollowUp(id);
    await refetchFollowUps();
    showToast({ message: "已删除", kind: "info" });
  };

  const total = () =>
    (followUps() ?? []).filter((f) => f.status === "pending").length;

  return (
    <div
      style={{
        padding: "0",
        animation: "view-enter 0.3s var(--ease-out) both",
      }}
    >
      <header
        style={{
          padding: "var(--space-6) var(--space-5) var(--space-3)",
          "text-align": "center",
        }}
      >
        <h2
          style={{
            "font-family": "var(--font-display)",
            "font-size": "var(--text-h3)",
            "font-weight": "800",
            margin: 0,
          }}
        >
          跟进提醒
        </h2>
        <p
          style={{
            color: "var(--text-secondary)",
            "font-size": "var(--text-caption)",
            margin: "var(--space-1) 0 0",
          }}
        >
          {total()} 项待处理 · 打开任意邮件，在底部点「更多 → 跟进提醒」即可添加
        </p>
      </header>

      <ConfirmDialog
        open={removeId() !== null}
        title="删除这条跟进提醒？"
        body="邮件本身不会被删除。"
        confirmLabel="删除"
        onConfirm={() => {
          const id = removeId();
          if (id) void remove(id);
        }}
        onCancel={() => setRemoveId(null)}
      />

      <ResourceGate
        resource={followUps}
        isLoading={() =>
          followUps.loading || messages.loading || contacts.loading
        }
        loading={
          <div
            style={{
              "max-width": "760px",
              margin: "0 auto",
              padding: "var(--space-4) var(--space-5)",
            }}
          >
            <SkeletonList count={5} />
          </div>
        }
        errorView={() => (
          <ErrorState
            title="跟进加载失败"
            message="请稍后重试；若持续失败，请检查本地数据库状态。"
            retry={() => void refetchFollowUps()}
          />
        )}
        empty={
          <Empty
            icon="ph-bell-ringing"
            title="没有跟进提醒"
            description="打开任意邮件，在底部点「更多 → 跟进提醒」，这里会列出所有需要回头处理的消息。"
            action={{ label: "去 Imbox", onClick: () => setView("imbox") }}
          />
        }
        isEmpty={() => total() === 0}
      >
        {() => (
          <div
            style={{
              "max-width": "760px",
              margin: "0 auto",
              padding: "var(--space-4) var(--space-5)",
            }}
          >
            <Show when={grouped().overdue.length > 0}>
              <Group title="已逾期" icon="ph-warning-circle" tone="danger">
                <For each={grouped().overdue}>
                  {(f) => (
                    <Row
                      f={f}
                      msg={msgById(f.msgId)}
                      contact={contactFor(f)}
                      onOpen={open}
                      onDone={markDone}
                      onRemove={(id) => setRemoveId(id)}
                    />
                  )}
                </For>
              </Group>
            </Show>

            <Show when={grouped().today.length > 0}>
              <Group title="今天" icon="ph-calendar-blank">
                <For each={grouped().today}>
                  {(f) => (
                    <Row
                      f={f}
                      msg={msgById(f.msgId)}
                      contact={contactFor(f)}
                      onOpen={open}
                      onDone={markDone}
                      onRemove={(id) => setRemoveId(id)}
                    />
                  )}
                </For>
              </Group>
            </Show>

            <Show when={grouped().thisWeek.length > 0}>
              <Group title="本周" icon="ph-calendar">
                <For each={grouped().thisWeek}>
                  {(f) => (
                    <Row
                      f={f}
                      msg={msgById(f.msgId)}
                      contact={contactFor(f)}
                      onOpen={open}
                      onDone={markDone}
                      onRemove={(id) => setRemoveId(id)}
                    />
                  )}
                </For>
              </Group>
            </Show>

            <Show when={grouped().later.length > 0}>
              <Group title="以后" icon="ph-clock">
                <For each={grouped().later}>
                  {(f) => (
                    <Row
                      f={f}
                      msg={msgById(f.msgId)}
                      contact={contactFor(f)}
                      onOpen={open}
                      onDone={markDone}
                      onRemove={(id) => setRemoveId(id)}
                    />
                  )}
                </For>
              </Group>
            </Show>
          </div>
        )}
      </ResourceGate>
    </div>
  );
}

function Group(props: {
  title: string;
  icon: string;
  tone?: "danger";
  children: unknown;
}) {
  const color =
    props.tone === "danger" ? "var(--coral)" : "var(--text-primary)";
  return (
    <section style={{ "margin-bottom": "var(--space-5)" }}>
      <h3
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-h4)",
          "font-weight": "800",
          margin: "0 0 var(--space-3)",
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
          color,
        }}
      >
        <Icon name={props.icon} size={16} />
        {props.title}
      </h3>
      {props.children as never}
    </section>
  );
}

function Row(props: {
  f: FollowUp;
  msg?: { id: string; subj: string; pid: string };
  contact?: { name: string; avatar: string };
  onOpen: (id: string) => void;
  onDone: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "var(--space-3)",
        padding: "var(--space-3)",
        background: "var(--paper-light)",
        "border-radius": "var(--radius-md)",
        border: "0.5px solid var(--border)",
        "margin-bottom": "var(--space-2)",
        "align-items": "center",
      }}
    >
      <Avatar
        name={props.contact?.name ?? "?"}
        src={props.contact?.avatar}
        size={32}
      />
      <div
        style={{ flex: 1, "min-width": 0, cursor: "pointer" }}
        onClick={() => props.msg && props.onOpen(props.msg.id)}
      >
        <strong style={{ "font-size": "var(--text-body-sm)" }}>
          {props.contact?.name ?? "未知联系人"}
        </strong>
        <p
          style={{
            margin: "2px 0 0",
            color: "var(--text-secondary)",
            "font-size": "var(--text-caption)",
            "white-space": "nowrap",
            overflow: "hidden",
            "text-overflow": "ellipsis",
          }}
        >
          {props.msg?.subj ?? "(消息已删除)"}
        </p>
        <p
          style={{
            margin: "2px 0 0",
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
          }}
        >
          {relativeTime(props.f.dueAt)}
          {props.f.note ? ` · ${props.f.note}` : ""}
        </p>
      </div>
      <button
        onClick={() => props.onDone(props.f.id)}
        style={{
          padding: "6px 12px",
          background: "var(--palm-soft)",
          color: "var(--palm)",
          "border-radius": "var(--radius-pill)",
          "font-size": "var(--text-micro)",
          "font-weight": "700",
        }}
      >
        完成
      </button>
      <button
        onClick={() => props.onRemove(props.f.id)}
        aria-label="删除"
        title="删除"
        style={{ color: "var(--text-muted)", padding: "6px" }}
      >
        <Icon name="ph-x" size={14} />
      </button>
    </div>
  );
}
