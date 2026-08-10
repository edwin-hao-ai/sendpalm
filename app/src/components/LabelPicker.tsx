/** LabelPicker — modal to assign labels to one or more messages. */

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
  upsertMessage,
  listMessages,
} from "../stores/data";
import { showToast } from "../stores/ui";
import { uid } from "../utils/id";

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

export function LabelPicker(props: {
  open: boolean;
  onClose: () => void;
  messageIds: string[];
  onChange?: () => void;
}) {
  const [labels] = createResource(listLabels);
  const [messages] = createResource(listMessages);
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const [newName, setNewName] = createSignal("");
  const [newColor, setNewColor] = createSignal<string>(PRESET_COLORS[0]!);
  const [showNew, setShowNew] = createSignal(false);

  const targets = createMemo(() =>
    (messages() ?? []).filter((m) => props.messageIds.includes(m.id)),
  );

  const count = () => targets().length;

  // Reset selected labels to the union of target message labels whenever
  // the picker opens or the underlying message list changes.
  createEffect(() => {
    if (!props.open) return;
    const msgs = messages();
    if (!msgs) return;
    const next = new Set<string>();
    for (const m of msgs) {
      if (props.messageIds.includes(m.id)) {
        for (const l of m.labels ?? []) next.add(l);
      }
    }
    setSelected(next);
  });

  const toggle = (id: string) => {
    const next = new Set(selected());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const save = async () => {
    const finalLabels = Array.from(selected());
    for (const m of targets()) {
      await upsertMessage({ ...m, labels: finalLabels });
    }
    props.onChange?.();
    showToast({
      message: count() > 1 ? `已更新 ${count()} 封邮件标签` : "标签已更新",
      kind: "success",
    });
    props.onClose();
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
            style={{
              padding: "8px 14px",
              background: "var(--palm)",
              color: "white",
              "border-radius": "var(--radius-pill)",
              "font-size": "var(--text-caption)",
              "font-weight": "700",
            }}
          >
            保存
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
              还没有标签。在 Settings → Labels 管理，或点击下方创建。
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
              {(l) => (
                <button
                  onClick={() => toggle(l.id)}
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--space-2)",
                    padding: "8px 10px",
                    "border-radius": "var(--radius-md)",
                    background: selected().has(l.id)
                      ? "var(--palm-soft)"
                      : "transparent",
                    color: selected().has(l.id)
                      ? "var(--palm)"
                      : "var(--text-primary)",
                    "text-align": "left",
                    "font-size": "var(--text-body-sm)",
                    "font-weight": selected().has(l.id) ? "700" : "500",
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
                  <Show when={selected().has(l.id)}>
                    <Icon name="ph-check" size={14} />
                  </Show>
                </button>
              )}
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
              placeholder="标签名称"
              style={{
                padding: "6px 10px",
                "border-radius": "var(--radius-md)",
                border: "0.5px solid var(--border)",
                "font-size": "var(--text-body-sm)",
              }}
            />
            <div style={{ display: "flex", gap: "6px" }}>
              <For each={PRESET_COLORS}>
                {(c) => (
                  <button
                    onClick={() => setNewColor(c)}
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
                    aria-label={`选择颜色 ${c}`}
                  />
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
