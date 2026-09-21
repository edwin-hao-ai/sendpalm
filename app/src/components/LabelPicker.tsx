/** LabelPicker — modal to assign labels to one or more messages.
 *
 *  Multi-select semantics are tri-state: a label on every target is
 *  "all", on none is "none", and on some is "some" (indeterminate).
 *  Saving never touches "some" labels on messages that didn't already
 *  have them — the earlier union-write silently copied one message's
 *  labels onto every selected message. */

import {
  For,
  Show,
  createResource,
  createSignal,
  createMemo,
  createEffect,
} from "solid-js";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import {
  listLabels,
  upsertLabel,
  setMessageLabels,
  listMessageBucketSlicesByIds,
} from "../stores/data";
import { showToast } from "../stores/ui";
import { uid } from "../utils/id";
import type { ID } from "../types";

const PRESET_COLORS = [
  "#0A8F63",
  "#5ac8fa",
  "#34c759",
  "#ff9500",
  "#ff3b30",
  "#af52de",
  "#5856d6",
  "#ff2d55",
];

export type LabelMark = "all" | "some" | "none";

/** Per-label natural mark across the target messages. */
export function naturalLabelMarks(
  targets: { labels: ID[] }[],
  labelIds: ID[],
): Map<ID, LabelMark> {
  const marks = new Map<ID, LabelMark>();
  for (const id of labelIds) {
    const have = targets.filter((m) => (m.labels ?? []).includes(id)).length;
    if (targets.length > 0 && have === targets.length) marks.set(id, "all");
    else if (have === 0) marks.set(id, "none");
    else marks.set(id, "some");
  }
  return marks;
}

/** Labels a message should end up with, given the effective marks.
 *  - "all"  → present on the result
 *  - "none" → removed
 *  - "some" → unchanged (kept only if the message already had it)
 *  Label ids the label table no longer knows about are preserved. */
export function labelsForMessage(
  own: ID[],
  marks: Map<ID, LabelMark>,
): ID[] {
  const kept = own.filter((id) => marks.get(id) !== "none");
  for (const [id, mark] of marks) {
    if (mark === "all" && !kept.includes(id)) kept.push(id);
  }
  return kept;
}

