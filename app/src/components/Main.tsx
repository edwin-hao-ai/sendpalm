/** Main — switches view by state.view(). */

import { Show, Switch, Match, For, createSignal, JSX, createEffect } from "solid-js";
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

/** Keep a view mounted after its first visit and toggle visibility instead of
 *  tearing it down. This matches the prototype (all view sections stay in the
 *  DOM and get a hidden class) and avoids expensive re-fetch/re-render when
 *  the user switches back to a previously visited view. */
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
      <Match when={view() === "agent"}>
        <KeepAlive active={view() === "agent"}>
          <Agent />
        </KeepAlive>
      </Match>
    </Switch>
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
          <ViewSwitch />
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
