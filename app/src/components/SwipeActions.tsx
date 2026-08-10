/** Swipe-to-action wrapper for list rows.
 * Mirrors prototype-v11's wrapSwipeActions:
 * - drag the row left/right to reveal a colored action background
 * - pass the drag threshold to trigger the action and animate the row away
 * - taps/clicks still work if the user did not drag
 */

import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Icon } from "./Icon";

export interface SwipeActionDef {
  label: string;
  icon: string;
  color: "yellow" | "red" | "green" | "blue";
  onClick: () => void;
}

interface SwipeActionsProps {
  children: unknown;
  leftAction?: SwipeActionDef;
  rightAction?: SwipeActionDef;
  threshold?: number;
  maxDrag?: number;
  disabled?: boolean;
  style?: JSX.CSSProperties;
  role?: string;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace JSX {
  interface CSSProperties {
    [key: string]: string | number | undefined;
  }
}

const COLOR_STYLES: Record<
  SwipeActionDef["color"],
  { background: string; color: string }
> = {
  yellow: { background: "var(--canary)", color: "#b87200" },
  red: { background: "var(--peach)", color: "#c41e3a" },
  green: { background: "rgba(48,185,77,0.12)", color: "#237b31" },
  blue: { background: "var(--palm-soft)", color: "var(--palm)" },
};

export function SwipeActions(props: SwipeActionsProps) {
  let wrapRef: HTMLDivElement | undefined;
  let cardRef: HTMLDivElement | undefined;
  let startX = 0;
  let isDragging = false;
  let moved = false;
  let removed = false;

  const threshold = () => props.threshold ?? 80;
  const maxDrag = () => props.maxDrag ?? 160;
  const disabled = () => props.disabled ?? false;

  const [offset, setOffset] = createSignal(0);
  const [progress, setProgress] = createSignal(0);
  const [direction, setDirection] = createSignal<"left" | "right" | null>(null);

  const getX = (e: TouchEvent | MouseEvent) => {
    const touch =
      ("touches" in e && e.touches[0]?.clientX) ??
      ("changedTouches" in e && e.changedTouches[0]?.clientX);
    return typeof touch === "number" ? touch : (e as MouseEvent).clientX;
  };

  const start = (e: TouchEvent | MouseEvent) => {
    if (disabled() || removed) return;
    isDragging = true;
    moved = false;
    startX = getX(e);
  };

  const move = (e: TouchEvent | MouseEvent) => {
    if (!isDragging || disabled() || removed) return;
    const x = getX(e);
    const dx = x - startX;
    if (Math.abs(dx) > 4) moved = true;

    const clamped = Math.max(-maxDrag(), Math.min(maxDrag(), dx));
    const p = Math.min(Math.abs(clamped) / threshold(), 1);
    setOffset(clamped);
    setProgress(p);
    setDirection(clamped > 0 ? "right" : clamped < 0 ? "left" : null);
  };

  const commitAction = (action: SwipeActionDef) => {
    if (!cardRef || !wrapRef) return;
    removed = true;
    // Snap the row off-screen in the direction of the swipe.
    const sign = offset() >= 0 ? 1 : -1;
    cardRef.style.transform = `translateX(${sign * 120}%) rotate(${sign * 8}deg)`;
    cardRef.style.opacity = "0";

    // Collapse the wrapper height after the slide-out animation.
    setTimeout(() => {
      if (!wrapRef) return;
      wrapRef.style.height = `${wrapRef.offsetHeight}px`;
      wrapRef.style.transition =
        "height 0.25s var(--ease-out), opacity 0.2s var(--ease-out)";
      wrapRef.style.height = "0px";
      wrapRef.style.opacity = "0";
    }, 10);

    setTimeout(() => {
      action.onClick();
    }, 300);
  };

  const reset = () => {
    setOffset(0);
    setProgress(0);
    setDirection(null);
  };

  const end = () => {
    if (!isDragging || disabled() || removed) return;
    isDragging = false;

    if (offset() > threshold() && props.rightAction) {
      commitAction(props.rightAction);
      return;
    }
    if (offset() < -threshold() && props.leftAction) {
      commitAction(props.leftAction);
      return;
    }
    reset();
  };

  const onClickCapture = (e: MouseEvent) => {
    if (moved) {
      e.preventDefault();
      e.stopPropagation();
      moved = false;
    }
  };

  onMount(() => {
    if (!cardRef) return;
    cardRef.addEventListener("touchstart", start, { passive: true });
    cardRef.addEventListener("touchmove", move, { passive: true });
    cardRef.addEventListener("touchend", end, { passive: true });
    cardRef.addEventListener("touchcancel", end, { passive: true });
    cardRef.addEventListener("mousedown", start);
    cardRef.addEventListener("mousemove", move);
    cardRef.addEventListener("mouseup", end);
    cardRef.addEventListener("mouseleave", end);
    cardRef.addEventListener("click", onClickCapture, true);
  });

  onCleanup(() => {
    if (!cardRef) return;
    cardRef.removeEventListener("touchstart", start);
    cardRef.removeEventListener("touchmove", move);
    cardRef.removeEventListener("touchend", end);
    cardRef.removeEventListener("touchcancel", end);
    cardRef.removeEventListener("mousedown", start);
    cardRef.removeEventListener("mousemove", move);
    cardRef.removeEventListener("mouseup", end);
    cardRef.removeEventListener("mouseleave", end);
    cardRef.removeEventListener("click", onClickCapture, true);
  });

  const leftStyle = () => {
    const s = props.leftAction
      ? COLOR_STYLES[props.leftAction.color]
      : undefined;
    return {
      opacity: direction() === "left" ? progress() : 0,
      transform: `scale(${0.85 + (direction() === "left" ? progress() : 0) * 0.15})`,
      background: s?.background,
      color: s?.color,
    };
  };

  const rightStyle = () => {
    const s = props.rightAction
      ? COLOR_STYLES[props.rightAction.color]
      : undefined;
    return {
      opacity: direction() === "right" ? progress() : 0,
      transform: `scale(${0.85 + (direction() === "right" ? progress() : 0) * 0.15})`,
      background: s?.background,
      color: s?.color,
    };
  };

  return (
    <div
      ref={(el) => {
        wrapRef = el;
      }}
      role={props.role as never}
      style={{
        position: "relative",
        overflow: "hidden",
        "border-bottom": "1px solid var(--border)",
        ...(props.style ?? {}),
      }}
    >
      <Show when={props.leftAction}>
        {(action) => (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              "align-items": "center",
              padding: "0 18px",
              "justify-content": "flex-start",
              "pointer-events": "none",
              "font-size": "13px",
              "font-weight": "600",
              gap: "6px",
              transition:
                "opacity 0.15s var(--ease-out), transform 0.15s var(--ease-out)",
              ...leftStyle(),
            }}
          >
            <Icon name={action().icon} size={18} />
            {action().label}
          </div>
        )}
      </Show>

      <Show when={props.rightAction}>
        {(action) => (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              "align-items": "center",
              padding: "0 18px",
              "justify-content": "flex-end",
              "pointer-events": "none",
              "font-size": "13px",
              "font-weight": "600",
              gap: "6px",
              transition:
                "opacity 0.15s var(--ease-out), transform 0.15s var(--ease-out)",
              ...rightStyle(),
            }}
          >
            <Icon name={action().icon} size={18} />
            {action().label}
          </div>
        )}
      </Show>

      <div
        ref={(el) => {
          cardRef = el;
        }}
        style={{
          position: "relative",
          transform: `translateX(${offset()}px) rotate(${offset() * 0.04}deg)`,
          transition: isDragging
            ? "none"
            : "transform 0.28s var(--ease-out), opacity 0.2s var(--ease-out)",
          "background-color": "var(--paper-light)",
          "user-select": "none",
        }}
      >
        {props.children as never}
      </div>
    </div>
  );
}
