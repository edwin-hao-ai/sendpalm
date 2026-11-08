/** App shell — matches prototype-v11's HTML mount points.
 * #root contains the sidebar + topbar + main + detail + agent + toasts.
 *
 * Render order is important: the SHELL paints on the very first frame
 * (Sidebar + Topbar + Main skeleton). Previously the whole body was
 * gated on `ready()` from `bootstrap.ts`, which awaits 4 IPC round-trips
 * before the user sees anything. Users perceived this as "the app takes
 * a second to open". Now the shell renders immediately; the bootstrap
 * keeps running in the background and only affects on-disk state, agent
 * memory, onboarding gating, and the per-component `createResource`
 * caches. The splash overlay fades out the first time SolidJS paints the
 * shell, NOT after `initApp()` resolves.
 */

import {
  Show,
  Suspense,
  createSignal,
  lazy,
  onMount,
  onCleanup,
} from "solid-js";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { Main } from "./components/Main";

import { ToastStack } from "./components/ToastStack";


import { NotificationPanel } from "./notifications/NotificationPanel";
import { DropBar } from "./components/DropBar";

import { ResurfaceLoop } from "./services/reminder";
import { startSyncEventBridge } from "./services/sync-events";
import { startTaskExtractionService } from "./services/task-extraction";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { BulkActionMenu } from "./components/BulkActionMenu";
import { LockScreen } from "./components/LockScreen";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { initApp } from "./bootstrap";
import {
  agentPanelOpen,
  commandPaletteOpen,
  detailOpen,
  searchOpen,
  onboardingStep,
  onboardingCompleted,
  notificationsOpen,
  composeOpen,
} from "./stores/ui";
import { appLocked } from "./services/app-lock";

import { useGlobalShortcuts } from "./utils/shortcuts";
import { useViewport } from "./utils/gestures";

/** Overlays load on demand.
 *
 *  The shell (sidebar / topbar / main) is what has to paint first, and none
 *  of these are on that path: the detail panel drags in all seven panels —
 *  MessagePanel alone is 2,000 lines plus DOMPurify — Compose is its own
 *  screen, the command palette pulls Fuse, and the wizard only exists on a
 *  first run. Bundling them into the entry chunk meant every cold start
 *  parsed ~180 KB gzip of code the user might never open.
 */
const DetailPanel = lazy(() =>
  import("./components/DetailPanel").then((m) => ({
    default: m.DetailPanel,
  })),
);
const AgentPanel = lazy(() =>
  import("./components/AgentPanel").then((m) => ({ default: m.AgentPanel })),
);
const CommandPalette = lazy(() =>
  import("./search/CommandPalette").then((m) => ({
    default: m.CommandPalette,
  })),
);
const LiveSearch = lazy(() =>
  import("./search/LiveSearch").then((m) => ({ default: m.LiveSearch })),
);
const Compose = lazy(() =>
  import("./compose/Compose").then((m) => ({ default: m.Compose })),
);
const Onboarding = lazy(() =>
  import("./views/Onboarding").then((m) => ({ default: m.Onboarding })),
);


