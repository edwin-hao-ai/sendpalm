/** Full Agent workspace view — prototype-v11 §3.9.
 * Desktop: session list | conversation | tasks/drafts.
 * Tablet: session list | conversation. Mobile: single pane with
 * 会话 / 对话 / 任务 switcher.
 */

import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  type JSX,
} from "solid-js";
import {
  useAgent,
  sessionKindLabel,
  taskStatusLabel,
  draftStatusLabel,
  auditKindLabel,
} from "../agent/useAgent";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { Empty, ErrorState } from "../components/Empty";
import { ResourceGate } from "../components/ResourceGate";
import { SkeletonList } from "../components/Skeleton";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ContactPickerModal } from "../components/AgentPanel";
import { composeOpen, detailOpen, setView, showToast } from "../stores/ui";
import { relativeTime } from "../utils/date";
import { sessionIcon, statusColor } from "../utils/agent";
import { useViewport } from "../utils/gestures";
import type { AgentDraft, AgentSession, AgentTask } from "../types";

export function Agent() {
  const agent = useAgent();
  const { isMobile, isTablet } = useViewport();
  const [query, setQuery] = createSignal("");
  const [mobilePane, setMobilePane] = createSignal<"sessions" | "chat" | "tasks">(
    "sessions",
  );

  const filteredSessions = createMemo(() => {
    const q = query().trim().toLowerCase();
    const list = agent.sessions() ?? [];
    if (!q) return list;
    return list.filter((s) => s.title.toLowerCase().includes(q));
  });

  const filteredTasks = createMemo(() => {
    const q = query().trim().toLowerCase();
    const list = agent.tasks() ?? [];
    if (!q) return [];
    return list.filter((t) => t.title.toLowerCase().includes(q));
  });

  const filteredDrafts = createMemo(() => {
    const q = query().trim().toLowerCase();
    const list = agent.drafts() ?? [];
    if (!q) return [];
    return list.filter(
      (d) =>
        d.recipient.toLowerCase().includes(q) ||
        d.subject.toLowerCase().includes(q) ||
        d.body.toLowerCase().includes(q),
    );
  });

  const searching = createMemo(() => query().trim().length > 0);

  const handleKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;
    if (e.key !== "Escape") return;
    // Overlays (compose window, detail panel) own their own Esc handling —
    // don't yank the user out of the Agent view while one is open.
    if (composeOpen() || detailOpen()) return;
    e.preventDefault();
    // First Esc clears an active search; only a second Esc leaves the view.
    if (query().trim()) {
      setQuery("");
      return;
    }
    setView("imbox");
  };

  document.addEventListener("keydown", handleKey);
  onCleanup(() => document.removeEventListener("keydown", handleKey));

  const selectSession = (id: string) => {
    agent.switchSession(id);
    if (isMobile()) setMobilePane("chat");
  };

  const sessionList = (
    <SessionList
      sessions={agent.sessions() ?? []}
      current={agent.currentSession()}
      contacts={agent.contacts() ?? []}
      onSelect={selectSession}
      onNew={agent.newSession}
      onDelete={(id) => void agent.deleteSession(id)}
    />
  );
  const conversation = (
    <Conversation
      session={agent.currentSession()}
      audit={agent.audit() ?? []}
      input={agent.chatInput()}
      thinking={agent.thinking()}
      onInput={agent.setChatInput}
      onSend={agent.sendChat}
    />
  );
  const rightPanel = (
    <RightPanel
      tasks={agent.sessionTasks()}
      drafts={agent.sessionDrafts()}
      onApproveDraft={agent.approveDraft}
      onEditDraft={agent.editDraft}
    />
  );

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        "flex-direction": "column",
        animation: "view-enter 0.3s var(--ease-out) both",
      }}
    >
      {/* Header — prototype renders no inline mini-title; the page title
          is a real block-level H1 and the controls live on a second row. */}
      <div style={{ padding: "var(--space-5) var(--space-5) 0" }}>
        <h1
          style={{
            "font-family": "var(--font-display)",
            "font-size": "var(--text-h1)",
            "font-weight": "800",
            color: "var(--text-primary)",
            margin: 0,
            display: "flex",
            "align-items": "center",
            gap: "var(--space-2)",
          }}
        >
          <Icon name="ph-sparkle" size={24} color="var(--agent)" />
          Agent
        </h1>
      </div>
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
          padding: "var(--space-3) var(--space-5)",
          "border-bottom": "0.5px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-2)",
            padding: "6px 12px",
            background: "var(--paper-light)",
            "border-radius": "var(--radius-pill)",
            border: "0.5px solid var(--border)",
            flex: 1,
            "max-width": "400px",
          }}
        >
          <Icon
            name="ph-magnifying-glass"
            size={14}
            color="var(--text-muted)"
          />
          <input
            value={query()}
            onInput={(e) => setQuery(e.currentTarget.value)}
            placeholder="搜索会话、草稿、任务…"
            aria-label="搜索会话、草稿、任务"
            style={{
              flex: 1,
              "min-width": 0,
              border: "none",
              background: "transparent",
              color: "var(--text-primary)",
              "font-size": "var(--text-body-sm)",
              outline: "none",
            }}
          />
          <Show when={query().trim()}>
            <button
              onClick={() => setQuery("")}
              aria-label="清空搜索"
              style={{ color: "var(--text-muted)", display: "flex" }}
            >
              <Icon name="ph-x" size={12} />
            </button>
          </Show>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setView("imbox")}
          aria-label="关闭 Agent 工作台"
          title="关闭 Agent 工作台 (Esc)"
          style={{
            display: "inline-flex",
            "align-items": "center",
            "justify-content": "center",
            width: "36px",
            height: "36px",
            "border-radius": "var(--radius-pill)",
            background: "var(--paper-mid)",
            color: "var(--text-secondary)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <Icon name="ph-x" size={18} />
        </button>
      </div>

      {/* Mobile pane switcher */}
      <Show when={isMobile()}>
        <div
          style={{
            display: "flex",
            gap: "var(--space-1)",
            padding: "var(--space-2) var(--space-5)",
            "border-bottom": "0.5px solid var(--border)",
          }}
        >
          <For
            each={
              [
                { id: "sessions", label: "会话" },
                { id: "chat", label: "对话" },
                { id: "tasks", label: "任务" },
              ] as const
            }
          >
            {(p) => (
              <button
                onClick={() => setMobilePane(p.id)}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  "min-height": "40px",
                  "border-radius": "var(--radius-pill)",
                  background:
                    mobilePane() === p.id ? "var(--agent)" : "var(--paper-mid)",
                  color: mobilePane() === p.id ? "#fff" : "var(--text-secondary)",
                  "font-size": "var(--text-caption)",
                  "font-weight": "700",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {p.label}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* Workspace */}
      <ResourceGate
        resource={agent.sessionsResource}
        isLoading={() => agent.isLoading()}
        errorView={() => (
          <ErrorState
            title="Agent 加载失败"
            message="加载会话数据时出错，请重试。"
            retry={() => void agent.refetchAll()}
          />
        )}
        loading={
          <div
            style={{
              flex: 1,
              display: "grid",
              "grid-template-columns": isMobile()
                ? "1fr"
                : isTablet()
                  ? "220px 1fr"
                  : "260px 1fr 280px",
              "grid-template-rows": "1fr",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "var(--space-3)",
                "border-right": "0.5px solid var(--border)",
                background: "var(--paper-light)",
              }}
            >
              <SkeletonList count={4} />
            </div>
            <div style={{ padding: "var(--space-5)" }}>
              <SkeletonList count={3} height={80} />
            </div>
            <Show when={!isMobile() && !isTablet()}>
              <div
                style={{
                  padding: "var(--space-3)",
                  "border-left": "0.5px solid var(--border)",
                  background: "var(--paper-light)",
                }}
              >
                <SkeletonList count={3} />
              </div>
            </Show>
          </div>
        }
        // The session column owns its empty state (with the new-session
        // buttons above it), so the gate must never blank the whole
        // three-pane workspace when the list is empty.
        isEmpty={() => false}
      >
        {() => (
          <Show
            when={!searching()}
            fallback={
              <SearchResults
                sessions={filteredSessions()}
                tasks={filteredTasks()}
                drafts={filteredDrafts()}
                onSession={(id) => {
                  setQuery("");
                  selectSession(id);
                }}
                onDraft={(d) => agent.editDraft(d)}
                onTask={(t) => {
                  setQuery("");
                  if (t.sessionId) selectSession(t.sessionId);
                }}
              />
            }
          >
            <Show
              when={!isMobile()}
              fallback={
                <div style={{ flex: 1, overflow: "hidden", display: "flex" }}>
                  <Show when={mobilePane() === "sessions"}>{sessionList}</Show>
                  <Show when={mobilePane() === "chat"}>{conversation}</Show>
                  <Show when={mobilePane() === "tasks"}>{rightPanel}</Show>
                </div>
              }
            >
              <div
                style={{
                  flex: 1,
                  display: "grid",
                  "grid-template-columns": isTablet()
                    ? "220px 1fr"
                    : "260px 1fr 280px",
                  "grid-template-rows": "1fr",
                  overflow: "hidden",
                }}
              >
                {sessionList}
                {conversation}
                <Show when={!isTablet()}>{rightPanel}</Show>
              </div>
            </Show>
          </Show>
        )}
      </ResourceGate>
    </div>
  );
}

function SessionList(props: {
  sessions: AgentSession[];
  current?: AgentSession;
  contacts: { id: string; name: string; avatar?: string }[];
  onSelect: (id: string) => void;
  onNew: (kind: AgentSession["kind"], ref?: string) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [pickingContact, setPickingContact] = createSignal(false);
  const [deleting, setDeleting] = createSignal<AgentSession | null>(null);

  const newContactSession = () => {
    if (props.contacts.length === 0) {
      showToast({
        message: "还没有联系人，先在联系人页添加",
        kind: "warning",
      });
      return;
    }
    setPickingContact(true);
  };

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        "border-right": "0.5px solid var(--border)",
        background: "var(--paper-light)",
        overflow: "hidden",
        flex: 1,
        "min-width": 0,
      }}
    >
      <div
        style={{
          padding: "var(--space-3)",
          "border-bottom": "0.5px solid var(--border)",
          display: "flex",
          gap: "var(--space-2)",
        }}
      >
        <MiniBtn
          icon="ph-chat-circle"
          label="自由对话"
          onClick={() => props.onNew("freeform")}
        />
        <MiniBtn
          icon="ph-envelope"
          label="邮件"
          onClick={() => props.onNew("message")}
        />
        <MiniBtn icon="ph-user" label="联系人" onClick={newContactSession} />
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "var(--space-2)" }}>
        <Show
          when={props.sessions.length > 0}
          fallback={
            <Empty
              icon="ph-chat-circle"
              title="还没有会话"
              description="点上方按钮新建一个会话。"
            />
          }
        >
          <For each={props.sessions}>
            {(s) => (
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "2px",
                  background:
                    props.current?.id === s.id
                      ? "var(--agent-soft)"
                      : "transparent",
                  "border-radius": "var(--radius-md)",
                  "margin-bottom": "var(--space-1)",
                }}
              >
                <button
                  onClick={() => props.onSelect(s.id)}
                  style={{
                    flex: 1,
                    "min-width": 0,
                    padding: "var(--space-3)",
                    background: "transparent",
                    "text-align": "left",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "var(--space-2)",
                    }}
                  >
                    <Icon name={sessionIcon(s.kind)} size={14} />
                    <span
                      style={{
                        flex: 1,
                        "font-weight":
                          props.current?.id === s.id ? "700" : "600",
                        "font-size": "var(--text-body-sm)",
                        "white-space": "nowrap",
                        overflow: "hidden",
                        "text-overflow": "ellipsis",
                      }}
                    >
                      {s.title}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: "4px 0 0 22px",
                      "font-size": "var(--text-micro)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {sessionKindLabel(s.kind)} · {relativeTime(s.createdAt)}
                  </p>
                </button>
                <button
                  onClick={() => setDeleting(s)}
                  aria-label={`删除会话 ${s.title}`}
                  title="删除会话"
                  style={{
                    color: "var(--text-muted)",
                    padding: "8px",
                    "margin-right": "4px",
                    "border-radius": "var(--radius-sm)",
                    display: "flex",
                  }}
                >
                  <Icon name="ph-trash" size={13} />
                </button>
              </div>
            )}
          </For>
        </Show>
      </div>

      <Show when={pickingContact()}>
        <ContactPickerModal
          contacts={props.contacts}
          onPick={(id) => {
            setPickingContact(false);
            void props.onNew("contact", id);
          }}
          onClose={() => setPickingContact(false)}
        />
      </Show>
      <ConfirmDialog
        open={deleting() !== null}
        title={`删除会话「${deleting()?.title ?? ""}」？`}
        body="会话及其任务记录会被删除，已生成的草稿不受影响。"
        confirmLabel="删除"
        onConfirm={() => {
          const s = deleting();
          if (s) props.onDelete(s.id);
        }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function Conversation(props: {
  session?: AgentSession;
  audit: {
    kind: string;
    message: string;
    createdAt: string;
    sessionId?: string;
  }[];
  input: string;
  thinking: boolean;
  onInput: (v: string) => void;
  onSend: () => Promise<void>;
}) {
  const messages = createMemo(() => {
    if (!props.session) return [];
    return props.audit.filter(
      (a) =>
        a.sessionId === props.session!.id &&
        (a.kind === "user_input" ||
          a.kind === "agent_response" ||
          a.kind === "agent_error"),
    );
  });

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        background: "var(--paper)",
        overflow: "hidden",
        flex: 1,
        "min-width": 0,
      }}
    >
      <Show
        when={props.session}
        fallback={
          <div
            style={{
              flex: 1,
              display: "flex",
              "align-items": "center",
              "justify-content": "center",
            }}
          >
            <Empty
              icon="ph-sparkle"
              title="选择一个会话"
              description="在左侧选择或新建一个 Agent 会话。"
            />
          </div>
        }
      >
        <div
          style={{
            flex: 1,
            overflow: "auto",
            padding: "var(--space-4)",
          }}
        >
          <Show
            when={messages().length > 0 || props.thinking}
            fallback={
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  color: "var(--text-muted)",
                  "font-size": "var(--text-body-sm)",
                  "text-align": "center",
                  padding: "0 var(--space-5)",
                }}
              >
                开始和 SendPalm Agent 对话吧 — 比如「帮我起草一封跟进邮件」。
              </div>
            }
          >
            <For each={messages()}>
              {(m) => (
                <div
                  style={{
                    display: "flex",
                    gap: "var(--space-3)",
                    "margin-bottom": "var(--space-3)",
                  }}
                >
                  <div style={{ "flex-shrink": 0, "padding-top": "2px" }}>
                    {m.kind === "user_input" ? (
                      <Avatar name="我" size={28} />
                    ) : (
                      <div
                        style={{
                          width: "28px",
                          height: "28px",
                          "border-radius": "50%",
                          background: "var(--agent-soft)",
                          display: "flex",
                          "align-items": "center",
                          "justify-content": "center",
                          color: "var(--agent)",
                        }}
                      >
                        <Icon name="ph-sparkle" size={14} />
                      </div>
                    )}
                  </div>
                  <div style={{ flex: 1, "min-width": 0 }}>
                    <div
                      style={{
                        "font-size": "var(--text-caption)",
                        "font-weight": "700",
                        color: "var(--text-muted)",
                        "margin-bottom": "2px",
                      }}
                    >
                      {auditKindLabel(m.kind)} · {relativeTime(m.createdAt)}
                    </div>
                    <div
                      style={{
                        padding: "var(--space-3)",
                        background:
                          m.kind === "user_input"
                            ? "var(--paper-light)"
                            : "var(--agent-soft)",
                        "border-radius": "var(--radius-lg)",
                        color: "var(--text-primary)",
                        "font-size": "var(--text-body-sm)",
                        "line-height": "1.6",
                        "overflow-wrap": "anywhere",
                      }}
                    >
                      {m.message}
                    </div>
                  </div>
                </div>
              )}
            </For>
            <Show when={props.thinking}>
              <div
                style={{ display: "flex", gap: "var(--space-3)" }}
                data-testid="agent-thinking"
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    "border-radius": "50%",
                    background: "var(--agent-soft)",
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    color: "var(--agent)",
                    "flex-shrink": 0,
                  }}
                >
                  <Icon name="ph-sparkle" size={14} />
                </div>
                <div
                  style={{
                    padding: "var(--space-3)",
                    "border-radius": "var(--radius-lg)",
                    color: "var(--text-muted)",
                    "font-size": "var(--text-body-sm)",
                    background:
                      "linear-gradient(90deg, var(--agent-soft), var(--paper-mid), var(--agent-soft))",
                    "background-size": "200% 100%",
                    animation: "shimmer 1.6s linear infinite",
                  }}
                >
                  Agent 正在思考…
                </div>
              </div>
            </Show>
          </Show>
        </div>
        <div
          style={{
            "border-top": "0.5px solid var(--border)",
            padding: "var(--space-3) var(--space-4)",
            display: "flex",
            gap: "var(--space-2)",
          }}
        >
          <input
            value={props.input}
            onInput={(e) => props.onInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void props.onSend();
            }}
            placeholder="问 Agent…（Enter 发送）"
            aria-label="问 Agent"
            style={{
              flex: 1,
              "min-width": 0,
              padding: "10px 14px",
              "border-radius": "var(--radius-pill)",
              border: "0.5px solid var(--border)",
              background: "var(--paper-light)",
              color: "var(--text-primary)",
              "font-size": "var(--text-body-sm)",
              outline: "none",
            }}
          />
          <button
            onClick={() => void props.onSend()}
            disabled={!props.input.trim() || !props.session}
            aria-label="发送"
            style={{
              padding: "10px 16px",
              background: "var(--agent)",
              color: "white",
              "border-radius": "var(--radius-pill)",
              "font-weight": "700",
              border: "none",
              cursor:
                props.input.trim() && props.session
                  ? "pointer"
                  : "not-allowed",
              opacity: props.input.trim() && props.session ? 1 : 0.4,
            }}
          >
            <Icon name="ph-paper-plane-tilt" size={14} />
          </button>
        </div>
      </Show>
    </div>
  );
}

