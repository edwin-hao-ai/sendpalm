/** Global Search page — full-page results across people/messages/files/drafts/meetings.
 * Spec: prototype-v11 §3.16.
 */

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import Fuse from "fuse.js";
import {
  listContacts, listMessages, listFiles, listDrafts, listEvents, listSnippets, listClips,
} from "../stores/data";
import { Avatar } from "../components/Avatar";
import { Empty } from "../components/Empty";
import { Icon } from "../components/Icon";
import {
  setDetailOpen,
  setSelectedContactId,
  setSelectedMessageId,
  setSelectedFileId,
  setSelectedMeetingId,
  setSelectedDraftId,
} from "../stores/ui";

interface Result {
  id: string;
  type: "people" | "messages" | "files" | "meetings" | "drafts" | "snippets" | "clips";
  title: string;
  hint?: string;
  avatar?: string;
  onClick: () => void;
}

export function Search() {
  const [q, setQ] = createSignal("");
  const [filter, setFilter] = createSignal<"all" | "people" | "messages" | "files" | "meetings" | "drafts">("all");

  const [contacts] = createResource(listContacts);
  const [messages] = createResource(listMessages);
  const [files] = createResource(listFiles);
  const [drafts] = createResource(listDrafts);
  const [events] = createResource(listEvents);
  const [snippets] = createResource(listSnippets);
  const [clips] = createResource(listClips);

  const allResults = createMemo<Result[]>(() => {
    const list: Result[] = [];
    for (const c of contacts() ?? []) {
      list.push({
        id: `c.${c.id}`, type: "people", title: c.name,
        hint: c.company || c.emails[0]?.value,
        avatar: c.avatar,
        onClick: () => { setSelectedContactId(c.id); setDetailOpen(true); },
      });
    }
    for (const m of messages() ?? []) {
      list.push({
        id: `m.${m.id}`, type: "messages", title: m.subj,
        hint: m.prev, onClick: () => { setSelectedMessageId(m.id); setDetailOpen(true); },
      });
    }
    for (const f of files() ?? []) {
      list.push({
        id: `f.${f.id}`, type: "files", title: f.name,
        hint: `${f.type} · ${(f.size / 1024).toFixed(0)} KB`,
        onClick: () => { setSelectedFileId(f.id); setDetailOpen(true); },
      });
    }
    for (const e of events() ?? []) {
      list.push({
        id: `e.${e.id}`, type: "meetings", title: e.title,
        hint: `${new Date(e.dt).toLocaleDateString()} · ${e.tm}`,
        onClick: () => { setSelectedMeetingId(e.id); setDetailOpen(true); },
      });
    }
    for (const d of drafts() ?? []) {
      list.push({
        id: `d.${d.id}`, type: "drafts", title: d.subject || "(无主题)",
        hint: `${d.status} · to ${d.recipient}`,
        onClick: () => { setSelectedDraftId(d.id); setDetailOpen(true); },
      });
    }
    for (const s of snippets() ?? []) {
      list.push({
        id: `s.${s.id}`, type: "snippets", title: s.label,
        hint: s.body.slice(0, 60), onClick: () => {},
      });
    }
    for (const c of clips() ?? []) {
      list.push({
        id: `cl.${c.id}`, type: "clips", title: c.text.slice(0, 80),
        hint: new Date(c.createdAt).toLocaleDateString(),
        onClick: () => {},
      });
    }
    return list;
  });

  const fuse = createMemo(() => new Fuse(allResults(), {
    keys: ["title", "hint"],
    threshold: 0.3,
    ignoreLocation: true,
  }));

  const filtered = createMemo<Result[]>(() => {
    const query = q().trim();
    let list = query ? fuse().search(query).map((r) => r.item) : allResults();
    if (filter() !== "all") list = list.filter((r) => r.type === filter());
    return list;
  });

  const grouped = createMemo(() => {
    const groups: Record<string, Result[]> = {};
    for (const r of filtered()) (groups[r.type] ||= []).push(r);
    return groups;
  });

  const FILTERS = [
    { id: "all", label: "全部" },
    { id: "people", label: "联系人" },
    { id: "messages", label: "消息" },
    { id: "files", label: "文件" },
    { id: "meetings", label: "会议" },
    { id: "drafts", label: "草稿" },
  ] as const;

  return (
    <div style={{ animation: "view-enter 0.3s var(--ease-out) both" }}>
      <header style={{ padding: "var(--space-5)" }}>
        <h2 style={{ "font-family": "var(--font-display)", "font-size": "var(--text-h3)", "font-weight": "800", margin: 0 }}>
          Search
        </h2>
      </header>

      <div style={{ padding: "0 var(--space-5) var(--space-4)", "max-width": "720px", margin: "0 auto" }}>
        <input
          autofocus
          value={q()}
          onInput={(e) => setQ(e.currentTarget.value)}
          placeholder="搜索整个工作区…"
          style={{
            width: "100%",
            padding: "var(--space-3) var(--space-4)",
            background: "var(--paper-light)",
            "border-radius": "var(--radius-pill)",
            border: "0.5px solid var(--border)",
            "font-size": "var(--text-body)",
            "margin-bottom": "var(--space-3)",
          }}
        />
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
          <For each={FILTERS}>
            {(f) => (
              <button
                onClick={() => setFilter(f.id)}
                style={{
                  padding: "4px 12px",
                  "border-radius": "var(--radius-pill)",
                  background: filter() === f.id ? "var(--palm-soft)" : "var(--paper-mid)",
                  color: filter() === f.id ? "var(--palm)" : "var(--text-secondary)",
                  "font-size": "var(--text-caption)",
                  "font-weight": filter() === f.id ? "700" : "500",
                }}
              >
                {f.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <Show when={filtered().length > 0} fallback={
        <Empty
          icon="ph-magnifying-glass"
          title={q() ? "无匹配" : "输入关键词开始搜索"}
          description="搜索联系 / 消息 / 文件 / 会议 / 草稿"
        />
      }>
        <div style={{ "max-width": "720px", margin: "0 auto", padding: "0 var(--space-5) var(--space-5)" }}>
          <For each={Object.keys(grouped())}>
            {(group) => (
              <section style={{ "margin-bottom": "var(--space-5)" }}>
                <h3 style={{ "font-family": "var(--font-display)", "font-size": "var(--text-h4)", "font-weight": "800", margin: "0 0 var(--space-3)" }}>
                  {groupLabel(group)}
                </h3>
                <For each={grouped()[group]}>
                  {(r) => (
                    <button
                      onClick={r.onClick}
                      style={{
                        display: "flex",
                        gap: "var(--space-3)",
                        width: "100%",
                        padding: "var(--space-3)",
                        background: "var(--paper-light)",
                        "border-radius": "var(--radius-md)",
                        border: "0.5px solid var(--border)",
                        "margin-bottom": "var(--space-2)",
                        "text-align": "left",
                        cursor: "pointer",
                        "align-items": "center",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper-mid)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "var(--paper-light)")}
                    >
                      <Show when={r.avatar} fallback={<Icon name={iconForType(r.type)} size={20} />}>
                        <Avatar name={r.title} src={r.avatar} size={28} />
                      </Show>
                      <div style={{ flex: 1, "min-width": 0 }}>
                        <div style={{ "font-weight": "600", "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>
                          {r.title}
                        </div>
                        <Show when={r.hint}>
                          <div style={{ "font-size": "var(--text-caption)", color: "var(--text-secondary)", "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>
                            {r.hint}
                          </div>
                        </Show>
                      </div>
                      <Icon name="ph-arrow-right" size={14} />
                    </button>
                  )}
                </For>
              </section>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function groupLabel(g: string): string {
  return {
    people: "联系人",
    messages: "消息",
    files: "文件",
    meetings: "会议",
    drafts: "草稿",
    snippets: "Snippets",
    clips: "Clips",
  }[g] ?? g;
}

function iconForType(t: string): string {
  return {
    people: "ph-user",
    messages: "ph-envelope",
    files: "ph-paperclip",
    meetings: "ph-calendar-blank",
    drafts: "ph-pencil-line",
    snippets: "ph-text-aa",
    clips: "ph-bookmarks",
  }[t] ?? "ph-magnifying-glass";
}