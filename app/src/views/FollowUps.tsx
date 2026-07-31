/** Follow-ups view — Overdue / Today / This week / Later groups.
 * Spec: prototype-v11 §3.10 + P4.
 */

import { For, Show, createMemo, createResource } from "solid-js";
import { listFollowUps, listMessages, listContacts, upsertFollowUp, deleteFollowUp } from "../stores/data";
import { setSelectedMessageId, setDetailOpen, showToast } from "../stores/ui";
import { Empty } from "../components/Empty";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { addDays, isToday, relativeTime } from "../utils/date";
import type { FollowUp } from "../types";

export function FollowUps() {
  const [followUps, { refetch }] = createResource(listFollowUps);
  const [messages] = createResource(listMessages);
  const [contacts] = createResource(listContacts);

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
  const contactById = (id: string) => (contacts() ?? []).find((c) => c.id === id);

  const open = (msgId: string) => {
    setSelectedMessageId(msgId);
    setDetailOpen(true);
  };

  const markDone = async (id: string) => {
    const fu = (followUps() ?? []).find((f) => f.id === id);
    if (!fu) return;
    await upsertFollowUp({ ...fu, status: "done" });
    await refetch();
    showToast({ message: "已标记完成", kind: "success" });
  };

  const remove = async (id: string) => {
    await deleteFollowUp(id);
    await refetch();
    showToast({ message: "已删除", kind: "info" });
  };

  const total = () => (followUps() ?? []).filter((f) => f.status === "pending").length;

  return (
    <div style={{ padding: "0", animation: "view-enter 0.3s var(--ease-out) both" }}>
      <header style={{ padding: "var(--space-5)", "border-bottom": "0.5px solid var(--border)" }}>
        <h2 style={{ "font-family": "var(--font-display)", "font-size": "var(--text-h3)", "font-weight": "800", margin: 0 }}>
          Follow-ups
        </h2>
        <p style={{ color: "var(--text-secondary)", "font-size": "var(--text-caption)", margin: "var(--space-1) 0 0" }}>
          {total()} 项待处理 · 在消息面板里点 "Follow-up" 添加
        </p>
      </header>

      <Show when={total() > 0} fallback={<Empty icon="ph-bell-ringing" title="没有跟进" description="还没设置跟进提醒。" />}>
        <div style={{ "max-width": "760px", margin: "0 auto", padding: "var(--space-4) var(--space-5)" }}>
          <Show when={grouped().overdue.length > 0}>
            <Group title="Overdue" icon="ph-warning-circle" tone="danger">
              <For each={grouped().overdue}>
                {(f) => <Row f={f} msg={msgById(f.msgId)} contact={f.msgId ? contactById(msgById(f.msgId)!.pid) : undefined} onOpen={open} onDone={markDone} onRemove={remove} />}
              </For>
            </Group>
          </Show>

          <Show when={grouped().today.length > 0}>
            <Group title="Today" icon="ph-calendar-blank">
              <For each={grouped().today}>
                {(f) => <Row f={f} msg={msgById(f.msgId)} contact={f.msgId ? contactById(msgById(f.msgId)!.pid) : undefined} onOpen={open} onDone={markDone} onRemove={remove} />}
              </For>
            </Group>
          </Show>

          <Show when={grouped().thisWeek.length > 0}>
            <Group title="This week" icon="ph-calendar">
              <For each={grouped().thisWeek}>
                {(f) => <Row f={f} msg={msgById(f.msgId)} contact={f.msgId ? contactById(msgById(f.msgId)!.pid) : undefined} onOpen={open} onDone={markDone} onRemove={remove} />}
              </For>
            </Group>
          </Show>

          <Show when={grouped().later.length > 0}>
            <Group title="Later" icon="ph-clock">
              <For each={grouped().later}>
                {(f) => <Row f={f} msg={msgById(f.msgId)} contact={f.msgId ? contactById(msgById(f.msgId)!.pid) : undefined} onOpen={open} onDone={markDone} onRemove={remove} />}
              </For>
            </Group>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function Group(props: { title: string; icon: string; tone?: "danger"; children: unknown }) {
  const color = props.tone === "danger" ? "var(--coral)" : "var(--text-primary)";
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
      <Avatar name={props.contact?.name ?? "?"} src={props.contact?.avatar} size={32} />
      <div style={{ flex: 1, "min-width": 0, cursor: "pointer" }} onClick={() => props.msg && props.onOpen(props.msg.id)}>
        <strong style={{ "font-size": "var(--text-body-sm)" }}>{props.contact?.name ?? "Unknown"}</strong>
        <p style={{ margin: "2px 0 0", color: "var(--text-secondary)", "font-size": "var(--text-caption)", "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>
          {props.msg?.subj ?? "(消息已删除)"}
        </p>
        <p style={{ margin: "2px 0 0", "font-size": "var(--text-micro)", color: "var(--text-muted)" }}>
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