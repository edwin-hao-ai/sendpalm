/** MovePicker — modal to move one or more messages to another bucket. */

import { For, createResource, createMemo } from "solid-js";
import { Modal } from "./Modal";
import { Icon } from "./Icon";
import { moveMessageToBucket, listMessages } from "../stores/data";
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
  const [messages] = createResource(listMessages);

  const targets = createMemo(() =>
    (messages() ?? []).filter((m) => props.messageIds.includes(m.id)),
  );

  const count = () => targets().length;

  // All selected messages are in the same bucket only if every target matches.
  const allInBucket = (bucket: MessageBucket) =>
    targets().length > 0 && targets().every((m) => m.bucket === bucket);

  const move = async (bucket: MessageBucket) => {
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
    });
    props.onClose();
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
        <For each={BUCKETS}>
          {(b) => {
            const active = allInBucket(b);
            return (
              <button
                onClick={() => move(b)}
                disabled={active}
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
                  opacity: active ? 0.7 : 1,
                  cursor: active ? "default" : "pointer",
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
