/** Remind picker — quick presets + custom datetime for Bubble Up / Snooze.
 * Used from MessagePanel.
 */

import { Modal } from "../components/Modal";
import { Show, createSignal } from "solid-js";
import { Icon } from "../components/Icon";
import { addDays, addHours } from "../utils/date";
import { upsertMessage } from "../stores/data";
import { showToast } from "../stores/ui";

interface PickerProps {
  open: boolean;
  onClose: () => void;
  msgId: string;
}

const PRESETS = [
  { label: "Now", time: () => new Date() },
  { label: "1 hour", time: () => addHours(new Date(), 1) },
  { label: "3 hours", time: () => addHours(new Date(), 3) },
  { label: "Tomorrow 9 AM", time: () => { const d = addDays(new Date(), 1); d.setHours(9, 0, 0, 0); return d; } },
  { label: "Monday 9 AM", time: () => { const d = new Date(); const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? 1 : (8 - day))); d.setHours(9, 0, 0, 0); return d; } },
];

export function RemindPicker(props: PickerProps) {
  const [custom, setCustom] = createSignal("");

  const apply = async (when: Date) => {
    await upsertMessage({ id: props.msgId, bubbleUpAt: when.toISOString() } as any);
    showToast({ message: `已安排在 ${when.toLocaleString()} 回浮`, kind: "success" });
    props.onClose();
    setCustom("");
  };

  const applyCustom = () => {
    if (!custom()) return;
    const d = new Date(custom());
    if (Number.isNaN(d.getTime()) || d <= new Date()) {
      showToast({ message: "时间必须晚于当前", kind: "error" });
      return;
    }
    apply(d);
  };

  return (
    <Modal open={props.open} onClose={props.onClose} title="Remind me later" width="420px">
      <Show when={true}>
        <p style={{ "font-size": "var(--text-caption)", color: "var(--text-muted)", "margin-bottom": "var(--space-3)" }}>
          到时间后，消息会浮回 Imbox 顶部并通知你。
        </p>
        <div style={{ display: "grid", gap: "var(--space-2)", "margin-bottom": "var(--space-4)" }}>
          {PRESETS.map((p) => (
            <button
              onClick={() => apply(p.time())}
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
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper-dark)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--paper-mid)")}
            >
              <Icon name="ph-clock" size={14} />
              <span style={{ flex: 1 }}>{p.label}</span>
              <span style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)" }}>
                {p.time().toLocaleString()}
              </span>
            </button>
          ))}
        </div>
        <label style={{ display: "block" }}>
          <span style={{ display: "block", "font-size": "var(--text-micro)", color: "var(--text-muted)", "font-weight": "700", "margin-bottom": "4px" }}>自定义时间</span>
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
      </Show>
    </Modal>
  );
}