export default function App() {
  // Track the init error separately. The shell renders as soon as the
  // component mounts — there is no `ready` gate anymore. If `initApp()`
  // rejects we surface the error as a fatal banner that hides the shell
  // (the user can still see the splash behind it so the app didn't just
  // freeze). Every component handles its own data via createResource, so
  // unsetting `loading` no longer has to gate the whole UI.
  const [initError, setInitError] = createSignal<string | null>(null);
  const viewport = useViewport();

  useGlobalShortcuts();
  onCleanup(startSyncEventBridge());
  let stopTaskExtraction: (() => void) | undefined;
  let disposed = false;
  onCleanup(() => { disposed = true; stopTaskExtraction?.(); });

  onMount(async () => {
    try {
      await initApp();
      if (!disposed) stopTaskExtraction = startTaskExtractionService();
    } catch (e) {
      setInitError(String(e));
    }
  });

  // Hide the splash as soon as SolidJS has painted the shell. We use a
  // double rAF so the browser commits the first layout before the splash
  // starts fading. Fading on the same frame as the shell mount would
  // produce a one-frame flash of paper-coloured void.
  onMount(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.body.classList.add("app-ready");
        // Remove the splash element from the DOM after the CSS fade so it
        // can't intercept pointer events or sit in the accessibility tree
        // after a hot reload.
        setTimeout(() => {
          const splash = document.getElementById("splash");
          if (splash) splash.style.display = "none";
        }, 600);
      });
    });
  });

  return (
    // Last line of defence. A render-time exception anywhere in the tree
    // used to leave the window blank; now it lands here with a recovery
    // panel and the error goes to the log.
    <AppErrorBoundary scope="app">
      <Show when={!initError()}>
        <div
          id="app"
          data-detail={
            detailOpen() && !viewport.isMobile() ? "open" : undefined
          }
        >
          <Sidebar />
          <Topbar />
          <Main />
          <Show when={detailOpen()}>
            <Suspense fallback={null}>
              <DetailPanel />
            </Suspense>
          </Show>
          <Show when={agentPanelOpen()}>
            <Suspense fallback={null}>
              <AgentPanel />
            </Suspense>
          </Show>
          <DropBar />
        </div>
        <Show when={notificationsOpen()}>
          <NotificationPanel />
        </Show>
        <Show when={commandPaletteOpen()}>
          <Suspense fallback={null}>
            <CommandPalette />
          </Suspense>
        </Show>
        <Show when={searchOpen()}>
          <Suspense fallback={null}>
            <LiveSearch />
          </Suspense>
        </Show>
        <ToastStack />
        <Show when={composeOpen()}>
          <Suspense fallback={null}>
            <Compose />
          </Suspense>
        </Show>
        <ResurfaceLoop />
        <ShortcutHelp />
        <BulkActionMenu />
        <Show when={!onboardingCompleted() && onboardingStep() !== null}>
          <Suspense fallback={null}>
            <Onboarding />
          </Suspense>
        </Show>
      </Show>

      {/* Above everything, inside and outside the shell: a locked app must
          not leak the compose window, a toast, or the command palette
          behind it. */}
      <Show when={appLocked()}>
        <LockScreen />
      </Show>

      <Show when={initError()}>
        <div
          style={{
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            height: "100dvh",
            padding: "32px",
            background: "var(--paper)",
            color: "var(--text-primary)",
            "font-family": "var(--font-body)",
          }}
        >
          <div style={{ "max-width": "520px", "text-align": "center" }}>
            <h2 style={{ "margin-bottom": "16px" }}>
              SendPalm 没能正常启动
            </h2>
            <p style={{ color: "var(--text-secondary)" }}>
              本地数据初始化时出了问题。你可以尝试重启应用；如果反复出现，
              请把下面的技术详情发给支持。
            </p>
            <details
              style={{
                "margin-top": "16px",
                "text-align": "left",
                "font-size": "var(--text-caption)",
                color: "var(--text-muted)",
              }}
            >
              <summary style={{ cursor: "pointer", "text-align": "center" }}>
                技术详情
              </summary>
              <pre
                style={{
                  "margin-top": "8px",
                  padding: "12px",
                  background: "var(--paper-mid)",
                  "border-radius": "var(--radius-md)",
                  "white-space": "pre-wrap",
                  "word-break": "break-all",
                  "max-height": "160px",
                  overflow: "auto",
                }}
              >
                {initError()}
              </pre>
            </details>
            <button
              onClick={() => location.reload()}
              style={{
                "margin-top": "24px",
                padding: "10px 20px",
                background: "var(--palm)",
                color: "white",
                "border-radius": "var(--radius-pill)",
                "font-weight": "700",
              }}
            >
              重启
            </button>
          </div>
        </div>
      </Show>
    </AppErrorBoundary>
  );
}
