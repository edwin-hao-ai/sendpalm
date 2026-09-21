/** Command palette (⌘K) — fuzzy search across views/actions/contacts/messages/files.
 * Spec: prototype-v11 §3.15.
 */

import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import Fuse from "fuse.js";
import { listFiles, listDrafts, listEvents, searchIndex } from "../stores/data";
import {
  setCommandPaletteOpen,
  setView,
  setSelectedContactId,
  setDetailOpen,
  setSelectedMessageId,
  setSelectedFileId,
  setSelectedMeetingId,
  setComposeOpen,
  setSelectedDraftId,
  setHelpOpen,
} from "../stores/ui";
import { Icon } from "../components/Icon";
import { Avatar } from "../components/Avatar";

type CommandGroup =
  | "Views"
  | "Actions"
  | "People"
  | "Messages"
  | "Files"
  | "Drafts"
  | "Meetings";

/** Group headers are internal keys; users see Chinese. */
const GROUP_LABEL_ZH: Record<CommandGroup, string> = {
  Views: "视图",
  Actions: "操作",
  People: "联系人",
  Messages: "邮件",
  Files: "文件",
  Drafts: "草稿",
  Meetings: "会议",
};

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  group: CommandGroup;
  run: () => void;
}

const VIEW_COMMANDS: Command[] = [
  {
    id: "v.gate",
    label: "打开 Gate（筛选台）",
    icon: "ph-shield-check",
    group: "Views",
    run: () => setView("screener"),
  },
  {
    id: "v.imbox",
    label: "打开 Imbox（收件箱）",
    icon: "ph-tray",
    group: "Views",
    run: () => setView("imbox"),
  },
  {
    id: "v.feed",
    label: "打开 Stream（资讯流）",
    icon: "ph-newspaper",
    group: "Views",
    run: () => setView("feed"),
  },
  {
    id: "v.paperTrail",
    label: "打开 Records（收据账单）",
    icon: "ph-receipt",
    group: "Views",
    run: () => setView("paperTrail"),
  },
  {
    id: "v.contacts",
    label: "打开联系人",
    icon: "ph-users",
    group: "Views",
    run: () => setView("contacts"),
  },
  {
    id: "v.companies",
    label: "打开公司",
    icon: "ph-buildings",
    group: "Views",
    run: () => setView("companies"),
  },
  {
    id: "v.calendar",
    label: "打开日历",
    icon: "ph-calendar",
    group: "Views",
    run: () => setView("calendar"),
  },
  {
    id: "v.files",
    label: "打开文件",
    icon: "ph-paperclip",
    group: "Views",
    run: () => setView("files"),
  },
  {
    id: "v.drafts",
    label: "打开草稿",
    icon: "ph-pencil-line",
    group: "Views",
    run: () => setView("drafts"),
  },
  {
    id: "v.followUps",
    label: "打开跟进",
    icon: "ph-bell-ringing",
    group: "Views",
    run: () => setView("followUps"),
  },
  {
    id: "v.clips",
    label: "打开 Clips（剪藏）",
    icon: "ph-bookmarks",
    group: "Views",
    run: () => setView("clips"),
  },
  {
    id: "v.pending",
    label: "打开稍后回复",
    icon: "ph-clock",
    group: "Views",
    run: () => setView("replyLater"),
  },
  {
    id: "v.saved",
    label: "打开已搁置",
    icon: "ph-push-pin",
    group: "Views",
    run: () => setView("setAside"),
  },
  {
    id: "v.remind",
    label: "打开提醒",
    icon: "ph-arrow-fat-line-up",
    group: "Views",
    run: () => setView("bubbleUp"),
  },
  {
    id: "v.focusReply",
    label: "打开专注回复",
    icon: "ph-target",
    group: "Views",
    run: () => setView("focusReply"),
  },
  {
    id: "v.insights",
    label: "打开洞察",
    icon: "ph-chart-line-up",
    group: "Views",
    run: () => setView("insights"),
  },
  {
    id: "v.agent",
    label: "打开 Agent 工作台",
    icon: "ph-robot",
    group: "Views",
    run: () => setView("agent"),
  },
  {
    id: "v.settings",
    label: "打开设置",
    icon: "ph-gear",
    group: "Views",
    run: () => setView("settings"),
  },
];

const ACTION_COMMANDS: Command[] = [
  {
    id: "a.compose",
    label: "写新邮件",
    icon: "ph-pencil-line",
    group: "Actions",
    run: () => setComposeOpen(true),
  },
  {
    id: "a.contact",
    label: "新建联系人",
    icon: "ph-user-plus",
    group: "Actions",
    run: () => {
      setView("contacts");
    },
  },
  {
    id: "a.task",
    label: "新建任务",
    icon: "ph-check-square",
    group: "Actions",
    run: () => {
      setView("followUps");
    },
  },
  {
    id: "a.event",
    label: "新建日程",
    icon: "ph-calendar-plus",
    group: "Actions",
    run: () => {
      setView("calendar");
    },
  },
  {
    id: "a.help",
    label: "键盘快捷键",
    icon: "ph-keyboard",
    group: "Actions",
    run: () => setHelpOpen(true),
  },
];

