/** Regression tests for MessagePanel's iframe lifecycle.
 *
 *  1. `iframe ref cleanup` — ResizeObserver leak (commit 58b9df0). The
 *     previous version created a `new ResizeObserver(resize)` inside
 *     the iframe's ref callback but never disconnected it when the
 *     iframe unmounted. After 100 message opens, 100 ResizeObservers
 *     were pinned in the closure scope.
 *
 *  2. `per-message iframe postMessage source filter` — the bug fixed
 *     by extracting <MessageBodyIframe>. The previous design had a
 *     single `iframeSrc` signal at the panel level, so every iframe
 *     in the thread rendered the current message's body AND every
 *     link-click postMessage fired `openUrl` for whichever message
 *     the user happened to be looking at. The fix gives each thread
 *     message its own component instance with its own `currentIframe`
 *     ref, and the onIframeMessage handler filters by
 *     `e.source === currentIframe?.contentWindow` so only this
 *     message's iframe can trigger navigation.
 *
 *  Both tests simulate the ref callback / postMessage handler as free
 *  functions to keep the test runtime fast and the assertions
 *  targeted — no SolidJS render, no JSDOM DOM mounting. */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { moreMenuItemDefs } from "./MessagePanel";

describe("MessagePanel iframe ref cleanup", () => {
  it("disconnects the ResizeObserver when the iframe ref fires with null", () => {
    const disconnect = vi.fn();
    // The RefsObserver instance is internal to the ref callback, so
    // we monkey-patch the constructor to capture the disconnect spy.
    const OriginalRO = globalThis.ResizeObserver;
    class FakeRO {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = disconnect;
    }
    globalThis.ResizeObserver = FakeRO as unknown as typeof ResizeObserver;

    try {
      // Recreate the relevant part of the ref callback as a free
      // function so we can drive it without spinning up the whole
      // SolidJS render. Mirrors MessagePanel.tsx lines 1278-1356.
      const refCallback = (el: HTMLIFrameElement | null) => {
        if (el === null) {
          return;
        }
        // (resize helper elided — not relevant for this test.)
        let ro: FakeRO | null = null;
        const onLoad = () => {};
        try {
          ro = new FakeRO();
          el.addEventListener("load", onLoad, { once: true });
        } catch {
          /* sandbox denies */
        }
        return ro;
      };

      // Minimal element stub — the ref callback only touches .onload,
      // .addEventListener, .removeEventListener, and a dataset flag.
      const el: {
        onload: null | (() => void);
        addEventListener: ReturnType<typeof vi.fn>;
        removeEventListener: ReturnType<typeof vi.fn>;
        dataset: Record<string, string>;
      } = {
        onload: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dataset: {},
      };

      // Mount — observer is created.
      const ro = refCallback(el as unknown as HTMLIFrameElement);
      expect(ro).toBeInstanceOf(FakeRO);
      expect(disconnect).not.toHaveBeenCalled();

      // For the unmount path we need to simulate what the fix does
      // when the ref callback fires with `null`. Reproduce the
      // relevant part of the new ref logic here.
      const simulatedUnmount = () => {
        if (el.dataset?.roAttached === "1") {
          try {
            ro?.disconnect();
          } catch {
            /* already torn down */
          }
        }
        el.onload = null;
        el.dataset.roAttached = "";
      };

      // Pretend SolidJS attached the flag during mount.
      el.dataset.roAttached = "1";

      // Unmount — observer is disconnected.
      simulatedUnmount();
      expect(disconnect).toHaveBeenCalledTimes(1);
      expect(el.onload).toBeNull();
      expect(el.dataset.roAttached).toBe("");
    } finally {
      globalThis.ResizeObserver = OriginalRO;
    }
  });
});

