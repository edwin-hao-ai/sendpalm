/** MovePicker — modal to move one or more messages to another bucket. */

import { For, Show, createResource, createMemo, createSignal } from "solid-js";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import {
  moveMessageToBucket,
  listMessageBucketSlicesByIds,
} from "../stores/data";
import { showToast } from "../stores/ui";
import { BUCKET_LABEL, BUCKET_ICON } from "../utils/labels";
import type { MessageBucket } from "../types";

const BUCKETS: MessageBucket[] = [
  "imbox",
  "feed",
  "paperTrail",
  "trash",
  "spam",
];

export function MovePicker(props: {
  open: boolean;
  onClose: () => void;
  messageIds: string[];
  onChange?: () => void;
}) {
  // Only fetch id + bucket for the selected messages. The previous
  // shape called listMessages() (full body_html on every row) just
  // to filter by id and read m.bucket.
  const [messages] = createResource(
    () => props.messageIds,
    listMessageBucketSlicesByIds,
  );
  const [busy, setBusy] = createSignal(false);

  const targets = createMemo(() => messages() ?? []);

  const count = () => targets().length;

  // All selected messages are in the same bucket only if every target matches.
  const allInBucket = (bucket: MessageBucket) =>
    targets().length > 0 && targets().every((m) => m.bucket === bucket);

  const move = async (bucket: MessageBucket) => {
    if (busy()) return;
    // Snapshot the pre-move buckets so the toast can offer a real Undo
    // (Hey's core contract: every destructive action is reversible).
    const before = targets().map((m) => ({ id: m.id, bucket: m.bucket }));
    setBusy(true);
    try {
      for (const m of targets()) {
        await moveMessageToBucket(m.id, bucket);
      }
      props.onChange?.();
      showToast({
        message:
          count() > 1
            ? `已移动 ${count()} 封邮件到 ${BUCKET_LABEL[bucket] ?? bucket}`
            : `已移动到 ${BUCKET_LABEL[bucket] ?? bucket}`,
        kind: "success",
        action: {
          label: "撤销",
          run: async () => {
            for (const prev of before) {
              if (prev.bucket !== bucket) {
                await moveMessageToBucket(prev.id, prev.bucket);
              }
            }
            props.onChange?.();
            showToast({ message: "已撤销移动", kind: "success" });
          },
        },
      });
      props.onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={count() > 1 ? `移动到 · ${count()} 封邮件` : "移动到"}
      width="320px"
    >
      <div
        style={{
          padding: "var(--space-3) var(--space-5) var(--space-5)",
          display: "flex",
          "flex-direction": "column",
          gap: "4px",
        }}
      >
        <Show when={busy()}>
          <div
            style={{
              "font-size": "var(--text-caption)",
              color: "var(--text-muted)",
              padding: "0 12px var(--space-2)",
            }}
          >
            正在移动 {count()} 封邮件…
          </div>
        </Show>
        <For each={BUCKETS}>
          {(b) => {
            const active = allInBucket(b);
            return (
              <button
                onClick={() => move(b)}
                disabled={active || busy()}
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--space-3)",
                  padding: "10px 12px",
                  "border-radius": "var(--radius-md)",
                  background: active ? "var(--palm-soft)" : "transparent",
                  color: active ? "var(--palm)" : "var(--text-primary)",
                  "text-align": "left",
                  "font-size": "var(--text-body-sm)",
                  "font-weight": active ? "700" : "500",
                  opacity: active || busy() ? 0.6 : 1,
                  cursor: active || busy() ? "default" : "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.background = "var(--paper-mid)";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
                onFocus={(e) => {
                  if (!active) e.currentTarget.style.background = "var(--paper-mid)";
                }}
                onBlur={(e) => {
                  if (!active) e.currentTarget.style.background = "transparent";
                }}
              >
                <Icon name={BUCKET_ICON[b] ?? "ph-folder"} size={18} />
                <span style={{ flex: 1 }}>{BUCKET_LABEL[b] ?? b}</span>
                {active && <Icon name="ph-check" size={14} />}
              </button>
            );
          }}
        </For>
      </div>
    </Modal>
  );
}
