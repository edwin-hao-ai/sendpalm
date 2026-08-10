/** Pull-to-refresh wrapper for mobile list views.
 *
 * Attaches to the scroll container and triggers `onRefresh` when the user
 * pulls down from the top past a threshold. Shows a palm-green spinner arrow
 * while pulling / refreshing. Desktop is a no-op.
 */

import type { JSX } from "solid-js";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Icon } from "./Icon";

const THRESHOLD = 80;
const MAX_PULL = 120;

interface PullToRefreshProps {
  container: HTMLElement | undefined;
  onRefresh: () => void | Promise<void>;
  enabled?: boolean;
  children: JSX.Element;
}

export function PullToRefresh(props: PullToRefreshProps) {
  const [pulling, setPulling] = createSignal(false);
  const [distance, setDistance] = createSignal(0);
  const [refreshing, setRefreshing] = createSignal(false);

  let startY = 0;
  let startX = 0;
  let active = false;

  const canPull = () =>
    props.enabled !== false &&
    props.container &&
    props.container.scrollTop <= 0;

  const onTouchStart = (e: TouchEvent) => {
    if (!canPull()) return;
    const t = e.touches[0];
    if (!t) return;
    startY = t.clientY;
    startX = t.clientX;
    active = true;
    setPulling(true);
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!active || !props.container) return;
    const t = e.touches[0];
    if (!t) return;
    const dy = t.clientY - startY;
    const dx = t.clientX - startX;

    // Ignore horizontal-dominant gestures.
    if (Math.abs(dx) > Math.abs(dy)) return;

    if (dy > 0 && props.container.scrollTop <= 0) {
      // Resist the pull so it feels elastic.
      const d = Math.min(dy * 0.6, MAX_PULL);
      setDistance(d);
      if (d > 0) {
        // Prevent native overscroll bounce from competing.
        e.preventDefault();
      }
    }
  };

  const onTouchEnd = async () => {
    if (!active) return;
    active = false;
    setPulling(false);

    if (distance() >= THRESHOLD && !refreshing()) {
      setRefreshing(true);
      try {
        await props.onRefresh();
      } finally {
        // Animate the indicator back up after a short hold.
        setTimeout(() => {
          setRefreshing(false);
          setDistance(0);
        }, 400);
      }
    } else {
      setDistance(0);
    }
  };

  onMount(() => {
    const el = props.container;
    if (!el) return;
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    onCleanup(() => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    });
  });

  const progress = () => Math.min(distance() / THRESHOLD, 1);
  const indicatorY = () =>
    refreshing() ? 0 : Math.max(0, distance() - THRESHOLD + 20);

  return (
    <>
      <Show
        when={props.container && (pulling() || refreshing() || distance() > 0)}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "60px",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            "pointer-events": "none",
            transform: `translateY(${indicatorY()}px)`,
            transition:
              pulling() || refreshing()
                ? "none"
                : "transform 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
            "z-index": 5,
          }}
        >
          <div
            style={{
              width: "32px",
              height: "32px",
              "border-radius": "50%",
              background: "var(--palm-soft)",
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
              transform: refreshing()
                ? "rotate(360deg)"
                : `rotate(${progress() * 180 - 180}deg)`,
              transition: refreshing()
                ? "transform 0.6s linear"
                : pulling()
                  ? "none"
                  : "transform 0.28s var(--ease-out)",
            }}
          >
            <Icon
              name={refreshing() ? "ph-spinner" : "ph-arrow-down"}
              size={16}
              style={{ color: "var(--palm)" }}
            />
          </div>
        </div>
      </Show>
      {props.children}
    </>
  );
}
