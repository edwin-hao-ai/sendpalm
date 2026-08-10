/** Follow-up picker — quick presets + custom datetime.
 * Used from MessagePanel.
 */

import { Modal } from "../components/Modal";
import { Show, createSignal } from "solid-js";
import { Icon } from "../components/Icon";
import { addDays } from "../utils/date";
import type { FollowUp } from "../types";
import { upsertFollowUp } from "../stores/data";
import { uid } from "../utils/id";
import { showToast } from "../stores/ui";

interface PickerProps {
  open: boolean;
  onClose: () => void;
  msgId: string;
  onCreated?: () => void;
}

const PRESETS = [
  { label: "1 天", days: 1 },
  { label: "3 天", days: 3 },
  { label: "1 周", days: 7 },
  { label: "2 周", days: 14 },
];

export function FollowUpPicker(props: PickerProps) {
  const [custom, setCustom] = createSignal("");
  const [note, setNote] = createSignal("");

  const apply = async (dueAt: Date) => {
    const fu: FollowUp = {
      id: uid("fu"),
      msgId: props.msgId,
      dueAt: dueAt.toISOString(),
      status: "pending",
      note: note().trim() || undefined,
    };
    await upsertFollowUp(fu);
    showToast({
      message: `跟进已设 · ${dueAt.toLocaleDateString()}`,
      kind: "success",
    });
    props.onCreated?.();
    props.onClose();
    setNote("");
    setCustom("");
  };

  const applyCustom = () => {
    if (!custom()) return;
    const d = new Date(custom());
    if (Number.isNaN(d.getTime())) {
      showToast({ message: "时间格式无效", kind: "error" });
      return;
    }
    apply(d);
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="设置跟进"
      width="420px"
    >
      <Show when={true}>
        <p
          style={{
            "font-size": "var(--text-caption)",
            color: "var(--text-muted)",
            "margin-bottom": "var(--space-3)",
          }}
        >
          到期时会在 Imbox 顶部浮起并发出通知。
        </p>
        <div
          style={{
            display: "grid",
            "grid-template-columns": "repeat(2, 1fr)",
            gap: "var(--space-2)",
            "margin-bottom": "var(--space-4)",
          }}
        >
          {PRESETS.map((p) => (
            <button
              onClick={() => apply(addDays(new Date(), p.days))}
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--space-2)",
                padding: "var(--space-3)",
                background: "var(--paper-mid)",
                "border-radius": "var(--radius-md)",
                cursor: "pointer",
                "font-weight": "600",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "var(--paper-dark)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "var(--paper-mid)")
              }
            >
              <Icon name="ph-clock" size={14} />
              {p.label} 后
            </button>
          ))}
        </div>
        <label style={{ display: "block", "margin-bottom": "var(--space-3)" }}>
          <span
            style={{
              display: "block",
              "font-size": "var(--text-micro)",
              color: "var(--text-muted)",
              "font-weight": "700",
              "margin-bottom": "4px",
            }}
          >
            自定义时间
          </span>
          <input
            type="datetime-local"
            value={custom()}
            onInput={(e) => setCustom(e.currentTarget.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              "border-radius": "var(--radius-md)",
              border: "0.5px solid var(--border)",
              "font-size": "var(--text-body-sm)",
            }}
          />
          <Show when={custom()}>
            <button
              onClick={applyCustom}
              style={{
                "margin-top": "var(--space-2)",
                padding: "6px 12px",
                background: "var(--palm)",
                color: "white",
                "border-radius": "var(--radius-pill)",
                "font-size": "var(--text-caption)",
                "font-weight": "700",
              }}
            >
              确认
            </button>
          </Show>
        </label>
        <label style={{ display: "block" }}>
          <span
            style={{
              display: "block",
              "font-size": "var(--text-micro)",
              color: "var(--text-muted)",
              "font-weight": "700",
              "margin-bottom": "4px",
            }}
          >
            备注（可选）
          </span>
          <input
            value={note()}
            onInput={(e) => setNote(e.currentTarget.value)}
            placeholder="等回信或再确认"
            style={{
              width: "100%",
              padding: "8px 12px",
              "border-radius": "var(--radius-md)",
              border: "0.5px solid var(--border)",
              "font-size": "var(--text-body-sm)",
            }}
          />
        </label>
      </Show>
    </Modal>
  );
}
