/** Main — switches view by state.view(). */

import { Show, Switch, Match } from "solid-js";
import { view, loading, error } from "../stores/ui";
import { Imbox } from "../views/Imbox";
import { Gate } from "../views/Gate";
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
import { Empty } from "../components/Empty";

export function Main() {
  return (
    <main id="main">
      <Show when={loading()}>
        <Empty title="Loading…" description="正在准备你的工作区" />
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
          <Match when={view() === "imbox"}><Imbox /></Match>
          <Match when={view() === "screener"}><Gate /></Match>
          <Match when={view() === "feed"}><Stream /></Match>
          <Match when={view() === "paperTrail"}><Records /></Match>
          <Match when={view() === "trash"}><Trash /></Match>
          <Match when={view() === "spam"}><Spam /></Match>
          <Match when={view() === "contacts"}><Contacts /></Match>
          <Match when={view() === "companies"}><Companies /></Match>
          <Match when={view() === "calendar"}><Calendar /></Match>
          <Match when={view() === "files"}><Files /></Match>
          <Match when={view() === "insights"}><Insights /></Match>
          <Match when={view() === "drafts"}><Drafts /></Match>
          <Match when={view() === "followUps"}><FollowUps /></Match>
          <Match when={view() === "clips"}><Clips /></Match>
          <Match when={view() === "search"}><Search /></Match>
          <Match when={view() === "settings"}><Settings /></Match>
        </Switch>
      </Show>
    </main>
  );
}