export function LabelPicker(props: {
  open: boolean;
  onClose: () => void;
  messageIds: string[];
  onChange?: () => void;
}) {
  const [labels] = createResource(listLabels);
  // Only fetch id + bucket + labels for the selected messages. The
  // previous shape called listMessages() (full body_html) just to
  // filter by id and read m.labels.
  const [messages] = createResource(
    () => props.messageIds,
    listMessageBucketSlicesByIds,
  );
  // User toggles on top of the natural marks: id → forced "all"/"none".
  const [overrides, setOverrides] = createSignal<Record<ID, LabelMark>>({});
  const [newName, setNewName] = createSignal("");
  const [newColor, setNewColor] = createSignal<string>(PRESET_COLORS[0]!);
  const [showNew, setShowNew] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  const targets = createMemo(() => messages() ?? []);

  const count = () => targets().length;

  const marks = createMemo<Map<ID, LabelMark>>(() => {
    if (!props.open) return new Map();
    const base = naturalLabelMarks(
      targets(),
      (labels() ?? []).map((l) => l.id),
    );
    for (const [id, mark] of Object.entries(overrides())) {
      base.set(id, mark);
    }
    return base;
  });

  // Reset user toggles whenever the picker (re)opens or the underlying
  // message list changes, so stale overrides never leak between
  // selections.
  createEffect(() => {
    if (props.open) {
      void targets();
      setOverrides({});
    }
  });

  const toggle = (id: string) => {
    const current = marks().get(id) ?? "none";
    setOverrides((prev) => ({
      ...prev,
      [id]: current === "all" ? "none" : "all",
    }));
  };

  const save = async () => {
    if (busy()) return;
    setBusy(true);
    try {
      // Update only the labels column. The full Message row was never
      // loaded by this modal (we use the bucket-slice projection), so
      // we can't call `upsertMessage` here — that would NULLOUT
      // every other column. setMessageLabels is a focused UPDATE that
      // preserves body / subj / prev / body_html / etc.
      const m = marks();
      for (const t of targets()) {
        await setMessageLabels(t.id, labelsForMessage(t.labels ?? [], m));
      }
      props.onChange?.();
      showToast({
        message: count() > 1 ? `已更新 ${count()} 封邮件的标签` : "标签已更新",
        kind: "success",
      });
      props.onClose();
    } finally {
      setBusy(false);
    }
  };

  const createLabel = async () => {
    const name = newName().trim();
    if (!name) return;
    const exists = (labels() ?? []).some(
      (l) => l.name.toLowerCase() === name.toLowerCase(),
    );
    if (exists) {
      showToast({ message: "标签已存在", kind: "warning" });
      return;
    }
    const label = {
      id: uid("lbl"),
      name,
      color: newColor(),
    };
    await upsertLabel(label);
    toggle(label.id);
    setNewName("");
    setShowNew(false);
    showToast({ message: "已创建并选中标签", kind: "success" });
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={count() > 1 ? `标签 · ${count()} 封邮件` : "标签"}
      width="360px"
      footer={
        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            "justify-content": "flex-end",
          }}
        >
          <button
            onClick={props.onClose}
            style={{
              padding: "8px 14px",
              "border-radius": "var(--radius-pill)",
              "font-size": "var(--text-caption)",
              "font-weight": "600",
              color: "var(--text-secondary)",
            }}
          >
            取消
          </button>
          <button
            onClick={save}
            disabled={busy()}
            style={{
              padding: "8px 14px",
              background: "var(--palm)",
              color: "white",
              "border-radius": "var(--radius-pill)",
              "font-size": "var(--text-caption)",
              "font-weight": "700",
              opacity: busy() ? 0.6 : 1,
            }}
          >
            {busy() ? "保存中…" : "保存"}
          </button>
        </div>
      }
    >
      <div style={{ padding: "var(--space-4) var(--space-5)" }}>
        <Show
          when={(labels() ?? []).length > 0}
          fallback={
            <p
              style={{
                color: "var(--text-muted)",
                "font-size": "var(--text-caption)",
              }}
            >
              还没有标签。在 设置 → 标签 中管理，或点击下方创建。
            </p>
          }
        >
          <div
            style={{
              display: "flex",
              "flex-direction": "column",
              gap: "6px",
              "margin-bottom": "var(--space-3)",
            }}
          >
            <For each={labels()}>
              {(l) => {
                const mark = () => marks().get(l.id) ?? "none";
                return (
                  <button
                    onClick={() => toggle(l.id)}
                    aria-pressed={mark() === "all"}
                    title={
                      mark() === "some"
                        ? `${l.name} · 仅部分邮件已使用`
                        : l.name
                    }
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "var(--space-2)",
                      padding: "8px 10px",
                      "border-radius": "var(--radius-md)",
                      background:
                        mark() === "all"
                          ? "var(--palm-soft)"
                          : mark() === "some"
                            ? "var(--paper-mid)"
                            : "transparent",
                      color:
                        mark() === "none"
                          ? "var(--text-primary)"
                          : "var(--palm)",
                      "text-align": "left",
                      "font-size": "var(--text-body-sm)",
                      "font-weight": mark() === "all" ? "700" : "500",
                    }}
                  >
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        "border-radius": "50%",
                        "background-color": l.color,
                        "flex-shrink": 0,
                      }}
                    />
                    <span style={{ flex: 1 }}>{l.name}</span>
                    <Show when={mark() === "all"}>
                      <Icon name="ph-check" size={14} />
                    </Show>
                    <Show when={mark() === "some"}>
                      <Icon name="ph-minus" size={14} />
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
        </Show>

        <Show when={!showNew()}>
          <button
            onClick={() => setShowNew(true)}
            style={{
              display: "flex",
              "align-items": "center",
              gap: "var(--space-1)",
              padding: "6px 12px",
              color: "var(--palm)",
              "font-size": "var(--text-caption)",
              "font-weight": "700",
            }}
          >
            <Icon name="ph-plus" size={12} /> 新建标签
          </button>
        </Show>

        <Show when={showNew()}>
          <div
            style={{
              display: "flex",
              "flex-direction": "column",
              gap: "var(--space-2)",
              padding: "var(--space-3)",
              background: "var(--paper-mid)",
              "border-radius": "var(--radius-md)",
              "margin-top": "var(--space-2)",
            }}
          >
            <input
              value={newName()}
              onInput={(e) => setNewName(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void createLabel();
                }
              }}
              placeholder="标签名称"
              aria-label="标签名称"
              style={{
                padding: "6px 10px",
                "border-radius": "var(--radius-md)",
                border: "0.5px solid var(--border)",
                "font-size": "var(--text-body-sm)",
              }}
            />
            <div style={{ display: "flex", gap: "2px", "flex-wrap": "wrap" }}>
              <For each={PRESET_COLORS}>
                {(c) => (
                  <button
                    onClick={() => setNewColor(c)}
                    style={{
                      width: "32px",
                      height: "32px",
                      display: "inline-flex",
                      "align-items": "center",
                      "justify-content": "center",
                      background: "transparent",
                    }}
                    aria-label={`选择颜色 ${c}`}
                  >
                    <span
                      style={{
                        width: "22px",
                        height: "22px",
                        "border-radius": "50%",
                        "background-color": c,
                        border:
                          newColor() === c
                            ? "2px solid var(--text-primary)"
                            : "2px solid transparent",
                      }}
                    />
                  </button>
                )}
              </For>
            </div>
            <div
              style={{
                display: "flex",
                gap: "var(--space-2)",
                "justify-content": "flex-end",
              }}
            >
              <button
                onClick={() => setShowNew(false)}
                style={{
                  padding: "4px 10px",
                  "font-size": "var(--text-micro)",
                  color: "var(--text-muted)",
                }}
              >
                取消
              </button>
              <button
                onClick={createLabel}
                disabled={!newName().trim()}
                style={{
                  padding: "4px 10px",
                  background: "var(--palm)",
                  color: "white",
                  "border-radius": "var(--radius-pill)",
                  "font-size": "var(--text-micro)",
                  "font-weight": "700",
                  opacity: newName().trim() ? 1 : 0.4,
                }}
              >
                创建
              </button>
            </div>
          </div>
        </Show>
      </div>
    </Modal>
  );
}
