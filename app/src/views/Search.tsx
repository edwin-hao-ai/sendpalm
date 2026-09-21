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
  listTasks,
  searchIndex,
} from "../stores/data";
import { Avatar } from "../components/Avatar";
import { Empty, ErrorState } from "../components/Empty";
import { Icon } from "../components/Icon";
import { ResourceGate } from "../components/ResourceGate";
import { SkeletonList } from "../components/Skeleton";
import {
  setDetailOpen,
  setSelectedContactId,
  setSelectedMessageId,
  setSelectedFileId,
  setSelectedMeetingId,
  setSelectedDraftId,
  setSelectedTaskId,
  showToast,
  view,
} from "../stores/ui";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useRefreshEffect } from "../utils/gestures";
import { formatBytes } from "../utils/date";
import { fileTypeLabel } from "../panels/FilePanel";

type ResultType =
  | "people"
  | "messages"
  | "files"
  | "meetings"
  | "drafts"
  | "snippets"
  | "clips"
  | "stickies"
  | "tasks";

interface Result {
  id: string;
  type: ResultType;
  title: string;
  hint?: string;
  avatar?: string;
  onClick: () => void;
}

export function Search() {
  const [q, setQ] = createSignal("");
  const [debouncedQ, setDebouncedQ] = createSignal("");
  const [filter, setFilter] = createSignal<"all" | ResultType>("all");
  const [cursorIdx, setCursorIdx] = createSignal(0);
  let inputRef: HTMLInputElement | undefined;

  createEffect(() => {
    const v = q();
    const id = window.setTimeout(() => setDebouncedQ(v), 200);
    onCleanup(() => window.clearTimeout(id));
  });

  // Focus the input whenever the user navigates to this view.
  createEffect(() => {
    if (view() === "search") inputRef?.focus();
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
  const [tasks, { refetch: refetchTasks }] = createResource(listTasks);

  useRefreshEffect(() => {
    void refetchFts();
    void refetchFiles();
    void refetchDrafts();
    void refetchEvents();
    void refetchSnippets();
    void refetchClips();
    void refetchStickies();
    void refetchTasks();
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
            ? `${fileTypeLabel(file.type)} · ${formatBytes(file.size)}`
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
            ? `${new Date(evt.dt).toLocaleDateString("zh-CN")} · ${evt.tm}`
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
        hint: d.recipient ? `草稿 · 发给 ${d.recipient}` : "草稿 · 未填收件人",
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
            showToast({ message: "已复制", kind: "success" });
          } catch {
            showToast({ message: "复制失败，请重试", kind: "error" });
          }
        },
      });
    }
    for (const c of clips() ?? []) {
      list.push({
        id: `cl.${c.id}`,
        type: "clips",
        title: c.text.slice(0, 80),
        hint: new Date(c.createdAt).toLocaleDateString("zh-CN"),
        onClick: async () => {
          try {
            await writeText(c.text);
            showToast({ message: "已复制", kind: "success" });
          } catch {
            showToast({ message: "复制失败，请重试", kind: "error" });
          }
        },
      });
    }
    for (const s of stickies() ?? []) {
      list.push({
        id: `st.${s.id}`,
        type: "stickies",
        title: s.body.slice(0, 80),
        hint: new Date(s.createdAt).toLocaleDateString("zh-CN"),
        onClick: async () => {
          try {
            await writeText(s.body);
            showToast({ message: "已复制", kind: "success" });
          } catch {
            showToast({ message: "复制失败，请重试", kind: "error" });
          }
        },
      });
    }
    for (const t of tasks() ?? []) {
      list.push({
        id: `t.${t.id}`,
        type: "tasks",
        title: t.title,
        hint: t.due
          ? `任务 · 截止 ${new Date(t.due).toLocaleDateString("zh-CN")}`
          : "任务",
        onClick: () => {
          setSelectedTaskId(t.id);
          setDetailOpen(true);
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

  // Query-filtered but type-unfiltered — the source for chip counts.
  const queryMatched = createMemo<Result[]>(() => {
    const query = q().trim();
    if (!query) return [];
    return fuse()
      .search(query)
      .map((r) => r.item);
  });

  const filtered = createMemo<Result[]>(() => {
    let list = queryMatched();
    if (filter() !== "all") list = list.filter((r) => r.type === filter());
    return list;
  });

  const countFor = (t: "all" | ResultType) =>
    t === "all"
      ? queryMatched().length
      : queryMatched().filter((r) => r.type === t).length;

  // Flat index per row for keyboard navigation, carried across groups.
  const grouped = createMemo(() => {
    const groups: { key: ResultType; items: Result[]; start: number }[] = [];
    let start = 0;
    for (const r of filtered()) {
      let g = groups.find((x) => x.key === r.type);
      if (!g) {
        g = { key: r.type, items: [], start };
        groups.push(g);
      }
      g.items.push(r);
      start++;
    }
    return groups;
  });

  // Reset the cursor whenever the result set changes.
  createEffect(() => {
    void filtered();
    setCursorIdx(0);
  });

  // Keep the cursor row in view while navigating with the keyboard.
  createEffect(() => {
    void cursorIdx();
    document
      .querySelector('[data-search-cursor="true"]')
      ?.scrollIntoView({ block: "nearest" });
  });

  const onKeyDown = (e: KeyboardEvent) => {
    const len = filtered().length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursorIdx((i) => Math.min(i + 1, Math.max(0, len - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursorIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const r = filtered()[cursorIdx()];
      if (r) {
        e.preventDefault();
        r.onClick();
      }
    } else if (e.key === "Escape") {
      setQ("");
    }
  };

  const FILTERS = [
    { id: "all", label: "全部" },
    { id: "people", label: "联系人" },
    { id: "messages", label: "消息" },
    { id: "files", label: "文件" },
    { id: "meetings", label: "会议" },
    { id: "drafts", label: "草稿" },
    { id: "tasks", label: "任务" },
  ] as const;

  return (
    <div style={{ animation: "view-enter 0.3s var(--ease-out) both" }}>
      <style>{SEARCH_CSS}</style>
      <header
        style={{ padding: "var(--space-5)", "max-width": "720px", margin: "0 auto" }}
      >
        <h1
          style={{
            "font-family": "var(--font-display)",
            "font-size": "var(--text-h1)",
            "font-weight": "800",
            margin: 0,
          }}
        >
          搜索
        </h1>
      </header>

      <div
        style={{
          padding: "0 var(--space-5) var(--space-4)",
          "max-width": "720px",
          margin: "0 auto",
        }}
      >
        <div style={{ position: "relative" }}>
          <input
            ref={(el) => (inputRef = el)}
            autofocus
            value={q()}
            onInput={(e) => setQ(e.currentTarget.value)}
            onKeyDown={onKeyDown}
            placeholder="搜索整个工作区…"
            aria-label="搜索整个工作区"
            style={{
              width: "100%",
              padding: "var(--space-3) 44px var(--space-3) var(--space-4)",
              background: "var(--paper-light)",
              "border-radius": "var(--radius-pill)",
              border: "0.5px solid var(--border)",
              "font-size": "var(--text-body)",
              "margin-bottom": "var(--space-3)",
            }}
          />
          <Show when={q()}>
            <button
              onClick={() => {
                setQ("");
                inputRef?.focus();
              }}
              aria-label="清空搜索"
              title="清空搜索"
              style={{
                position: "absolute",
                right: "12px",
                top: "calc(var(--space-3) + 2px)",
                color: "var(--text-muted)",
                display: "flex",
                padding: "4px",
              }}
            >
              <Icon name="ph-x" size={14} />
            </button>
          </Show>
        </div>
        <div
          style={{
            display: "flex",
            gap: "var(--space-2)",
            "flex-wrap": "wrap",
            "overflow-x": "auto",
          }}
        >
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
                  display: "flex",
                  "align-items": "center",
                  gap: "4px",
                  "white-space": "nowrap",
                }}
              >
                {f.label}
                <Show when={q().trim()}>
                  <span style={{ opacity: 0.7, "font-size": "10px" }}>
                    {countFor(f.id)}
                  </span>
                </Show>
              </button>
            )}
          </For>
        </div>
      </div>

      <ResourceGate
        resource={ftsResults}
        isLoading={() =>
          ftsResults.loading ||
          files.loading ||
          drafts.loading ||
          events.loading ||
          snippets.loading ||
          clips.loading ||
          stickies.loading ||
          tasks.loading
        }
        loading={
          <div
            style={{
              "max-width": "720px",
              margin: "0 auto",
              padding: "0 var(--space-5) var(--space-5)",
            }}
          >
            <SkeletonList count={6} height={56} />
          </div>
        }
        errorView={() => (
          <ErrorState
            title="搜索失败"
            message="请稍后重试；若反复失败，可到顶栏的错误日志里查看详情。"
            retry={() => void refetchFts()}
          />
        )}
        empty={
          <Empty
            icon="ph-magnifying-glass"
            title={q().trim() ? "无匹配" : "输入关键词开始搜索"}
            description={
              q().trim()
                ? "换个关键词试试，或检查筛选条件。"
                : "搜索联系人 / 消息 / 文件 / 会议 / 草稿 / 任务"
            }
          />
        }
        isEmpty={() => filtered().length === 0}
      >
        {() => (
          <div
            style={{
              "max-width": "720px",
              margin: "0 auto",
              padding: "0 var(--space-5) var(--space-5)",
            }}
          >
            <For each={grouped()}>
              {(group) => (
                <section style={{ "margin-bottom": "var(--space-5)" }}>
                  <h3
                    style={{
                      "font-family": "var(--font-display)",
                      "font-size": "var(--text-h4)",
                      "font-weight": "800",
                      margin: "0 0 var(--space-3)",
                      display: "flex",
                      "align-items": "center",
                      gap: "var(--space-2)",
                    }}
                  >
                    {groupLabel(group.key)}
                    <button
                      onClick={() => setFilter(group.key)}
                      style={{
                        "margin-left": "auto",
                        "font-size": "var(--text-caption)",
                        color: "var(--palm)",
                        "font-weight": "600",
                        background: "transparent",
                        cursor: "pointer",
                      }}
                    >
                      查看全部 →
                    </button>
                  </h3>
                  <For each={group.items}>
                    {(r, i) => {
                      const flatIdx = () => group.start + i();
                      const active = () => cursorIdx() === flatIdx();
                      return (
                        <button
                          class="search-result-row"
                          data-search-cursor={active() ? "true" : undefined}
                          aria-current={active() ? "true" : undefined}
                          onClick={r.onClick}
                          onMouseEnter={() => setCursorIdx(flatIdx())}
                          style={{
                            display: "flex",
                            gap: "var(--space-3)",
                            width: "100%",
                            padding: "var(--space-3)",
                            background: active()
                              ? "var(--paper-mid)"
                              : "var(--paper-light)",
                            "border-radius": "var(--radius-md)",
                            border: "0.5px solid var(--border)",
                            "margin-bottom": "var(--space-2)",
                            "text-align": "left",
                            cursor: "pointer",
                            "align-items": "center",
                          }}
                        >
                          <Show
                            when={r.avatar}
                            fallback={
                              <Icon name={iconForType(r.type)} size={20} />
                            }
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
                      );
                    }}
                  </For>
                </section>
              )}
            </For>
          </div>
        )}
      </ResourceGate>
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
      snippets: "片段",
      clips: "Clips",
      stickies: "便利贴",
      tasks: "任务",
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
      stickies: "ph-note",
      tasks: "ph-check-square",
    }[t] ?? "ph-magnifying-glass"
  );
}

const SEARCH_CSS = `
.search-result-row:hover,
.search-result-row:focus-visible {
  background: var(--paper-mid) !important;
}
`;
