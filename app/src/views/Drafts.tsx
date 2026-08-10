/** Drafts view — Scheduled / Pending / Manual / Sent sections + multi-select.
 * Spec: prototype-v11 §3.8 + P4.
 */

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import {
  listDrafts,
  listScheduledSends,
  upsertDraft,
  deleteDraft,
} from "../stores/data";
import {
  setComposeOpen,
  setDetailOpen,
  setSelectedDraftId,
  showToast,
} from "../stores/ui";
import { Icon } from "../components/Icon";
import { Empty } from "../components/Empty";
import type { Draft } from "../types";
import { relativeTime } from "../utils/date";
import { useRefreshEffect } from "../utils/gestures";

export function Drafts() {
  const [drafts, { refetch: refetchDrafts }] = createResource(listDrafts);
  const [scheduled, { refetch: refetchScheduled }] =
    createResource(listScheduledSends);
  const [selected, setSelected] = createSignal<Set<string>>(new Set());

  useRefreshEffect(() => {
    void refetchDrafts();
    void refetchScheduled();
  });

  const grouped = createMemo(() => {
    const all = drafts() ?? [];
    return {
      scheduled: scheduled() ?? [],
      pending: all.filter(
        (d) => d.status === "pending" || d.status === "approved",
      ),
      manual: all.filter((d) => d.status === "edited"),
      sent: all.filter((d) => d.status === "sent"),
    };
  });

  const open = (d: Draft) => {
    setSelectedDraftId(d.id);
    setDetailOpen(true);
  };

  const toggleSelect = (id: string) => {
    const s = new Set<string>(selected());
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };

  const batchApprove = async () => {
    for (const id of selected()) {
      const d = (drafts() ?? []).find((x) => x.id === id);
      if (d && d.status === "pending") {
        await upsertDraft({ ...d, status: "approved" });
      }
    }
    await refetchDrafts();
    setSelected(new Set<string>());
    showToast({ message: "已批量审批", kind: "success" });
  };

  const batchDiscard = async () => {
    for (const id of selected()) {
      await deleteDraft(id);
    }
    await refetchDrafts();
    setSelected(new Set<string>());
    showToast({ message: "已批量删除", kind: "info" });
  };

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
          Drafts
        </h2>
        <p
          style={{
            color: "var(--text-secondary)",
            "font-size": "var(--text-caption)",
            margin: "var(--space-1) 0 0",
          }}
        >
          草稿、定时发送、待审批 — 集中管理所有未发出的内容。
        </p>
      </header>

      <Show when={selected().size > 0}>
        <div
          style={{
            padding: "var(--space-3) var(--space-5)",
            background: "var(--palm-soft)",
            display: "flex",
            gap: "var(--space-2)",
            "align-items": "center",
          }}
        >
          <span
            style={{
              "font-size": "var(--text-caption)",
              "font-weight": "700",
              color: "var(--palm)",
              flex: 1,
            }}
          >
            已选 {selected().size} 项
          </span>
          <button onClick={batchApprove} style={batchBtn("var(--palm)")}>
            批量审批
          </button>
          <button onClick={batchDiscard} style={batchBtn("var(--coral)")}>
            批量删除
          </button>
          <button
            onClick={() => setSelected(new Set<string>())}
            style={{
              padding: "6px 12px",
              "font-size": "var(--text-caption)",
              color: "var(--text-muted)",
            }}
          >
            取消
          </button>
        </div>
      </Show>

      <Show
        when={(drafts() ?? []).length > 0 || (scheduled() ?? []).length > 0}
        fallback={
          <Empty
            icon="ph-pencil-line"
            title="还没有草稿"
            description="按 ⌘N 写一封新邮件，或在 Imbox 里 Reply。"
            action={{ label: "新邮件", onClick: () => setComposeOpen(true) }}
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
          <Show when={grouped().scheduled.length > 0}>
            <Section title="Scheduled" icon="ph-clock-countdown">
              <For each={grouped().scheduled}>
                {(s) => {
                  const d = (drafts() ?? []).find((x) => x.id === s.draftId);
                  if (!d) return null;
                  return (
                    <DraftRow
                      draft={d}
                      scheduledAt={s.scheduledAt}
                      onOpen={open}
                      selected={selected().has(d.id)}
                      onSelect={() => toggleSelect(d.id)}
                    />
                  );
                }}
              </For>
            </Section>
          </Show>

          <Show when={grouped().pending.length > 0}>
            <Section title="Pending approval" icon="ph-hourglass-medium">
              <For each={grouped().pending}>
                {(d) => (
                  <DraftRow
                    draft={d}
                    onOpen={open}
                    selected={selected().has(d.id)}
                    onSelect={() => toggleSelect(d.id)}
                  />
                )}
              </For>
            </Section>
          </Show>

          <Show when={grouped().manual.length > 0}>
            <Section title="Manual drafts" icon="ph-file-text">
              <For each={grouped().manual}>
                {(d) => (
                  <DraftRow
                    draft={d}
                    onOpen={open}
                    selected={selected().has(d.id)}
                    onSelect={() => toggleSelect(d.id)}
                  />
                )}
              </For>
            </Section>
          </Show>

          <Show when={grouped().sent.length > 0}>
            <Section title="Sent" icon="ph-paper-plane-tilt">
              <For each={grouped().sent}>
                {(d) => (
                  <DraftRow
                    draft={d}
                    onOpen={open}
                    selected={selected().has(d.id)}
                    onSelect={() => toggleSelect(d.id)}
                  />
                )}
              </For>
            </Section>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function batchBtn(color: string) {
  return {
    padding: "6px 14px",
    background: color,
    color: "white",
    "border-radius": "var(--radius-pill)",
    "font-size": "var(--text-caption)",
    "font-weight": "700",
  } as const;
}

function Section(props: { title: string; icon: string; children: unknown }) {
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
        }}
      >
        <Icon name={props.icon} size={16} />
        {props.title}
      </h3>
      {props.children as never}
    </section>
  );
}

