/** Touch gesture helpers — swipe-to-action and long-press.
 * Spec: prototype-v11 §6 / mobile responsive plan.
 */

import { createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { refreshTick, softRefreshTick } from "../stores/ui";

/** React to a global refresh tick (e.g. backend sync events). */
export function useRefreshEffect(callback: () => void) {
  createEffect(() => {
    // Access the tick so this effect re-runs when it changes.
    const _ = refreshTick();
    void _;
    callback();
  });
}

/** React to a lightweight refresh tick that should not tear down the current
 *  view (e.g. a sync event that only affects counters/pile slices). */
export function useSoftRefreshEffect(callback: () => void) {
  createEffect(() => {
    const _ = softRefreshTick();
    void _;
    callback();
  });
}

interface SwipeOptions {
  threshold?: number;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}

export function useSwipe(ref: HTMLElement | undefined, opts: SwipeOptions) {
  let startX = 0;
  let startY = 0;
  let active = false;

  const onTouchStart = (e: TouchEvent) => {
    if (!ref) return;
    const t = e.touches[0];
    if (!t) return;
    startX = t.clientX;
    startY = t.clientY;
    active = true;
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (!active || !ref) return;
    active = false;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) < (opts.threshold ?? 80)) return;
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) opts.onSwipeLeft?.();
    else opts.onSwipeRight?.();
  };

  onMount(() => {
    if (!ref) return;
    ref.addEventListener("touchstart", onTouchStart, { passive: true });
    ref.addEventListener("touchend", onTouchEnd, { passive: true });
  });
  onCleanup(() => {
    if (!ref) return;
    ref.removeEventListener("touchstart", onTouchStart);
    ref.removeEventListener("touchend", onTouchEnd);
  });
}

interface LongPressOptions {
  delay?: number;
  onLongPress: () => void;
}

export function useLongPress(
  ref: HTMLElement | undefined,
  opts: LongPressOptions,
) {
  let timer: number | undefined;

  const start = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = window.setTimeout(() => {
      opts.onLongPress();
      timer = undefined;
    }, opts.delay ?? 500);
  };
  const cancel = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  onMount(() => {
    if (!ref) return;
    ref.addEventListener("touchstart", start, { passive: true });
    ref.addEventListener("touchend", cancel, { passive: true });
    ref.addEventListener("touchcancel", cancel, { passive: true });
    ref.addEventListener("mousedown", start);
    ref.addEventListener("mouseup", cancel);
    ref.addEventListener("mouseleave", cancel);
  });
  onCleanup(() => {
    if (!ref) return;
    ref.removeEventListener("touchstart", start);
    ref.removeEventListener("touchend", cancel);
    ref.removeEventListener("touchcancel", cancel);
    ref.removeEventListener("mousedown", start);
    ref.removeEventListener("mouseup", cancel);
    ref.removeEventListener("mouseleave", cancel);
  });
}

/** Reactive viewport helper. */
export function useViewport() {
  const [width, setWidth] = createSignal(
    typeof window !== "undefined" ? window.innerWidth : 1024,
  );
  const [height, setHeight] = createSignal(
    typeof window !== "undefined" ? window.innerHeight : 768,
  );

  onMount(() => {
    const onResize = () => {
      setWidth(window.innerWidth);
      setHeight(window.innerHeight);
    };
    // Correct the SSR fallback immediately so the first paint on iOS/WKWebView
    // already uses the real viewport width instead of the desktop default.
    onResize();
    window.addEventListener("resize", onResize);
    onCleanup(() => window.removeEventListener("resize", onResize));
  });

  return {
    width,
    height,
    isMobile: () => width() < 768,
    isTablet: () => width() >= 768 && width() < 1024,
    isDesktop: () => width() >= 1024,
  };
}
