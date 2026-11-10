/** Touch gesture helpers — swipe-to-action and long-press.
 * Spec: prototype-v11 §6 / mobile responsive plan.
 */

import { createEffect, createSignal, onCleanup, onMount, untrack } from "solid-js";
import { countsTick, refreshTick, softRefreshTick } from "../stores/ui";

/** Run `callback` only when the tick changes — never because of what the
 *  callback itself reads.
 *
 *  This is load-bearing, not tidiness. The callback runs inside the effect's
 *  tracking scope, so every signal it touches becomes a dependency. A caller
 *  that refetches a resource and then walks it (Topbar's sync badge refreshed
 *  the account list, then read the accounts to fetch their sync state) tracks
 *  that resource; each resolution re-ran the effect, refetching again. The
 *  result was an unbounded IPC loop from app start — measured at ~28,000
 *  `SELECT * FROM accounts` in half a second, one core pinned for the whole
 *  session, and every list in the app re-evaluating while the user was only
 *  opening a message.
 */
export function useRefreshEffect(callback: () => void) {
  createEffect(() => {
    // Accessed OUTSIDE `untrack`: this is the only dependency we want.
    refreshTick();
    untrack(callback);
  });
}

/** React to a change in the SQL aggregate counts only.
 *
 *  Subscribed by badge holders (sidebar rows, account tabs). It exists so
 *  "one message was read" does not have to borrow the soft tick, which
 *  refetches piles and the contact map and makes the list flash.
 */
export function useCountsRefreshEffect(callback: () => void) {
  createEffect(() => {
    countsTick();
    untrack(callback);
  });
}

/** React to a lightweight refresh tick that should not tear down the current
 *  view (e.g. a sync event that only affects counters/pile slices). */
export function useSoftRefreshEffect(callback: () => void) {
  createEffect(() => {
    softRefreshTick();
    untrack(callback);
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
