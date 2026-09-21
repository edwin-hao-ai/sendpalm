/** Remind picker — quick presets + custom datetime for Bubble Up / Snooze.
 * Used from MessagePanel.
 */

import { Modal } from "../components/Modal";
import { Show, createSignal } from "solid-js";
import { Icon } from "../components/Icon";
import { addDays } from "../utils/date";
import { getMessage, upsertMessage } from "../stores/data";
import { showToast } from "../stores/ui";
import type { Message } from "../types";

interface PickerProps {
  open: boolean;
  onClose: () => void;
  msgId: string;
}

export interface RemindPreset {
  label: string;
  time: Date;
}

/** Preset list, aligned with the prototype's bubble-up choices
 * (prototype-v11.js:10716 — Now / Later today / Tomorrow / This weekend /
 * Next Monday). Times are computed from `now` so the function is pure and
 * testable. */
export function remindPresets(now: Date): RemindPreset[] {
  const laterToday = new Date(now);
  laterToday.setHours(18, 0, 0, 0);

  const tomorrow = addDays(now, 1);
  tomorrow.setHours(9, 0, 0, 0);

  const weekend = new Date(now);
  while (weekend.getDay() !== 6) weekend.setDate(weekend.getDate() + 1);
  weekend.setHours(9, 0, 0, 0);

  const monday = new Date(now);
  monday.setDate(monday.getDate() + ((8 - monday.getDay()) % 7 || 7));
  monday.setHours(9, 0, 0, 0);

  return [
    { label: "立即", time: new Date(now) },
    { label: "今天稍后 18:00", time: laterToday },
    { label: "明天 9:00", time: tomorrow },
    { label: "本周末 9:00", time: weekend },
    { label: "下周一 9:00", time: monday },
  ];
}

/** Human-friendly zh-CN time for the confirmation toast / preset subtitle. */
export function formatRemindTime(d: Date): string {
  return d.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function RemindPicker(props: PickerProps) {
  const [custom, setCustom] = createSignal("");
  const [busy, setBusy] = createSignal(false);

  const apply = async (when: Date) => {
    if (busy()) return;
    setBusy(true);
    try {
      const m = await getMessage(props.msgId);
      if (!m) {
        showToast({ message: "消息不存在", kind: "error" });
        return;
      }
      const updated: Message = { ...m, bubbleUpAt: when.toISOString() };
      await upsertMessage(updated);
      showToast({
        message: `已安排在 ${formatRemindTime(when)} 回浮`,
        kind: "success",
      });
      props.onClose();
      setCustom("");
    } finally {
      setBusy(false);
    }
  };

  const applyCustom = () => {
    if (!custom()) return;
    const d = new Date(custom());
    if (Number.isNaN(d.getTime()) || d <= new Date()) {
      showToast({ message: "时间必须晚于当前", kind: "error" });
      return;
    }
    void apply(d);
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="稍后提醒我"
      width="420px"
    >
      <p
        style={{
          "font-size": "var(--text-caption)",
          color: "var(--text-muted)",
          "margin-bottom": "var(--space-3)",
        }}
      >
        到时间后，消息会浮回 Imbox 顶部并通知你。
      </p>
      <div
        style={{
          display: "grid",
          gap: "var(--space-2)",
          "margin-bottom": "var(--space-4)",
        }}
      >
        {remindPresets(new Date()).map((p) => (
          <button
            disabled={busy()}
            onClick={() => void apply(p.time)}
            style={{
              display: "flex",
              "align-items": "center",
              gap: "var(--space-2)",
              padding: "var(--space-3)",
              background: "var(--paper-mid)",
              "border-radius": "var(--radius-md)",
              cursor: "pointer",
              "font-weight": "600",
              opacity: busy() ? 0.6 : 1,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--paper-dark)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--paper-mid)")
            }
            onFocus={(e) =>
              (e.currentTarget.style.background = "var(--paper-dark)")
            }
            onBlur={(e) =>
              (e.currentTarget.style.background = "var(--paper-mid)")
            }
          >
            <Icon name="ph-clock" size={14} />
            <span style={{ flex: 1 }}>{p.label}</span>
            <span
              style={{
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
              }}
            >
              {formatRemindTime(p.time)}
            </span>
          </button>
        ))}
      </div>
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
            disabled={busy()}
            onClick={applyCustom}
            style={{
              "margin-top": "var(--space-2)",
              padding: "6px 12px",
              background: "var(--palm)",
              color: "var(--paper-light)",
              "border-radius": "var(--radius-pill)",
              "font-size": "var(--text-caption)",
              "font-weight": "700",
            }}
          >
            确认
          </button>
        </Show>
      </label>
    </Modal>
  );
}