/** Chinese date for meeting hints: 2026-09-21 → "2026年9月21日". */
export function formatEventDateZh(dt: string | number | Date): string {
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

export function CommandPalette() {
  const [query, setQuery] = createSignal("");
  const [debouncedQuery, setDebouncedQuery] = createSignal("");
  const [cursor, setCursor] = createSignal(0);

  createEffect(() => {
    const v = query();
    const id = window.setTimeout(() => setDebouncedQuery(v), 200);
    onCleanup(() => window.clearTimeout(id));
  });

  const [ftsResults] = createResource(debouncedQuery, searchIndex);
  const [files] = createResource(listFiles);
  const [drafts] = createResource(listDrafts);
  const [events] = createResource(listEvents);

  const contactCmds = createMemo<Command[]>(() =>
    (ftsResults() ?? [])
      .filter((r) => r.kind === "contact")
      .map((c) => ({
        id: `c.${c.id}`,
        label: c.title,
        hint: c.body.slice(0, 60),
        icon: "ph-user",
        group: "People" as const,
        run: () => {
          setView("contacts");
          setSelectedContactId(c.id);
          setDetailOpen(true);
        },
      })),
  );

  const messageCmds = createMemo<Command[]>(() =>
    (ftsResults() ?? [])
      .filter((r) => r.kind === "message")
      .map((m) => ({
        id: `m.${m.id}`,
        label: m.title,
        hint: m.body.slice(0, 80).replace(/\n/g, " "),
        icon: "ph-envelope",
        group: "Messages" as const,
        run: () => {
          setSelectedMessageId(m.id);
          setDetailOpen(true);
        },
      })),
  );

  const fileCmds = createMemo<Command[]>(() =>
    (ftsResults() ?? [])
      .filter((r) => r.kind === "file")
      .map((f) => {
        const file = (files() ?? []).find((x) => x.id === f.id);
        return {
          id: `f.${f.id}`,
          label: f.title,
          hint: file
            ? `${file.type} · ${(file.size / 1024).toFixed(0)} KB`
            : f.body,
          icon: file
            ? file.type === "pdf"
              ? "ph-file-pdf"
              : file.type === "image"
                ? "ph-file-image"
                : "ph-file-text"
            : "ph-file-text",
          group: "Files" as const,
          run: () => {
            setSelectedFileId(f.id);
            setDetailOpen(true);
          },
        };
      }),
  );

  const draftCmds = createMemo<Command[]>(() =>
    (drafts() ?? []).slice(0, 15).map((d) => ({
      id: `d.${d.id}`,
      label: d.subject || "(无主题)",
      hint: d.recipient ? `收件人：${d.recipient}` : undefined,
      icon: "ph-file-text",
      group: "Drafts",
      run: () => {
        setSelectedDraftId(d.id);
        setDetailOpen(true);
      },
    })),
  );

  const eventCmds = createMemo<Command[]>(() =>
    (events() ?? []).slice(0, 15).map((e) => ({
      id: `e.${e.id}`,
      label: e.title,
      hint: `${formatEventDateZh(e.dt)} · ${e.tm}`,
      icon: "ph-calendar-blank",
      group: "Meetings",
      run: () => {
        setSelectedMeetingId(e.id);
        setDetailOpen(true);
      },
    })),
  );

  const allCommands = createMemo<Command[]>(() => [
    ...VIEW_COMMANDS,
    ...ACTION_COMMANDS,
    ...contactCmds(),
    ...messageCmds(),
    ...fileCmds(),
    ...draftCmds(),
    ...eventCmds(),
  ]);

  const fuse = createMemo(
    () =>
      new Fuse(allCommands(), {
        keys: ["label", "hint", "group"],
        threshold: 0.3,
        ignoreLocation: true,
      }),
  );

  const results = createMemo<Command[]>(() => {
    const q = query().trim();
    if (!q) return allCommands().slice(0, 12);
    return fuse()
      .search(q)
      .slice(0, 20)
      .map((r) => r.item);
  });

  const grouped = createMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const c of results()) {
      (groups[c.group] ||= []).push(c);
    }
    return groups;
  });

  const flatResults = createMemo(() => results());
  const run = (c: Command) => {
    c.run();
    setCommandPaletteOpen(false);
    setQuery("");
    setCursor(0);
  };

  const moveCursor = (delta: number) => {
    const len = flatResults().length;
    if (len === 0) return;
    setCursor((cur) => {
      const next = cur + delta;
      if (next < 0) return len - 1;
      if (next >= len) return 0;
      return next;
    });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveCursor(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveCursor(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = flatResults()[cursor()];
      if (c) run(c);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      setCommandPaletteOpen(false);
      setQuery("");
      setCursor(0);
    }
  };

  onMount(() => {
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => document.removeEventListener("keydown", onKeyDown));
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(35,28,51,0.4)",
        "backdrop-filter": "blur(6px)",
        "-webkit-backdrop-filter": "blur(6px)",
        display: "flex",
        "align-items": "flex-start",
        "justify-content": "center",
        "padding-top": "12vh",
        "z-index": "var(--z-modal)",
        animation: "backdrop-fade-in 0.18s var(--ease-out) both",
      }}
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        role="dialog"
        aria-label="命令面板"
        style={{
          width: "600px",
          "max-width": "92vw",
          background: "var(--glass-bg)",
          "backdrop-filter": "var(--glass-blur)",
          "-webkit-backdrop-filter": "var(--glass-blur)",
          border: "0.5px solid var(--glass-border)",
          "border-radius": "var(--radius-xl)",
          "box-shadow": "var(--glass-shadow)",
          overflow: "hidden",
          "transform-origin": "top center",
          animation: "modal-enter 0.24s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-3)",
            padding: "var(--space-3) var(--space-4)",
            "border-bottom": "0.5px solid var(--border)",
          }}
        >
          <Icon name="ph-magnifying-glass" size={18} />
          <input
            autofocus
            value={query()}
            onInput={(e) => {
              setQuery(e.currentTarget.value);
              setCursor(0);
            }}
            placeholder="搜索视图、操作、联系人、邮件…"
            aria-label="搜索命令"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              "font-size": "var(--text-body)",
            }}
          />
          <kbd style={kbdStyle}>esc</kbd>
        </div>
        <ul
          style={{
            "list-style": "none",
            margin: 0,
            padding: "var(--space-2)",
            "max-height": "60vh",
            "overflow-y": "auto",
          }}
        >
          <Show
            when={flatResults().length > 0}
            fallback={
              <li
                style={{
                  padding: "var(--space-4)",
                  color: "var(--text-muted)",
                  "font-size": "var(--text-caption)",
                  "text-align": "center",
                }}
              >
                没有匹配的结果
              </li>
            }
          >
            {(() => {
              let idx = -1;
              return (
                <For each={Object.keys(grouped())}>
                  {(group) => (
                    <>
                      <li
                        style={{
                          "font-size": "var(--text-micro)",
                          color: "var(--text-muted)",
                          "font-weight": "700",
                          padding: "var(--space-1) var(--space-3)",
                          "letter-spacing": "0.04em",
                        }}
                      >
                        {GROUP_LABEL_ZH[group as CommandGroup] ?? group}
                      </li>
                      <For each={grouped()[group]}>
                        {(c) => {
                          idx += 1;
                          const active = idx === cursor();
                          return (
                            <li>
                              <button
                                onClick={() => run(c)}
                                onMouseEnter={() => setCursor(idx)}
                                style={{
                                  display: "flex",
                                  "align-items": "center",
                                  gap: "var(--space-3)",
                                  width: "100%",
                                  padding: "var(--space-2) var(--space-3)",
                                  "border-radius": "var(--radius-md)",
                                  background: active
                                    ? "var(--palm-soft)"
                                    : "transparent",
                                  color: active
                                    ? "var(--palm)"
                                    : "var(--text-primary)",
                                  "text-align": "left",
                                }}
                              >
                                <Show
                                  when={c.group === "People"}
                                  fallback={<Icon name={c.icon} size={16} />}
                                >
                                  <Avatar name={c.label} size={20} />
                                </Show>
                                <span
                                  style={{
                                    flex: 1,
                                    "white-space": "nowrap",
                                    overflow: "hidden",
                                    "text-overflow": "ellipsis",
                                  }}
                                >
                                  {c.label}
                                </span>
                                <Show when={c.hint}>
                                  <span
                                    style={{
                                      "font-size": "var(--text-micro)",
                                      color: "var(--text-muted)",
                                      "white-space": "nowrap",
                                    }}
                                  >
                                    {c.hint}
                                  </span>
                                </Show>
                              </button>
                            </li>
                          );
                        }}
                      </For>
                    </>
                  )}
                </For>
              );
            })()}
          </Show>
        </ul>
        {/* Keyboard hints footer */}
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-3)",
            padding: "var(--space-2) var(--space-4)",
            "border-top": "0.5px solid var(--border)",
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
          }}
        >
          <span>
            <kbd style={kbdStyle}>↑↓</kbd> 选择
          </span>
          <span>
            <kbd style={kbdStyle}>↵</kbd> 打开
          </span>
          <span>
            <kbd style={kbdStyle}>esc</kbd> 关闭
          </span>
        </div>
      </div>
    </div>
  );
}

const kbdStyle = {
  padding: "2px 6px",
  background: "var(--paper-mid)",
  "border-radius": "var(--radius-sm)",
  "font-size": "10px",
  "font-weight": "600",
  color: "var(--text-muted)",
};
