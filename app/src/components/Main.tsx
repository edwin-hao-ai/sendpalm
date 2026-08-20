/** Main — switches view by state.view().
 *
 * Each view is loaded via `lazy()` + dynamic import. The active view's
 * chunk downloads on first visit; once loaded it's cached for the life
 * of the page so switching back to it is instant. The previous version
 * eagerly imported all 22 view files at app boot, which forced the JS
 * engine to parse Calendar (2264 lines), Imbox (1835), Settings (2214),
 * Agent, Insights, etc. before the user could click anything. Now the
 * initial bundle only carries App shell + Main + the topbar / sidebar /
 * common components, and the active view is fetched after the shell
 * paints. Average view chunk is 5-25 KB gzipped.
 *
 * Each lazy import returns a component wrapped in <Suspense>. While the
 * chunk is in flight we render the FeedSkeleton — same shape as the
 * real Imbox rows (avatar + 2 text lines, 100 rows tall) so there's no
 * layout shift when the chunk resolves.
 */

import {
  Show,
  Switch,
  Match,
  For,
  Suspense,
  createSignal,
  type JSX,
  createEffect,
  lazy,
  type Component,
} from "solid-js";
import { view, bumpRefreshTick } from "../stores/ui";
import { PullToRefresh } from "./PullToRefresh";
import { useViewport } from "../utils/gestures";
import { Skeleton } from "./Skeleton";

// Dynamic imports → one chunk per view. Vite/Rollup tree-shakes unused
// exports and emits each view as its own file. The named function is the
// only export we want; `.then({ default })` maps it to the shape lazy()
// expects.
const Imbox = lazy(() =>
  import("../views/Imbox").then((m) => ({ default: m.Imbox as Component })),
);
const Gate = lazy(() =>
  import("../views/Gate").then((m) => ({
    default: m.Gate as Component,
  })),
);
const ScreenerHistory = lazy(() =>
  import("../views/Gate").then((m) => ({
    default: m.ScreenerHistory as Component,
  })),
);
const Stream = lazy(() =>
  import("../views/Stream").then((m) => ({ default: m.Stream as Component })),
);
const Records = lazy(() =>
  import("../views/Records").then((m) => ({
    default: m.Records as Component,
  })),
);
const Trash = lazy(() =>
  import("../views/Trash").then((m) => ({ default: m.Trash as Component })),
);
const Spam = lazy(() =>
  import("../views/Spam").then((m) => ({ default: m.Spam as Component })),
);
const Contacts = lazy(() =>
  import("../views/Contacts").then((m) => ({
    default: m.Contacts as Component,
  })),
);
const Companies = lazy(() =>
  import("../views/Companies").then((m) => ({
    default: m.Companies as Component,
  })),
);
const Calendar = lazy(() =>
  import("../views/Calendar").then((m) => ({
    default: m.Calendar as Component,
  })),
);
const Files = lazy(() =>
  import("../views/Files").then((m) => ({ default: m.Files as Component })),
);
const Insights = lazy(() =>
  import("../views/Insights").then((m) => ({
    default: m.Insights as Component,
  })),
);
const Drafts = lazy(() =>
  import("../views/Drafts").then((m) => ({
    default: m.Drafts as Component,
  })),
);
const FollowUps = lazy(() =>
  import("../views/FollowUps").then((m) => ({
    default: m.FollowUps as Component,
  })),
);
const Clips = lazy(() =>
  import("../views/Clips").then((m) => ({ default: m.Clips as Component })),
);
const Search = lazy(() =>
  import("../views/Search").then((m) => ({ default: m.Search as Component })),
);
const Settings = lazy(() =>
  import("../views/Settings").then((m) => ({
    default: m.Settings as Component,
  })),
);
const FocusReply = lazy(() =>
  import("../views/FocusReply").then((m) => ({
    default: m.FocusReply as Component,
  })),
);
const ReadTogether = lazy(() =>
  import("../views/ReadTogether").then((m) => ({
    default: m.ReadTogether as Component,
  })),
);
// PileBoard is parameterised by pileId; the lazy wrapper can't see the
// props type because dynamic imports erase the signature, so we cast to
// Component<{ pileId: string }> at the call site instead.
const PileBoard = lazy(() =>
  import("../views/PileBoard").then((m) => ({
    default: m.PileBoard as Component<{ pileId: string }>,
  })),
);
const Agent = lazy(() =>
  import("../views/Agent").then((m) => ({ default: m.Agent as Component })),
);

/** Keep a view mounted after its first visit and toggle visibility
 *  instead of tearing it down. Combined with `lazy()`, the chunk
 *  downloads once and is reused for every subsequent visit. */
function KeepAlive(props: { active: boolean; children: JSX.Element }) {
  const [mounted, setMounted] = createSignal(false);
  createEffect(() => {
    if (props.active) setMounted(true);
  });
  return (
    <Show when={mounted()}>
      <div style={{ display: props.active ? "contents" : "none" }}>
        {props.children}
      </div>
    </Show>
  );
}