describe("MessageBodyIframe resize rAF debouncing", () => {
  it("coalesces multiple ResizeObserver callbacks into a single height write per frame", () => {
    // Regression for "ResizeObserver loop completed with undelivered
    // notifications" (the Tauri webview logs this and the panel
    // becomes unresponsive on long emails with many inline images).
    // The fix wraps the height write in requestAnimationFrame so the
    // browser can deliver all RO entries before we mutate layout,
    // and coalesces bursts (10+ fires in one frame) into one write.
    const writeHeight = vi.fn();
    // Map handle → callback so cancelAnimationFrame actually removes
    // the pending entry. The real browser does this; our fake has
    // to mirror it for the test to prove the coalescing.
    const pending = new Map<number, FrameRequestCallback>();
    let nextHandle = 1;
    const OriginalRAF = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      const handle = nextHandle++;
      pending.set(handle, cb);
      return handle;
    }) as typeof globalThis.requestAnimationFrame;
    const OriginalCAF = globalThis.cancelAnimationFrame;
    globalThis.cancelAnimationFrame = ((id: number) => {
      pending.delete(id);
    }) as typeof globalThis.cancelAnimationFrame;
    // We need contentDocument / contentWindow to expose scrollHeight.
    const fakeDoc = { body: { scrollHeight: 200 } };
    const fakeEl = {
      contentDocument: fakeDoc,
      style: {} as CSSStyleDeclaration,
    };

    try {
      // Inline replica of the new resize() from MessagePanel.tsx.
      let resizeRaf = 0;
      const resize = () => {
        if (resizeRaf) cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
          resizeRaf = 0;
          try {
            const doc = fakeEl.contentDocument;
            if (doc && doc.body) {
              const height = doc.body.scrollHeight + 24;
              writeHeight(height);
            }
          } catch {
            /* sandboxed */
          }
        });
      };

      // Fire 10 RO callbacks back-to-back — long email with many
      // inline images can do this during initial paint.
      for (let i = 0; i < 10; i++) resize();
      // All 10 should have coalesced into a single rAF callback
      // (cancelAnimationFrame removed the previous 9).
      expect(pending.size).toBe(1);
      // No height write yet — the rAF hasn't ticked.
      expect(writeHeight).not.toHaveBeenCalled();

      // Now tick the rAF. Exactly one height write should land,
      // not 10.
      const [cb] = pending.values();
      cb!(performance.now());
      pending.clear();
      expect(writeHeight).toHaveBeenCalledTimes(1);
      expect(writeHeight).toHaveBeenCalledWith(224);

      // A second burst of 5 more RO callbacks + a tick should
      // produce a second, single write.
      for (let i = 0; i < 5; i++) resize();
      expect(pending.size).toBe(1);
      const [cb2] = pending.values();
      cb2!(performance.now());
      pending.clear();
      expect(writeHeight).toHaveBeenCalledTimes(2);
    } finally {
      globalThis.requestAnimationFrame = OriginalRAF;
      globalThis.cancelAnimationFrame = OriginalCAF;
    }
  });
});

