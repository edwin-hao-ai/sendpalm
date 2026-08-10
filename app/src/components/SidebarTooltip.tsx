import { Show } from "solid-js";

export interface AnchorRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface TooltipPosition {
  left: number;
  top: number;
}

/** Pure helper: given the anchor rect and the tooltip size, return the
 *  coordinates to render the tooltip. Flips below the anchor when the
 *  top edge is too close. */
export function tooltipPosition(
  anchor: AnchorRect,
  side: "right" | "below",
  _tooltipWidth: number,
  tooltipHeight: number,
): TooltipPosition {
  const gap = 8;
  if (side === "right" && anchor.top >= gap) {
    return {
      left: anchor.right + gap,
      top: anchor.top + (anchor.height - tooltipHeight) / 2,
    };
  }
  return {
    left: anchor.left,
    top: anchor.bottom + gap,
  };
}

export function SidebarTooltip(props: {
  anchor: AnchorRect | null;
  label: string;
  hint?: string;
}) {
  return (
    <Show when={props.anchor}>
      {(rect) => {
        const pos = tooltipPosition(rect(), "right", 140, 32);
        return (
          <div
            role="tooltip"
            data-testid="sidebar-tooltip"
            style={{
              position: "fixed",
              left: `${pos.left}px`,
              top: `${pos.top}px`,
              display: "inline-flex",
              "align-items": "center",
              gap: "var(--space-2)",
              padding: "6px 10px",
              background: "var(--ink)",
              color: "var(--paper)",
              "border-radius": "var(--radius-md)",
              "font-size": "var(--text-caption)",
              "font-weight": "600",
              "box-shadow": "var(--shadow-lg)",
              "z-index": "var(--z-popover)",
              "pointer-events": "none",
              animation: "tooltip-fade 120ms var(--ease-out) both",
            }}
          >
            <span>{props.label}</span>
            <Show when={props.hint}>
              <span
                style={{
                  "font-size": "var(--text-micro)",
                  opacity: 0.7,
                }}
              >
                {props.hint}
              </span>
            </Show>
          </div>
        );
      }}
    </Show>
  );
}