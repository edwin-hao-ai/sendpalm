/** PileSheet — the phone's 待处理 entry point.
 *
 *  On desktop the three workflow piles live in the sidebar (待处理 group).
 *  The phone tab bar only has room for six items, so the pills get one
 *  floating button that opens this sheet: three destinations plus the
 *  focused-reply flow. Same rows, same counts, one tap away.
 */

import { For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { Icon } from "./Icon";
import { setView, type ViewName } from "../stores/ui";

export interface PileSheetCounts {
  replyLater: number;
  setAside: number;
  bubbleUp: number;
}

const PILE_ROWS: Array<{
  view: ViewName;
  label: string;
  icon: string;
  key: keyof PileSheetCounts;
  hint: string;
}> = [
  {
    view: "replyLater",
    label: "稍后回复",
    icon: "ph-clock",
    key: "replyLater",
    hint: "等着你有空时回复的邮件",
  },
  {
    view: "setAside",
    label: "已搁置",
    icon: "ph-push-pin",
    key: "setAside",
    hint: "留作参考、稍后处理",
  },
  {
    view: "bubbleUp",
    label: "提醒",
    icon: "ph-arrow-fat-line-up",
    key: "bubbleUp",
    hint: "到点会回到收件箱顶部",
  },
];

export function PileSheet(props: {
  open: boolean;
  counts: PileSheetCounts;
  onClose: () => void;
}) {
  const go = (view: ViewName) => {
    props.onClose();
    setView(view);
  };
  const total = () =>
    props.counts.replyLater + props.counts.setAside + props.counts.bubbleUp;

  return (
    <Show when={props.open}>
      <Portal mount={document.body}>
        <div
          data-testid="pile-sheet"
          role="dialog"
          aria-label="待处理"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: "0",
            "z-index": "var(--z-modal)",
            background: "rgba(35,28,51,0.32)",
            "backdrop-filter": "blur(4px)",
            display: "flex",
            "align-items": "flex-end",
          }}
          onClick={props.onClose}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              background: "var(--glass-bg-strong)",
              "backdrop-filter": "var(--glass-blur)",
              "-webkit-backdrop-filter": "var(--glass-blur)",
              "border-radius": "var(--radius-xl) var(--radius-xl) 0 0",
              padding:
                "var(--space-2) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom))",
              "box-shadow": "0 -8px 32px rgba(0,0,0,0.16)",
              animation: "sheet-enter 0.28s var(--ease-out) both",
            }}
          >
            <div
              style={{
                width: "36px",
                height: "5px",
                "border-radius": "var(--radius-pill)",
                background: "var(--border-strong, var(--border))",
                margin: "var(--space-1) auto var(--space-3)",
              }}
            />
            <div
              style={{
                display: "flex",
                "align-items": "baseline",
                gap: "8px",
                "margin-bottom": "var(--space-2)",
              }}
            >
              <strong style={{ "font-size": "var(--text-body-sm)" }}>
                待处理
              </strong>
              <span
                style={{
                  "font-size": "var(--text-micro)",
                  color: "var(--text-muted)",
                }}
              >
                {total()} 封
              </span>
              <span style={{ flex: 1 }} />
              <button
                onClick={props.onClose}
                aria-label="关闭"
                style={{
                  width: "44px",
                  height: "44px",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  color: "var(--text-muted)",
                  "margin-right": "calc(-1 * var(--space-2))",
                }}
              >
                <Icon name="ph-x" size={16} />
              </button>
            </div>

            <For each={PILE_ROWS}>
              {(row) => {
                const count = () => props.counts[row.key];
                return (
                  <button
                    data-pile-sheet-row={row.view}
                    onClick={() => go(row.view)}
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "12px",
                      width: "100%",
                      "min-height": "56px",
                      padding: "10px 8px",
                      "border-radius": "var(--radius-md)",
                      "text-align": "left",
                      color: count() > 0 ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                  >
                    <Icon name={row.icon} size={20} />
                    <span style={{ flex: 1, "min-width": "0" }}>
                      <span
                        style={{
                          display: "block",
                          "font-size": "var(--text-body-sm)",
                          "font-weight": "700",
                        }}
                      >
                        {row.label}
                      </span>
                      <span
                        style={{
                          display: "block",
                          "font-size": "var(--text-micro)",
                          color: "var(--text-muted)",
                          "margin-top": "2px",
                        }}
                      >
                        {row.hint}
                      </span>
                    </span>
                    <span
                      style={{
                        "font-size": "var(--text-caption)",
                        "font-weight": "800",
                        "font-variant-numeric": "tabular-nums",
                      }}
                    >
                      {count()}
                    </span>
                    <Icon name="ph-caret-right" size={12} />
                  </button>
                );
              }}
            </For>

            <Show when={props.counts.replyLater > 0}>
              <button
                data-pile-sheet-focus
                onClick={() => go("focusReply")}
                style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  gap: "8px",
                  width: "100%",
                  "min-height": "44px",
                  "margin-top": "var(--space-2)",
                  background: "var(--palm)",
                  color: "white",
                  "border-radius": "var(--radius-lg)",
                  "font-size": "var(--text-body-sm)",
                  "font-weight": "700",
                }}
              >
                <Icon name="ph-target" size={16} color="white" />
                专注回复 {props.counts.replyLater}
              </button>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}
