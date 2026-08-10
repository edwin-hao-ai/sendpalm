/** Global bulk-action menu triggered by the `;` shortcut.
 * Mirrors the actions available in the Imbox bottom bulk bar so every list
 * view gets the same power-user workflow.
 */

import { For, Show, createSignal } from "solid-js";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { LabelPicker } from "./LabelPicker";
import { MovePicker } from "./MovePicker";
import {
  selectedIds,
  setSelectedIds,
  showToast,
  setRefreshTick,
  refreshTick,
} from "../stores/ui";
import { listMessages, upsertMessage } from "../stores/data";
import type { Message } from "../types";

const ACTIONS: {
  id: string;
  label: string;
  icon: string;
  color?: string;
  shortcut?: string;
  run: () => Promise<void> | void;
}[] = [
  {
    id: "archive",
    label: "归档到 Records",
    icon: "ph-tray",
    shortcut: "e",
    run: () => setBucket("paperTrail", "已批量归档"),
  },
  {
    id: "trash",
    label: "移到 Trash",
    icon: "ph-trash",
    color: "var(--ruby)",
    shortcut: "t",
    run: () => setBucket("trash", "已批量移到 Trash"),
  },
  {
    id: "spam",
    label: "移到 Spam",
    icon: "ph-warning-circle",
    shortcut: "u",
    run: () => setBucket("spam", "已批量移到 Spam"),
  },
  {
    id: "set-aside",
    label: "Set Aside",
    icon: "ph-push-pin",
    shortcut: "a",
    run: () => setFlag("setAside", true, "已批量 Set Aside"),
  },
  {
    id: "reply-later",
    label: "Reply Later",
    icon: "ph-clock",
    shortcut: "l",
    run: () => setFlag("replyLater", true, "已批量 Reply Later"),
  },
  {
    id: "read",
    label: "标为已读",
    icon: "ph-envelope-open",
    run: () => setUnread(false, "已批量标为已读"),
  },
  {
    id: "unread",
    label: "标为未读",
    icon: "ph-envelope",
    run: () => setUnread(true, "已批量标为未读"),
  },
  {
    id: "label",
    label: "添加标签…",
    icon: "ph-tag",
    shortcut: "b",
    run: () => {
      setLabelOpen(true);
    },
  },
  {
    id: "move",
    label: "移动到…",
    icon: "ph-folder-notch",
    shortcut: "v",
    run: () => {
      setMoveOpen(true);
    },
  },
];

async function withSelectionIds(): Promise<Message[]> {
  const ids = Array.from(selectedIds());
  const all = await listMessages();
  return all.filter((m) => ids.includes(m.id));
}

async function setBucket(bucket: Message["bucket"], successMsg: string) {
  const messages = await withSelectionIds();
  for (const m of messages) {
    await upsertMessage({ ...m, bucket });
  }
  finish(successMsg);
}

async function setFlag(
  key: "replyLater" | "setAside",
  value: boolean,
  successMsg: string,
) {
  const messages = await withSelectionIds();
  for (const m of messages) {
    await upsertMessage({ ...m, [key]: value });
  }
  finish(successMsg);
}

async function setUnread(unread: boolean, successMsg: string) {
  const messages = await withSelectionIds();
  for (const m of messages) {
    await upsertMessage({ ...m, unread });
  }
  finish(successMsg);
}

function finish(successMsg: string) {
  setSelectedIds(new Set<string>());
  setRefreshTick(refreshTick() + 1);
  showToast({ message: successMsg, kind: "success" });
}

const [open, setOpen] = createSignal(false);
const [labelOpen, setLabelOpen] = createSignal(false);
const [moveOpen, setMoveOpen] = createSignal(false);

export function openBulkActionMenu() {
  if (selectedIds().size === 0) {
    showToast({
      message: "先按 x 或空格选择邮件，再按 ; 打开批量菜单",
      kind: "info",
    });
    return;
  }
  setOpen(true);
}

export function BulkActionMenu() {
  return (
    <>
      <Modal open={open()} onClose={() => setOpen(false)} title="批量操作">
        <div
          style={{
            display: "grid",
            gap: "var(--space-2)",
            "min-width": "240px",
          }}
        >
          <div
            style={{
              "font-size": "var(--text-caption)",
              color: "var(--text-muted)",
              "margin-bottom": "var(--space-2)",
            }}
          >
            已选择 {selectedIds().size} 封邮件
          </div>
          <For each={ACTIONS}>
            {(action) => (
              <button
                onClick={() => {
                  const result = action.run();
                  if (result instanceof Promise) {
                    void result.then(() => setOpen(false));
                  } else {
                    if (!labelOpen() && !moveOpen()) {
                      setOpen(false);
                    }
                  }
                }}
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--space-3)",
                  padding: "var(--space-3)",
                  background: "var(--paper-light)",
                  border: "0.5px solid var(--border)",
                  "border-radius": "var(--radius-md)",
                  color: action.color ?? "var(--text-primary)",
                  "font-size": "var(--text-body-sm)",
                  "font-weight": "600",
                  cursor: "pointer",
                  "text-align": "left",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--paper-mid)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "var(--paper-light)")
                }
              >
                <Icon name={action.icon} size={18} />
                <span style={{ flex: 1 }}>{action.label}</span>
                <Show when={action.shortcut}>
                  <kbd
                    style={{
                      padding: "2px 6px",
                      background: "var(--paper-mid)",
                      "border-radius": "var(--radius-sm)",
                      "font-size": "var(--text-micro)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {action.shortcut}
                  </kbd>
                </Show>
              </button>
            )}
          </For>
        </div>
      </Modal>

      <LabelPicker
        open={labelOpen()}
        onClose={() => {
          setLabelOpen(false);
          setOpen(false);
        }}
        messageIds={Array.from(selectedIds())}
        onChange={() => {
          setLabelOpen(false);
          setOpen(false);
          finish("已批量添加标签");
        }}
      />
      <MovePicker
        open={moveOpen()}
        onClose={() => {
          setMoveOpen(false);
          setOpen(false);
        }}
        messageIds={Array.from(selectedIds())}
        onChange={() => {
          setMoveOpen(false);
          setOpen(false);
          finish("已批量移动");
        }}
      />
    </>
  );
}
