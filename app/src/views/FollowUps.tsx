/** Follow-ups view — Overdue / Today / This week / Later groups.
 * Spec: prototype-v11 §3.10 + P4.
 *
 * Loads only the messages + contacts referenced by the visible pending
 * follow-ups, not the whole `messages` / `contacts` tables. With ~50
 * pending follow-ups the IPC payload drops from "every body_html in
 * the database + every contact" to "50 lightweight message rows +
 * the few contacts that sent them".
 */

import { For, Show, createMemo, createResource, createEffect } from "solid-js";
import {
  listFollowUps,
  listMessagesByIdsLight,
  listContactsByIds,
  upsertFollowUp,
  deleteFollowUp,
} from "../stores/data";
import { setSelectedMessageId, setDetailOpen, showToast } from "../stores/ui";
import { Empty, ErrorState } from "../components/Empty";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { addDays, isToday, relativeTime } from "../utils/date";
import { useRefreshEffect } from "../utils/gestures";
import type { FollowUp } from "../types";

export function FollowUps() {
  const [followUps, { refetch: refetchFollowUps }] =
    createResource(listFollowUps);

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
          padding: "var(--space-5)",
          "border-bottom": "0.5px solid var(--border)",
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
          Follow-ups
        </h2>
        <p
          style={{
            color: "var(--text-secondary)",
            "font-size": "var(--text-caption)",
            margin: "var(--space-1) 0 0",
          }}
        >
          {total()} 项待处理 · 在消息面板里点 "Follow-up" 添加
        </p>
      </header>

      <Show
        when={!followUps.error}
        fallback={
          <ErrorState
            title="跟进加载失败"
            message={String(followUps.error ?? "")}
            retry={() => void refetchFollowUps()}
          />
        }
      >
        <></>
      </Show>

      <Show
        when={total() > 0}
        fallback={
          <Empty
            icon="ph-bell-ringing"
            title="没有跟进"
            description="还没设置跟进提醒。"
          />
        }
      >
        <div
          style={{
            "max-width": "760px",
            margin: "0 auto",
            padding: "var(--space-4) var(--space-5)",
          }}
        >
          <Show when={grouped().overdue.length > 0}>
            <Group title="Overdue" icon="ph-warning-circle" tone="danger">
              <For each={grouped().overdue}>
                {(f) => (
                  <Row
                    f={f}
                    msg={msgById(f.msgId)}
                    contact={
                      f.msgId ? contactById(msgById(f.msgId)!.pid) : undefined
                    }
                    onOpen={open}
                    onDone={markDone}
                    onRemove={remove}
                  />
                )}
              </For>
            </Group>
          </Show>

          <Show when={grouped().today.length > 0}>
            <Group title="Today" icon="ph-calendar-blank">
              <For each={grouped().today}>
                {(f) => (
                  <Row
                    f={f}
                    msg={msgById(f.msgId)}
                    contact={
                      f.msgId ? contactById(msgById(f.msgId)!.pid) : undefined
                    }
                    onOpen={open}
                    onDone={markDone}
                    onRemove={remove}
                  />
                )}
              </For>
            </Group>
          </Show>

          <Show when={grouped().thisWeek.length > 0}>
            <Group title="This week" icon="ph-calendar">
              <For each={grouped().thisWeek}>
                {(f) => (
                  <Row
                    f={f}
                    msg={msgById(f.msgId)}
                    contact={
                      f.msgId ? contactById(msgById(f.msgId)!.pid) : undefined
                    }
                    onOpen={open}
                    onDone={markDone}
                    onRemove={remove}
                  />
                )}
              </For>
            </Group>
          </Show>

          <Show when={grouped().later.length > 0}>
            <Group title="Later" icon="ph-clock">
              <For each={grouped().later}>
                {(f) => (
                  <Row
                    f={f}
                    msg={msgById(f.msgId)}
                    contact={
                      f.msgId ? contactById(msgById(f.msgId)!.pid) : undefined
                    }
                    onOpen={open}
                    onDone={markDone}
                    onRemove={remove}
                  />
                )}
              </For>
            </Group>
          </Show>
        </div>
      </Show>
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
          {props.contact?.name ?? "Unknown"}
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
          {relativeTime(props.f.dueAt)} · {props.f.note ?? "no note"}
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
        Done
      </button>
      <button
        onClick={() => props.onRemove(props.f.id)}
        aria-label="Remove"
        title="Remove"
        style={{ color: "var(--text-muted)", padding: "6px" }}
      >
        <Icon name="ph-x" size={14} />
      </button>
    </div>
  );
}