function ViewSwitch() {
  return (
    <Suspense fallback={<FeedSkeleton />}>
      <Switch>
        <Match when={view() === "imbox"}>
          <KeepAlive active={view() === "imbox"}>
            <Imbox />
          </KeepAlive>
        </Match>
        <Match when={view() === "screener"}>
          <KeepAlive active={view() === "screener"}>
            <Gate />
          </KeepAlive>
        </Match>
        <Match when={view() === "screenerHistory"}>
          <KeepAlive active={view() === "screenerHistory"}>
            <ScreenerHistory />
          </KeepAlive>
        </Match>
        <Match when={view() === "feed"}>
          <KeepAlive active={view() === "feed"}>
            <Stream />
          </KeepAlive>
        </Match>
        <Match when={view() === "paperTrail"}>
          <KeepAlive active={view() === "paperTrail"}>
            <Records />
          </KeepAlive>
        </Match>
        <Match when={view() === "trash"}>
          <KeepAlive active={view() === "trash"}>
            <Trash />
          </KeepAlive>
        </Match>
        <Match when={view() === "spam"}>
          <KeepAlive active={view() === "spam"}>
            <Spam />
          </KeepAlive>
        </Match>
        <Match when={view() === "contacts"}>
          <KeepAlive active={view() === "contacts"}>
            <Contacts />
          </KeepAlive>
        </Match>
        <Match when={view() === "companies"}>
          <KeepAlive active={view() === "companies"}>
            <Companies />
          </KeepAlive>
        </Match>
        <Match when={view() === "calendar"}>
          <KeepAlive active={view() === "calendar"}>
            <Calendar />
          </KeepAlive>
        </Match>
        <Match when={view() === "files"}>
          <KeepAlive active={view() === "files"}>
            <Files />
          </KeepAlive>
        </Match>
        <Match when={view() === "insights"}>
          <KeepAlive active={view() === "insights"}>
            <Insights />
          </KeepAlive>
        </Match>
        <Match when={view() === "drafts"}>
          <KeepAlive active={view() === "drafts"}>
            <Drafts />
          </KeepAlive>
        </Match>
        <Match when={view() === "followUps"}>
          <KeepAlive active={view() === "followUps"}>
            <FollowUps />
          </KeepAlive>
        </Match>
        <Match when={view() === "clips"}>
          <KeepAlive active={view() === "clips"}>
            <Clips />
          </KeepAlive>
        </Match>
        <Match when={view() === "search"}>
          <KeepAlive active={view() === "search"}>
            <Search />
          </KeepAlive>
        </Match>
        <Match when={view() === "settings"}>
          <KeepAlive active={view() === "settings"}>
            <Settings />
          </KeepAlive>
        </Match>
        <Match when={view() === "focusReply"}>
          <KeepAlive active={view() === "focusReply"}>
            <FocusReply />
          </KeepAlive>
        </Match>
        <Match when={view() === "readTogether"}>
          <KeepAlive active={view() === "readTogether"}>
            <ReadTogether />
          </KeepAlive>
        </Match>
        <Match when={view() === "replyLater"}>
          <KeepAlive active={view() === "replyLater"}>
            <PileBoard pileId="replyLater" />
          </KeepAlive>
        </Match>
        <Match when={view() === "setAside"}>
          <KeepAlive active={view() === "setAside"}>
            <PileBoard pileId="setAside" />
          </KeepAlive>
        </Match>
        <Match when={view() === "bubbleUp"}>
          <KeepAlive active={view() === "bubbleUp"}>
            <PileBoard pileId="bubbleUp" />
          </KeepAlive>
        </Match>
        <Match when={view() === "agent"}>
          <KeepAlive active={view() === "agent"}>
            <Agent />
          </KeepAlive>
        </Match>
      </Switch>
    </Suspense>
  );
}

export function Main() {
  const viewport = useViewport();
  const [mainEl, setMainEl] = createSignal<HTMLElement | undefined>();

  return (
    <main
      id="main"
      ref={(el) => setMainEl(el)}
      style={{ position: "relative" }}
    >
      <PullToRefresh
        container={mainEl()}
        enabled={!viewport.isDesktop()}
        onRefresh={() => {
          bumpRefreshTick();
        }}
      >
        <ViewSwitch />
      </PullToRefresh>
    </main>
  );
}

/** Skeleton that matches the real Imbox row shape (avatar + 2 text
 *  lines per card). 100 rows ≈ one screenful. Filling the whole
 *  viewport up front avoids the layout shift that happens when the
 *  skeleton ends and the real list begins. */
function FeedSkeleton() {
  return (
    <div
      style={{
        padding: "var(--space-5)",
        "max-width": "720px",
        margin: "0 auto",
      }}
    >
      {/* Header placeholder so the page H1 paints in the same frame. */}
      <div
        style={{
          "margin-bottom": "var(--space-4)",
        }}
      >
        <Skeleton width="120px" height="32px" />
        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            "margin-top": "var(--space-2)",
          }}
        >
          <Skeleton width="60%" height="12px" />
        </div>
      </div>
      <For each={Array.from({ length: 12 })}>
        {() => (
          <div
            data-skeleton-row
            style={{
              display: "flex",
              gap: "var(--space-3)",
              "margin-bottom": "var(--space-3)",
              padding: "var(--space-3) 0",
            }}
          >
            <Skeleton circle width={40} height={40} />
            <div style={{ flex: 1 }}>
              <Skeleton width="30%" height="14px" />
              <div style={{ "margin-top": "6px" }}>
                <Skeleton width="50%" height="12px" />
              </div>
              <div style={{ "margin-top": "6px" }}>
                <Skeleton width="80%" height="12px" />
              </div>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
