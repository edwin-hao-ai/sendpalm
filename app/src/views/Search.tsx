/** Global Search page — full-page results across people/messages/files/drafts/meetings.
 * Spec: prototype-v11 §3.16.
 */

import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import Fuse from "fuse.js";
import {
  listFiles,
  listDrafts,
  listEvents,
  listSnippets,
  listClips,
  listStickies,
  searchIndex,
} from "../stores/data";
import { Avatar } from "../components/Avatar";
import { Empty, ErrorState } from "../components/Empty";
import { Icon } from "../components/Icon";
import {
  setDetailOpen,
  setSelectedContactId,
  setSelectedMessageId,
  setSelectedFileId,
  setSelectedMeetingId,
  setSelectedDraftId,
  showToast,
} from "../stores/ui";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useRefreshEffect } from "../utils/gestures";

interface Result {
  id: string;
  type:
    | "people"
    | "messages"
    | "files"
    | "meetings"
    | "drafts"
    | "snippets"
    | "clips"
    | "stickies";
  title: string;
  hint?: string;
  avatar?: string;
  onClick: () => void;
}

export function Search() {
  const [q, setQ] = createSignal("");
  const [debouncedQ, setDebouncedQ] = createSignal("");
  const [filter, setFilter] = createSignal<
    "all" | "people" | "messages" | "files" | "meetings" | "drafts"
  >("all");

  createEffect(() => {
    const v = q();
    const id = window.setTimeout(() => setDebouncedQ(v), 200);
    onCleanup(() => window.clearTimeout(id));
  });

  const [ftsResults, { refetch: refetchFts }] = createResource(
    debouncedQ,
    searchIndex,
  );
  const [files, { refetch: refetchFiles }] = createResource(listFiles);
  const [drafts, { refetch: refetchDrafts }] = createResource(listDrafts);
  const [events, { refetch: refetchEvents }] = createResource(listEvents);
  const [snippets, { refetch: refetchSnippets }] = createResource(listSnippets);
  const [clips, { refetch: refetchClips }] = createResource(listClips);
  const [stickies, { refetch: refetchStickies }] = createResource(listStickies);

  useRefreshEffect(() => {
    void refetchFts();
    void refetchFiles();
    void refetchDrafts();
    void refetchEvents();
    void refetchSnippets();
    void refetchClips();
    void refetchStickies();
  });

  const allResults = createMemo<Result[]>(() => {
    const list: Result[] = [];
    const fts = ftsResults() ?? [];

    // FTS-backed results for the heavy collections.
    for (const r of fts) {
      if (r.kind === "contact") {
        list.push({
          id: `c.${r.id}`,
          type: "people",
          title: r.title,
          hint: r.body.slice(0, 80),
          onClick: () => {
            setSelectedContactId(r.id);
            setDetailOpen(true);
          },
        });
      } else if (r.kind === "message") {
        list.push({
          id: `m.${r.id}`,
          type: "messages",
          title: r.title,
          hint: r.body.slice(0, 120).replace(/\n/g, " "),
          onClick: () => {
            setSelectedMessageId(r.id);
            setDetailOpen(true);
          },
        });
      } else if (r.kind === "file") {
        const file = (files() ?? []).find((f) => f.id === r.id);
        list.push({
          id: `f.${r.id}`,
          type: "files",
          title: r.title,
          hint: file
            ? `${file.type} · ${(file.size / 1024).toFixed(0)} KB`
            : r.body,
          onClick: () => {
            setSelectedFileId(r.id);
            setDetailOpen(true);
          },
        });
      } else if (r.kind === "event") {
        const evt = (events() ?? []).find((e) => e.id === r.id);
        list.push({
          id: `e.${r.id}`,
          type: "meetings",
          title: r.title,
          hint: evt
            ? `${new Date(evt.dt).toLocaleDateString()} · ${evt.tm}`
            : r.body,
          onClick: () => {
            setSelectedMeetingId(r.id);
            setDetailOpen(true);
          },
        });
      }
    }

    // Non-FTS collections (kept in-memory; typically small).
    for (const d of drafts() ?? []) {
      list.push({
        id: `d.${d.id}`,
        type: "drafts",
        title: d.subject || "(无主题)",
        hint: `${d.status} · to ${d.recipient}`,
        onClick: () => {
          setSelectedDraftId(d.id);
          setDetailOpen(true);
        },
      });
    }
    for (const s of snippets() ?? []) {
      list.push({
        id: `s.${s.id}`,
        type: "snippets",
        title: s.label,
        hint: s.body.slice(0, 60),
        onClick: async () => {
          try {
            await writeText(s.body);
            showToast({ message: "Snippet 已复制", kind: "success" });
          } catch {
            showToast({ message: "复制失败", kind: "error" });
          }
        },
      });
    }
    for (const c of clips() ?? []) {
      list.push({
        id: `cl.${c.id}`,
        type: "clips",
        title: c.text.slice(0, 80),
        hint: new Date(c.createdAt).toLocaleDateString(),
        onClick: async () => {
          try {
            await writeText(c.text);
            showToast({ message: "Clip 已复制", kind: "success" });
          } catch {
            showToast({ message: "复制失败", kind: "error" });
          }
        },
      });
    }
    for (const s of stickies() ?? []) {
      list.push({
        id: `st.${s.id}`,
        type: "stickies",
        title: s.body.slice(0, 80),
        hint: new Date(s.createdAt).toLocaleDateString(),
        onClick: async () => {
          try {
            await writeText(s.body);
            showToast({ message: "Sticky 已复制", kind: "success" });
          } catch {
            showToast({ message: "复制失败", kind: "error" });
          }
        },
      });
    }
    return list;
  });

  const fuse = createMemo(
    () =>
      new Fuse(allResults(), {
        keys: ["title", "hint"],
        threshold: 0.3,
        ignoreLocation: true,
      }),
  );

  const filtered = createMemo<Result[]>(() => {
    const query = q().trim();
    let list = query
      ? fuse()
          .search(query)
          .map((r) => r.item)
      : allResults();
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
        <h2
          style={{
            "font-family": "var(--font-display)",
            "font-size": "var(--text-h3)",
            "font-weight": "800",
            margin: 0,
          }}
        >
          Search
        </h2>
      </header>

      <div
        style={{
          padding: "0 var(--space-5) var(--space-4)",
          "max-width": "720px",
          margin: "0 auto",
        }}
      >
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
                  background:
                    filter() === f.id ? "var(--palm-soft)" : "var(--paper-mid)",
                  color:
                    filter() === f.id ? "var(--palm)" : "var(--text-secondary)",
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

      <Show
        when={!ftsResults.error}
        fallback={
          <ErrorState
            title="搜索失败"
            message={String(ftsResults.error ?? "")}
            retry={() => void refetchFts()}
          />
        }
      >
        <></>
      </Show>
      <Show
        when={filtered().length > 0}
        fallback={
          <Empty
            icon="ph-magnifying-glass"
            title={q() ? "无匹配" : "输入关键词开始搜索"}
            description="搜索联系 / 消息 / 文件 / 会议 / 草稿"
          />
        }
      >
        <div
          style={{
            "max-width": "720px",
            margin: "0 auto",
            padding: "0 var(--space-5) var(--space-5)",
          }}
        >
          <For each={Object.keys(grouped())}>
            {(group) => (
              <section style={{ "margin-bottom": "var(--space-5)" }}>
                <h3
                  style={{
                    "font-family": "var(--font-display)",
                    "font-size": "var(--text-h4)",
                    "font-weight": "800",
                    margin: "0 0 var(--space-3)",
                  }}
                >
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
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--paper-mid)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background =
                          "var(--paper-light)")
                      }
                    >
                      <Show
                        when={r.avatar}
                        fallback={<Icon name={iconForType(r.type)} size={20} />}
                      >
                        <Avatar name={r.title} src={r.avatar} size={28} />
                      </Show>
                      <div style={{ flex: 1, "min-width": 0 }}>
                        <div
                          style={{
                            "font-weight": "600",
                            "white-space": "nowrap",
                            overflow: "hidden",
                            "text-overflow": "ellipsis",
                          }}
                        >
                          {r.title}
                        </div>
                        <Show when={r.hint}>
                          <div
                            style={{
                              "font-size": "var(--text-caption)",
                              color: "var(--text-secondary)",
                              "white-space": "nowrap",
                              overflow: "hidden",
                              "text-overflow": "ellipsis",
                            }}
                          >
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
  return (
    {
      people: "联系人",
      messages: "消息",
      files: "文件",
      meetings: "会议",
      drafts: "草稿",
      snippets: "Snippets",
      clips: "Clips",
    }[g] ?? g
  );
}

function iconForType(t: string): string {
  return (
    {
      people: "ph-user",
      messages: "ph-envelope",
      files: "ph-paperclip",
      meetings: "ph-calendar-blank",
      drafts: "ph-pencil-line",
      snippets: "ph-text-aa",
      clips: "ph-bookmarks",
    }[t] ?? "ph-magnifying-glass"
  );
}
