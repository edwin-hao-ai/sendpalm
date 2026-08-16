/** App shell — matches prototype-v11's HTML mount points.
 * #root contains the sidebar + topbar + main + detail + agent + toasts.
 */

import { Show, createSignal, onMount, onCleanup, createEffect } from "solid-js";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { Main } from "./components/Main";
import { DetailPanel } from "./components/DetailPanel";
import { AgentPanel } from "./components/AgentPanel";
import { ToastStack } from "./components/ToastStack";
import { Onboarding } from "./views/Onboarding";
import { CommandPalette } from "./search/CommandPalette";
import { LiveSearch } from "./search/LiveSearch";
import { NotificationPanel } from "./notifications/NotificationPanel";
import { DropBar } from "./components/DropBar";
import { Compose } from "./compose/Compose";
import { ResurfaceLoop } from "./services/reminder";
import { startSyncEventBridge } from "./services/sync-events";
import { ShortcutHelp } from "./components/ShortcutHelp";
import { BulkActionMenu } from "./components/BulkActionMenu";
import { initApp } from "./bootstrap";
import {
  agentPanelOpen,
  commandPaletteOpen,
  searchOpen,
  onboardingStep,
  onboardingCompleted,
  notificationsOpen,
} from "./stores/ui";

import { useGlobalShortcuts } from "./utils/shortcuts";

export default function App() {
  const [ready, setReady] = createSignal(false);
  const [initError, setInitError] = createSignal<string | null>(null);

  useGlobalShortcuts();
  onCleanup(startSyncEventBridge());

  onMount(async () => {
    try {
      await initApp();
      setReady(true);
    } catch (e) {
      setInitError(String(e));
      setReady(true);
    }
  });

  createEffect(() => {
    if (ready() || initError()) {
      document.body.classList.add("app-ready");
      // Remove the splash overlay from the DOM after the CSS fade finishes
      // so its semi-transparent gradient cannot tint the app during the
      // transition or after a hot reload.
      setTimeout(() => {
        const splash = document.getElementById("splash");
        if (splash) splash.style.display = "none";
      }, 600);
    }
  });

  return (
    <>
      <Show when={ready() && !initError()}>
        <div id="app">
          <Sidebar />
          <Topbar />
          <Main />
          <DetailPanel />
          <Show when={agentPanelOpen()}>
            <AgentPanel />
          </Show>
          <DropBar />
        </div>
        <Show when={notificationsOpen()}>
          <NotificationPanel />
        </Show>
        <Show when={commandPaletteOpen()}>
          <CommandPalette />
        </Show>
        <Show when={searchOpen()}>
          <LiveSearch />
        </Show>
        <ToastStack />
        <Compose />
        <ResurfaceLoop />
        <ShortcutHelp />
        <BulkActionMenu />
        <Show when={!onboardingCompleted() && onboardingStep() !== null}>
          <Onboarding />
        </Show>
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
            <h2 style={{ "margin-bottom": "16px" }}>SendPalm 启动失败</h2>
            <p style={{ color: "var(--text-secondary)" }}>{initError()}</p>
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

      {/* Bootstrap decided we're past onboarding but state still loading. */}
    </>
  );
}
