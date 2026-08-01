/** Touch gesture helpers — swipe-to-action and long-press.
 * Spec: prototype-v11 §6 / mobile responsive plan.
 */

import { createSignal, onCleanup, onMount } from "solid-js";

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

export function useLongPress(ref: HTMLElement | undefined, opts: LongPressOptions) {
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
  const [width, setWidth] = createSignal(typeof window !== "undefined" ? window.innerWidth : 1024);
  const [height, setHeight] = createSignal(typeof window !== "undefined" ? window.innerHeight : 768);

  onMount(() => {
    const onResize = () => {
      setWidth(window.innerWidth);
      setHeight(window.innerHeight);
    };
    window.addEventListener("resize", onResize);
    onCleanup(() => window.removeEventListener("resize", onResize));
  });

  return {
    width,
    height,
    isMobile: () => width() < 720,
    isTablet: () => width() >= 720 && width() < 1024,
    isDesktop: () => width() >= 1024,
  };
}