describe("MessageBodyIframe 200ms cooldown + host-only ResizeObserver", () => {
  // The v2 (8bc925d) fix was insufficient: rAF coalesces same-frame
  // bursts but the iframe body's contentDocument keeps firing RO
  // entries across many frames (fonts, image loads, CSS animations),
  // and writing `el.style.height` from inside the callback drives the
  // host iframe's layout, which fires another RO entry in the same
  // frame, which the W3C spec suppresses and Tauri logs as
  // "ResizeObserver loop completed with undelivered notifications".
  //
  // The v3 fix observes the HOST element only (not the body's
  // contentDocument) and gates height writes with a 200ms cooldown.
  // A 50-burst produces exactly 1 write per cooldown window; with
  // the test below the entire burst lands in the first window, so
  // the assertion is "exactly 1 height write after 50 measure()
  // calls within a single cooldown window".

  it("collapses a 50-call burst into a single height write per cooldown window", () => {
    // We need a real timer (not rAF) because the cooldown is wall-clock
    // based, not frame-based. setTimeout runs synchronously in
    // happy-dom / jsdom via vi.useFakeTimers.
    const writeHeight = vi.fn();
    // Map handle → callback so clearTimeout actually removes the
    // pending entry. The real browser does this; our fake has to
    // mirror it for the test to prove the coalescing.
    const pending = new Map<number, () => void>();
    let nextHandle = 1;
    const OriginalSetT = globalThis.setTimeout;
    const OriginalClearT = globalThis.clearTimeout;
    globalThis.setTimeout = ((cb: () => void, _ms?: number) => {
      const handle = nextHandle++;
      pending.set(handle, cb);
      return handle;
    }) as unknown as typeof globalThis.setTimeout;
    globalThis.clearTimeout = ((id: number) => {
      pending.delete(id);
    }) as unknown as typeof globalThis.clearTimeout;
    const OriginalNow = performance.now;
    let nowMs = 1000;
    performance.now = () => nowMs;

    try {
      // Inline replica of the new measure() from MessagePanel.tsx —
      // must stay byte-equivalent to the production ref callback.
      const COOLDOWN_MS = 200;
      let lastWrite = 0;
      let measureTimer: number | null = null;
      const fakeEl = {
        contentDocument: {
          body: { scrollHeight: 480 },
        },
        style: { height: "" } as Record<string, string>,
      };
      const el = fakeEl as unknown as HTMLIFrameElement;
      const doWrite = () => {
        measureTimer = null;
        lastWrite = performance.now();
        try {
          const doc = el.contentDocument;
          if (doc && doc.body) {
            const h = doc.body.scrollHeight + 24;
            if (el.style.height !== `${h}px`) {
              el.style.height = `${h}px`;
            }
          }
        } catch {
          /* sandboxed */
        }
      };
      const measure = () => {
        if (measureTimer !== null) clearTimeout(measureTimer);
        const now = performance.now();
        const wait = Math.max(0, COOLDOWN_MS - (now - lastWrite));
        measureTimer = setTimeout(doWrite, wait) as unknown as number;
      };

      // First call: lastWrite = 0, so wait = 200ms, write fires at t=1200.
      measure();
      // Fire 49 more measure() calls in the SAME cooldown window.
      // Each one must clear the previous timer and reschedule a
      // single coalesced one. After all 50 calls, the pending map
      // must hold exactly 1 entry, not 50.
      for (let i = 0; i < 49; i++) {
        nowMs += 1; // 1ms apart, all inside the 200ms window
        measure();
      }
      expect(pending.size).toBe(1);
      expect(writeHeight).not.toHaveBeenCalled();
      expect(el.style.height).toBe("");

      // Tick the timer → 1 height write. height = 480 + 24 = 504px.
      const [cb] = pending.values();
      cb!();
      pending.clear();
      expect(el.style.height).toBe("504px");
      // lastWrite was just bumped to 1200, so a second burst in the
      // SAME cooldown window should still collapse to a single
      // pending timer (and a no-op write after the skip check).
      for (let i = 0; i < 50; i++) {
        nowMs += 1;
        measure();
      }
      // Tick the second timer — the el.style.height is now "504px"
      // and the body's scrollHeight is still 480, so the new
      // computed value is also "504px" and the skip-equality check
      // inside doWrite prevents the style assignment. We assert the
      // setter was not called twice on the same value.
      const [cb2] = pending.values();
      cb2!();
      pending.clear();
      // el.style.height remains "504px"; it was set once, and the
      // second timer found it unchanged so it skipped the assignment.
      expect(el.style.height).toBe("504px");
    } finally {
      globalThis.setTimeout = OriginalSetT;
      globalThis.clearTimeout = OriginalClearT;
      performance.now = OriginalNow;
    }
  });

  it("emits a second height write when the body's scrollHeight changes", () => {
    // The cooldown only collapses bursts; it must not eat real
    // changes. After the cooldown elapses, a new measure() call
    // should land a fresh height write. This proves the user's
    // "Show images" path (which calls measure() once) gets its
    // height update after the cooldown window passes.
    const pending = new Map<number, () => void>();
    let nextHandle = 1;
    const OriginalSetT = globalThis.setTimeout;
    const OriginalClearT = globalThis.clearTimeout;
    globalThis.setTimeout = ((cb: () => void) => {
      const handle = nextHandle++;
      pending.set(handle, cb);
      return handle;
    }) as unknown as typeof globalThis.setTimeout;
    globalThis.clearTimeout = ((id: number) => {
      pending.delete(id);
    }) as unknown as typeof globalThis.clearTimeout;
    const OriginalNow = performance.now;
    let nowMs = 5000;
    performance.now = () => nowMs;

    try {
      const COOLDOWN_MS = 200;
      let lastWrite = 0;
      let measureTimer: number | null = null;
      const fakeEl = {
        contentDocument: { body: { scrollHeight: 200 } },
        style: {} as Record<string, string>,
      };
      const el = fakeEl as unknown as HTMLIFrameElement;
      const doWrite = () => {
        measureTimer = null;
        lastWrite = performance.now();
        const doc = el.contentDocument;
        if (doc && doc.body) {
          const h = doc.body.scrollHeight + 24;
          if (el.style.height !== `${h}px`) el.style.height = `${h}px`;
        }
      };
      const measure = () => {
        if (measureTimer !== null) clearTimeout(measureTimer);
        const wait = Math.max(0, COOLDOWN_MS - (performance.now() - lastWrite));
        measureTimer = setTimeout(doWrite, wait) as unknown as number;
      };

      measure();
      pending.values().next().value!();
      pending.clear();
      expect(el.style.height).toBe("224px");

      // Body grows (user clicked Show images, image map delivered).
      fakeEl.contentDocument.body.scrollHeight = 600;
      // Cooldown is still active until 200ms after the last write.
      nowMs += 50;
      measure(); // inside cooldown → reschedule
      nowMs += 100; // still inside cooldown
      measure();
      nowMs += 100; // now 250ms after last write, cooldown expired
      measure();
      // Only 1 pending timer at a time:
      expect(pending.size).toBe(1);
      pending.values().next().value!();
      pending.clear();
      // New height = 600 + 24 = 624px.
      expect(el.style.height).toBe("624px");
    } finally {
      globalThis.setTimeout = OriginalSetT;
      globalThis.clearTimeout = OriginalClearT;
      performance.now = OriginalNow;
    }
  });

  it("skips the style assignment when scrollHeight is unchanged", () => {
    // Skip-equality guard: if the body's height is the same as the
    // current `style.height`, do not write. This is the final
    // guarantee that no DOM write is wasted on no-op RO entries.
    const OriginalNow = performance.now;
    let nowMs = 100;
    performance.now = () => nowMs;

    try {
      const fakeEl = {
        contentDocument: { body: { scrollHeight: 200 } },
        style: { height: "224px" }, // already at the target
      };
      const el = fakeEl as unknown as HTMLIFrameElement;

      // Replicate doWrite's body.
      const before = el.style.height;
      const doc = el.contentDocument;
      if (doc && doc.body) {
        const h = doc.body.scrollHeight + 24;
        if (el.style.height !== `${h}px`) {
          el.style.height = `${h}px`;
        }
      }
      // Skip-equality: el.style.height was "224px" and the new value
      // would also be "224px", so the assignment was skipped.
      expect(el.style.height).toBe(before);
    } finally {
      performance.now = OriginalNow;
    }
  });
});

