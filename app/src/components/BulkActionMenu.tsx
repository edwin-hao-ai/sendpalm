/** Global bulk-action menu triggered by the `;` shortcut after selecting
 * messages with x / Space. There is intentionally no always-visible
 * toolbar entry — this is a keyboard-first power-user surface.
 *
 * All mutations are focused per-message writes:
 * - bucket moves go through `moveMessageToBucket` (sets deleted_at on
 *   trash/spam, restores flags on the way out)
 * - flag / unread toggles load each selected row via `getMessage`
 *   (bounded by the selection size) before `upsertMessage`
 * Nothing here calls `listMessages()` — a full-table pull with
 * ~90KB body_html per row is the §11.7 OOM pattern.
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
import {
  getMessage,
  moveMessageToBucket,
  upsertMessage,
} from "../stores/data";
import type { Message, MessageBucket } from "../types";
import { BUCKET_LABEL } from "../utils/labels";

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
    run: () => setBucket("paperTrail"),
  },
  {
    id: "trash",
    label: "移到回收站",
    icon: "ph-trash",
    color: "var(--coral)",
    shortcut: "t",
    run: () => setBucket("trash"),
  },
  {
    id: "spam",
    label: "移到垃圾邮件",
    icon: "ph-warning-circle",
    shortcut: "u",
    run: () => setBucket("spam"),
  },
  {
    id: "set-aside",
    label: "搁置",
    icon: "ph-push-pin",
    shortcut: "a",
    run: () => setFlag("setAside", true, "已批量搁置"),
  },
  {
    id: "reply-later",
    label: "稍后回复",
    icon: "ph-clock",
    shortcut: "l",
    run: () => setFlag("replyLater", true, "已批量标记稍后回复"),
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

/** Selected messages as full rows, loaded per-id. Bounded by the
 *  user's selection (not the table size), so a 4000-row mailbox costs
 *  N single-row lookups instead of one full-table pull. */
async function selectedMessages(): Promise<Message[]> {
  const ids = Array.from(selectedIds());
  const out: Message[] = [];
  for (const id of ids) {
    const m = await getMessage(id);
    if (m) out.push(m);
  }
  return out;
}

async function setBucket(bucket: MessageBucket) {
  // Snapshot current buckets via the focused per-id read so Undo can
  // restore them (moveMessageToBucket also clears flags on trash —
  // Undo re-applies only the bucket; flags the user had set before
  // trashing are part of the trash semantics, not restored).
  const messages = await selectedMessages();
  const before = messages.map((m) => ({ id: m.id, bucket: m.bucket }));
  for (const m of messages) {
    await moveMessageToBucket(m.id, bucket);
  }
  const label = BUCKET_LABEL[bucket] ?? bucket;
  finish(`已批量移动到 ${label}`, {
    label: "撤销",
    run: async () => {
      for (const prev of before) {
        if (prev.bucket !== bucket) {
          await moveMessageToBucket(prev.id, prev.bucket);
        }
      }
      setRefreshTick(refreshTick() + 1);
      showToast({ message: "已撤销批量移动", kind: "success" });
    },
  });
}

async function setFlag(
  key: "replyLater" | "setAside",
  value: boolean,
  successMsg: string,
) {
  const messages = await selectedMessages();
  for (const m of messages) {
    await upsertMessage({ ...m, [key]: value });
  }
  finish(successMsg);
}

async function setUnread(unread: boolean, successMsg: string) {
  const messages = await selectedMessages();
  for (const m of messages) {
    await upsertMessage({ ...m, unread });
  }
  finish(successMsg);
}

function finish(
  successMsg: string,
  action?: { label: string; run: () => Promise<void> },
) {
  setSelectedIds(new Set<string>());
  setRefreshTick(refreshTick() + 1);
  showToast({
    message: successMsg,
    kind: "success",
    action: action
      ? { label: action.label, run: () => void action.run() }
      : undefined,
  });
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
                onFocus={(e) =>
                  (e.currentTarget.style.background = "var(--paper-mid)")
                }
                onBlur={(e) =>
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
          finish("已批量更新标签");
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
          // MovePicker already shows its own success toast with Undo.
          setSelectedIds(new Set<string>());
          setRefreshTick(refreshTick() + 1);
        }}
      />
    </>
  );
}