function DraftRow(props: {
  draft: Draft;
  scheduledAt?: string;
  onOpen: (d: Draft) => void;
  selected: boolean;
  onSelect: () => void;
}) {
  const statusColor: Record<string, string> = {
    pending: "var(--yellow)",
    approved: "var(--mint)",
    edited: "var(--sky)",
    sent: "var(--paper-mid)",
    discarded: "var(--paper-mid)",
  };
  return (
    <div
      style={{
        display: "flex",
        gap: "var(--space-3)",
        padding: "var(--space-3)",
        background: props.selected ? "var(--palm-soft)" : "var(--paper-light)",
        border: "0.5px solid var(--border)",
        "border-radius": "var(--radius-md)",
        "margin-bottom": "var(--space-2)",
        "align-items": "center",
      }}
    >
      <input
        type="checkbox"
        checked={props.selected}
        onChange={props.onSelect}
        style={{ "flex-shrink": 0 }}
      />
      <div
        style={{ flex: 1, "min-width": 0, cursor: "pointer" }}
        onClick={() => props.onOpen(props.draft)}
      >
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-2)",
          }}
        >
          <strong style={{ "font-size": "var(--text-body-sm)" }}>
            {props.draft.subject || "(无主题)"}
          </strong>
          <span
            style={{
              padding: "2px 8px",
              background: statusColor[props.draft.status],
              "border-radius": "var(--radius-pill)",
              "font-size": "10px",
              "font-weight": "700",
              color:
                props.draft.status === "edited"
                  ? "var(--text-primary)"
                  : "var(--text-primary)",
            }}
          >
            {props.draft.status}
          </span>
        </div>
        <p
          style={{
            margin: "2px 0 0",
            color: "var(--text-secondary)",
            "font-size": "var(--text-caption)",
          }}
        >
          to {props.draft.recipient} · {relativeTime(props.draft.lastEdited)}
        </p>
      </div>
      <Show when={props.scheduledAt}>
        <span
          style={{
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
            display: "flex",
            "align-items": "center",
            gap: "4px",
          }}
        >
          <Icon name="ph-clock" size={11} />
          发送于 {new Date(props.scheduledAt!).toLocaleString()}
        </span>
      </Show>
    </div>
  );
}