function RightPanel(props: {
  tasks: AgentTask[];
  drafts: AgentDraft[];
  onApproveDraft: (d: AgentDraft) => Promise<void>;
  onEditDraft: (d: AgentDraft) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        "border-left": "0.5px solid var(--border)",
        background: "var(--paper-light)",
        overflow: "hidden",
        flex: 1,
        "min-width": 0,
      }}
    >
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "var(--space-3)",
        }}
      >
        <Section title="任务">
          <Show
            when={props.tasks.length > 0}
            fallback={
              <p
                style={{
                  color: "var(--text-muted)",
                  "font-size": "var(--text-caption)",
                }}
              >
                当前会话没有任务
              </p>
            }
          >
            <For each={props.tasks}>
              {(t) => (
                <div
                  style={{
                    padding: "var(--space-3)",
                    background: "var(--paper)",
                    "border-radius": "var(--radius-md)",
                    "margin-bottom": "var(--space-2)",
                    "border-left": `3px solid ${statusColor(t.status)}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "var(--space-2)",
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        "font-weight": "600",
                        "font-size": "var(--text-body-sm)",
                      }}
                    >
                      {t.title}
                    </span>
                    <span
                      style={{
                        padding: "2px 8px",
                        background: "var(--paper-mid)",
                        "border-radius": "var(--radius-pill)",
                        "font-size": "var(--text-micro)",
                        "font-weight": "700",
                      }}
                    >
                      {taskStatusLabel(t.status)}
                    </span>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </Section>

        <Section title="草稿">
          <Show
            when={props.drafts.length > 0}
            fallback={
              <p
                style={{
                  color: "var(--text-muted)",
                  "font-size": "var(--text-caption)",
                }}
              >
                当前会话没有草稿
              </p>
            }
          >
            <For each={props.drafts}>
              {(d) => (
                <div
                  style={{
                    padding: "var(--space-3)",
                    background: "var(--paper)",
                    "border-radius": "var(--radius-md)",
                    "margin-bottom": "var(--space-2)",
                  }}
                >
                  <strong style={{ "font-size": "var(--text-body-sm)" }}>
                    {d.subject}
                  </strong>
                  <p
                    style={{
                      margin: "4px 0",
                      "font-size": "var(--text-caption)",
                      color: "var(--text-muted)",
                    }}
                  >
                    发给 {d.recipient} · {draftStatusLabel(d.status)}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      "font-size": "var(--text-caption)",
                      color: "var(--text-secondary)",
                      display: "-webkit-box",
                      "-webkit-line-clamp": "3",
                      "-webkit-box-orient": "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {d.body}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      gap: "var(--space-2)",
                      "margin-top": "var(--space-2)",
                    }}
                  >
                    <button
                      onClick={() => void props.onApproveDraft(d)}
                      style={miniActionBtn("var(--palm-soft)", "var(--palm)")}
                    >
                      批准
                    </button>
                    <button
                      onClick={() => props.onEditDraft(d)}
                      style={miniActionBtn(
                        "var(--paper-mid)",
                        "var(--text-secondary)",
                      )}
                    >
                      编辑
                    </button>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </Section>
      </div>
    </div>
  );
}

function SearchResults(props: {
  sessions: AgentSession[];
  tasks: AgentTask[];
  drafts: AgentDraft[];
  onSession: (id: string) => void;
  onDraft: (d: AgentDraft) => void;
  onTask: (t: AgentTask) => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        overflow: "auto",
        padding: "var(--space-4)",
        "max-width": "800px",
        margin: "0 auto",
        width: "100%",
      }}
    >
      <Show
        when={
          props.sessions.length + props.tasks.length + props.drafts.length > 0
        }
        fallback={<Empty icon="ph-magnifying-glass" title="没有匹配结果" />}
      >
        <Show when={props.sessions.length > 0}>
          <Group title="会话">
            <For each={props.sessions}>
              {(s) => (
                <ResultRow
                  icon={sessionIcon(s.kind)}
                  title={s.title}
                  meta={`${sessionKindLabel(s.kind)} · ${relativeTime(s.createdAt)}`}
                  onClick={() => props.onSession(s.id)}
                />
              )}
            </For>
          </Group>
        </Show>
        <Show when={props.drafts.length > 0}>
          <Group title="草稿">
            <For each={props.drafts}>
              {(d) => (
                <ResultRow
                  icon="ph-pencil-simple"
                  title={d.recipient}
                  meta={d.subject}
                  onClick={() => props.onDraft(d)}
                />
              )}
            </For>
          </Group>
        </Show>
        <Show when={props.tasks.length > 0}>
          <Group title="任务">
            <For each={props.tasks}>
              {(t) => (
                <ResultRow
                  icon="ph-check-circle"
                  title={t.title}
                  meta={taskStatusLabel(t.status)}
                  onClick={() => props.onTask(t)}
                />
              )}
            </For>
          </Group>
        </Show>
      </Show>
    </div>
  );
}

function Group(props: { title: string; children: JSX.Element }) {
  return (
    <div style={{ "margin-bottom": "var(--space-4)" }}>
      <h3
        style={{
          "font-size": "var(--text-micro)",
          "font-weight": "700",
          "letter-spacing": "0.06em",
          color: "var(--text-muted)",
          margin: "0 0 var(--space-2)",
        }}
      >
        {props.title}
      </h3>
      {props.children}
    </div>
  );
}

function ResultRow(props: {
  icon: string;
  title: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={props.onClick}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "var(--space-3)",
        width: "100%",
        padding: "var(--space-3)",
        background: "var(--paper-light)",
        "border-radius": "var(--radius-md)",
        "margin-bottom": "var(--space-2)",
        "text-align": "left",
        border: "none",
        cursor: "pointer",
      }}
    >
      <Icon name={props.icon} size={18} color="var(--text-muted)" />
      <div style={{ flex: 1, "min-width": 0 }}>
        <div
          style={{
            "font-weight": "600",
            "font-size": "var(--text-body-sm)",
            "white-space": "nowrap",
            overflow: "hidden",
            "text-overflow": "ellipsis",
          }}
        >
          {props.title}
        </div>
        <div
          style={{
            "font-size": "var(--text-caption)",
            color: "var(--text-muted)",
          }}
        >
          {props.meta}
        </div>
      </div>
    </button>
  );
}

function Section(props: { title: string; children: JSX.Element }) {
  return (
    <div style={{ "margin-bottom": "var(--space-4)" }}>
      <h4
        style={{
          "font-size": "var(--text-micro)",
          "font-weight": "700",
          "letter-spacing": "0.06em",
          color: "var(--text-muted)",
          margin: "0 0 var(--space-2)",
        }}
      >
        {props.title}
      </h4>
      {props.children}
    </div>
  );
}

function MiniBtn(props: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      onClick={() => void props.onClick()}
      style={{
        flex: 1,
        display: "flex",
        "flex-direction": "column",
        "align-items": "center",
        gap: "2px",
        padding: "8px 4px",
        "min-height": "44px",
        "justify-content": "center",
        background: "var(--paper-mid)",
        color: "var(--text-secondary)",
        "border-radius": "var(--radius-md)",
        "font-size": "var(--text-micro)",
        "font-weight": "600",
        border: "none",
        cursor: "pointer",
      }}
    >
      <Icon name={props.icon} size={14} />
      {props.label}
    </button>
  );
}

function miniActionBtn(bg: string, color: string) {
  return {
    padding: "6px 12px",
    background: bg,
    color,
    "border-radius": "var(--radius-pill)",
    "font-size": "var(--text-caption)",
    "font-weight": "700",
    border: "none",
    cursor: "pointer",
  } as const;
}