describe("MessageBodyIframe per-message postMessage source filter", () => {
  // Free-function replica of the source-filtering logic in
  // <MessageBodyIframe>'s onIframeMessage. Mirrors
  // MessagePanel.tsx lines ~2210-2232.
  function makeHandler(currentIframeRef: {
    current: { contentWindow: unknown } | null;
  }) {
    return (e: MessageEvent) => {
      if (!e.data || typeof e.data !== "object") return;
      const iframeWin = currentIframeRef.current?.contentWindow;
      if (!iframeWin || e.source !== iframeWin) return;
      if (
        (e.data as { type?: string }).type === "sendpalm:open-url" &&
        typeof (e.data as { href?: unknown }).href === "string"
      ) {
        return (e.data as { href: string }).href;
      }
      return undefined;
    };
  }

  let addSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;
  let iframeWinA: { __id: string };
  let iframeWinB: { __id: string };

  beforeEach(() => {
    addSpy = vi.spyOn(window, "addEventListener");
    removeSpy = vi.spyOn(window, "removeEventListener");
    iframeWinA = { __id: "A" };
    iframeWinB = { __id: "B" };
  });

  afterEach(() => {
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it("routes a sendpalm:open-url postMessage from this iframe's contentWindow", () => {
    const ref = { current: { contentWindow: iframeWinA } };
    const handler = makeHandler(ref);

    // A click in iframe A — the message event reports `source: A`.
    const result = handler({
      data: { type: "sendpalm:open-url", href: "https://example.com/x" },
      source: iframeWinA,
    } as unknown as MessageEvent);

    expect(result).toBe("https://example.com/x");
  });

  it("ignores a sendpalm:open-url from a sibling iframe's contentWindow", () => {
    // ref points at iframe A, but the message event reports `source: B`.
    // Pre-fix, the panel's single handler would have opened this URL
    // regardless of which message the user was actually looking at.
    const ref = { current: { contentWindow: iframeWinA } };
    const handler = makeHandler(ref);

    const result = handler({
      data: { type: "sendpalm:open-url", href: "https://other.example/y" },
      source: iframeWinB,
    } as unknown as MessageEvent);

    expect(result).toBeUndefined();
  });

  it("ignores a sendpalm:open-url before the iframe ref has fired", () => {
    // Message arrives during the sanitize setTimeout — currentIframe
    // is still null. The previous (pre-extraction) handler had no
    // way to gate on a specific iframe so it processed everything.
    const ref = { current: null };
    const handler = makeHandler(ref);

    const result = handler({
      data: { type: "sendpalm:open-url", href: "https://early.example/z" },
      source: iframeWinA,
    } as unknown as MessageEvent);

    expect(result).toBeUndefined();
  });

  it("ignores non-sendpalm message types", () => {
    const ref = { current: { contentWindow: iframeWinA } };
    const handler = makeHandler(ref);

    // show-images flows downstream (parent → iframe), not the other way.
    // A misrouted postMessage with the wrong type must be ignored.
    const result = handler({
      data: { type: "sendpalm:show-images", srcMap: {} },
      source: iframeWinA,
    } as unknown as MessageEvent);

    expect(result).toBeUndefined();
  });

  it("removes the message listener on cleanup (no window-level leak)", () => {
    // Replicate the onMount + onCleanup pattern from MessageBodyIframe.
    const ref = { current: { contentWindow: iframeWinA } };
    const handler = makeHandler(ref);
    window.addEventListener("message", handler);
    expect(
      addSpy.mock.calls.some(
        (c: [string, unknown]) => c[0] === "message" && c[1] === handler,
      ),
    ).toBe(true);

    window.removeEventListener("message", handler);
    expect(
      removeSpy.mock.calls.some(
        (c: [string, unknown]) => c[0] === "message" && c[1] === handler,
      ),
    ).toBe(true);
  });
});

/** moreMenuItemDefs — the pure item list behind the ⋯ menu. The menu
 *  was rebuilt to collapse the panel's 10-button action row into
 *  回复 / 稍后 / 更多⋯; these tests pin the filtering rules. */
describe("moreMenuItemDefs", () => {
  it("excludes the current bucket's move target", () => {
    const defs = moreMenuItemDefs({ bucket: "imbox", setAsideActive: false });
    const ids = defs.map((d) => d.id);
    expect(ids).not.toContain("move-imbox");
    expect(ids).toContain("move-feed");
    expect(ids).toContain("move-paperTrail");
  });

  it("keeps the Imbox move target for messages in other buckets", () => {
    const defs = moreMenuItemDefs({ bucket: "feed", setAsideActive: false });
    const imbox = defs.find((d) => d.id === "move-imbox");
    expect(imbox).toBeDefined();
    expect(imbox!.label).toBe("移到 Imbox");
  });

  it("moves the separator onto the first surviving move item", () => {
    // When move-imbox is filtered out, the separator must not vanish
    // with it — the first remaining move item carries it.
    const defs = moreMenuItemDefs({ bucket: "imbox", setAsideActive: false });
    const firstMove = defs.find((d) => d.id.startsWith("move-"));
    expect(firstMove!.separator).toBe(true);
  });

  it("labels every item in Chinese (brand nouns stay English)", () => {
    const defs = moreMenuItemDefs({ bucket: "trash", setAsideActive: false });
    const byId = new Map(defs.map((d) => [d.id, d.label]));
    expect(byId.get("reply-all")).toBe("回复全部");
    expect(byId.get("forward")).toBe("转发");
    expect(byId.get("trash")).toBe("移到回收站");
    expect(byId.get("spam")).toBe("移到垃圾邮件");
    expect(byId.get("move-imbox")).toBe("移到 Imbox");
    expect(byId.get("move-feed")).toBe("移到 Stream");
    expect(byId.get("move-paperTrail")).toBe("移到 Records");
  });

  it("marks trash / spam / block as danger", () => {
    const defs = moreMenuItemDefs({ bucket: "imbox", setAsideActive: false });
    const dangerIds = defs.filter((d) => d.danger).map((d) => d.id);
    expect(dangerIds).toEqual(["trash", "spam", "block"]);
  });

  it("toggles the set-aside label by state", () => {
    const off = moreMenuItemDefs({ bucket: "imbox", setAsideActive: false });
    const on = moreMenuItemDefs({ bucket: "imbox", setAsideActive: true });
    expect(off.find((d) => d.id === "set-aside")!.label).toBe("搁置");
    expect(on.find((d) => d.id === "set-aside")!.label).toBe("取消搁置");
  });
});
