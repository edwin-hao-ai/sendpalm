/** Main — switches view by state.view(). */

import { Show, Switch, Match, For, createSignal } from "solid-js";
import { view, loading, error, bumpRefreshTick } from "../stores/ui";
import { Imbox } from "../views/Imbox";
import { PullToRefresh } from "./PullToRefresh";
import { useViewport } from "../utils/gestures";
import { Gate, ScreenerHistory } from "../views/Gate";
import { Stream } from "../views/Stream";
import { Records } from "../views/Records";
import { Trash } from "../views/Trash";
import { Spam } from "../views/Spam";
import { Contacts } from "../views/Contacts";
import { Companies } from "../views/Companies";
import { Calendar } from "../views/Calendar";
import { Files } from "../views/Files";
import { Insights } from "../views/Insights";
import { Drafts } from "../views/Drafts";
import { FollowUps } from "../views/FollowUps";
import { Clips } from "../views/Clips";
import { Search } from "../views/Search";
import { Settings } from "../views/Settings";
import { FocusReply } from "../views/FocusReply";
import { ReadTogether } from "../views/ReadTogether";
import { Agent } from "../views/Agent";
import { Empty, Skeleton } from "../components/Empty";
import { PanelResizeHandle } from "./PanelResizeHandle";

export function Main() {
  const viewport = useViewport();
  const [mainEl, setMainEl] = createSignal<HTMLElement | undefined>();

  return (
    <main
      id="main"
      ref={(el) => setMainEl(el)}
      style={{ position: "relative" }}
    >
      <PanelResizeHandle panel="main" side="right" />
      <PullToRefresh
        container={mainEl()}
        enabled={!viewport.isDesktop()}
        onRefresh={() => {
          bumpRefreshTick();
        }}
      >
        <Show when={loading()}>
          <FeedSkeleton />
        </Show>
        <Show when={error()}>
          <Empty
            title="出错了"
            description={error() ?? ""}
            action={{ label: "重试", onClick: () => location.reload() }}
          />
        </Show>
        <Show when={!loading() && !error()}>
          <Switch>
            <Match when={view() === "imbox"}>
              <Imbox />
            </Match>
            <Match when={view() === "screener"}>
              <Gate />
            </Match>
            <Match when={view() === "screenerHistory"}>
              <ScreenerHistory />
            </Match>
            <Match when={view() === "feed"}>
              <Stream />
            </Match>
            <Match when={view() === "paperTrail"}>
              <Records />
            </Match>
            <Match when={view() === "trash"}>
              <Trash />
            </Match>
            <Match when={view() === "spam"}>
              <Spam />
            </Match>
            <Match when={view() === "contacts"}>
              <Contacts />
            </Match>
            <Match when={view() === "companies"}>
              <Companies />
            </Match>
            <Match when={view() === "calendar"}>
              <Calendar />
            </Match>
            <Match when={view() === "files"}>
              <Files />
            </Match>
            <Match when={view() === "insights"}>
              <Insights />
            </Match>
            <Match when={view() === "drafts"}>
              <Drafts />
            </Match>
            <Match when={view() === "followUps"}>
              <FollowUps />
            </Match>
            <Match when={view() === "clips"}>
              <Clips />
            </Match>
            <Match when={view() === "search"}>
              <Search />
            </Match>
            <Match when={view() === "settings"}>
              <Settings />
            </Match>
            <Match when={view() === "focusReply"}>
              <FocusReply />
            </Match>
            <Match when={view() === "readTogether"}>
              <ReadTogether />
            </Match>
            <Match when={view() === "agent"}>
              <Agent />
            </Match>
          </Switch>
        </Show>
      </PullToRefresh>
    </main>
  );
}

function FeedSkeleton() {
  return (
    <div
      style={{
        padding: "var(--space-5)",
        "max-width": "720px",
        margin: "0 auto",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-3)",
          "margin-bottom": "var(--space-4)",
        }}
      >
        <Skeleton width="36px" height="36px" radius="50%" />
        <div style={{ flex: 1 }}>
          <Skeleton width="40%" height="14px" />
          <div style={{ "margin-top": "6px" }}>
            <Skeleton width="70%" height="12px" />
          </div>
        </div>
      </div>
      <For each={[0, 1, 2, 3, 4, 5]}>
        {() => (
          <div
            style={{
              display: "flex",
              gap: "var(--space-3)",
              "margin-bottom": "var(--space-3)",
            }}
          >
            <Skeleton width="36px" height="36px" radius="50%" />
            <div style={{ flex: 1 }}>
              <Skeleton width="30%" height="14px" />
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
