/** Full Agent workspace view — prototype-v11 §3.9.
 * Three-column layout: session list | conversation | tasks/drafts.
 */

import {
  For,
  Show,
  createMemo,
  createSignal,
  onCleanup,
  type JSX,
} from "solid-js";
import { useAgent } from "../agent/useAgent";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { Empty } from "../components/Empty";
import { setView } from "../stores/ui";
import { relativeTime } from "../utils/date";
import { sessionIcon, statusColor } from "../utils/agent";
import type { AgentDraft, AgentSession, AgentTask } from "../types";

export function Agent() {
  const agent = useAgent();
  const [query, setQuery] = createSignal("");

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
    if (e.key === "Escape") {
      e.preventDefault();
      setView("imbox");
    }
  };

  document.addEventListener("keydown", handleKey);
  onCleanup(() => document.removeEventListener("keydown", handleKey));

  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        "flex-direction": "column",
        animation: "view-enter 0.3s var(--ease-out) both",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-3)",
          padding: "var(--space-3) var(--space-4)",
          "border-bottom": "0.5px solid var(--border)",
        }}
      >
        <Icon name="ph-sparkle" size={20} color="var(--agent)" />
        <h1
          style={{
            "font-family": "var(--font-display)",
            "font-size": "var(--text-h4)",
            "font-weight": "800",
            color: "var(--text-primary)",
            margin: 0,
            flex: 1,
          }}
        >
          SendPalm Agent
        </h1>
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
            placeholder="Search sessions, drafts, tasks..."
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              color: "var(--text-primary)",
              "font-size": "var(--text-body-sm)",
              outline: "none",
            }}
          />
        </div>
        <button
          onClick={() => setView("imbox")}
          aria-label="Close Agent view"
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

      {/* Workspace */}
      <Show
        when={!searching()}
        fallback={
          <SearchResults
            sessions={filteredSessions()}
            tasks={filteredTasks()}
            drafts={filteredDrafts()}
            onSession={(id) => {
              setQuery("");
              agent.switchSession(id);
            }}
            onDraft={(d) => agent.editDraft(d)}
            onTask={(t) => {
              setQuery("");
              if (t.sessionId) agent.switchSession(t.sessionId);
            }}
          />
        }
      >
        <div
          style={{
            flex: 1,
            display: "grid",
            "grid-template-columns": "260px 1fr 280px",
            "grid-template-rows": "1fr",
            overflow: "hidden",
          }}
        >
          <SessionList
            sessions={agent.sessions() ?? []}
            current={agent.currentSession()}
            contacts={agent.contacts() ?? []}
            onSelect={agent.switchSession}
            onNew={agent.newSession}
          />
          <Conversation
            session={agent.currentSession()}
            audit={agent.audit() ?? []}
            input={agent.chatInput()}
            onInput={agent.setChatInput}
            onSend={agent.sendChat}
          />
          <RightPanel
            tasks={agent.sessionTasks()}
            drafts={agent.sessionDrafts()}
            onApproveDraft={agent.approveDraft}
            onEditDraft={agent.editDraft}
          />
        </div>
      </Show>
    </div>
  );
}

function SessionList(props: {
  sessions: AgentSession[];
  current?: AgentSession;
  contacts: { id: string; name: string; avatar?: string }[];
  onSelect: (id: string) => void;
  onNew: (kind: AgentSession["kind"], ref?: string) => Promise<void>;
}) {
  const contact = () => props.contacts[0];

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        "border-right": "0.5px solid var(--border)",
        background: "var(--paper-light)",
        overflow: "hidden",
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
          label="Freeform"
          onClick={() => props.onNew("freeform")}
        />
        <MiniBtn
          icon="ph-envelope"
          label="Msg"
          onClick={() => props.onNew("message")}
        />
        <MiniBtn
          icon="ph-user"
          label="Contact"
          onClick={() => props.onNew("contact", contact()?.id)}
        />
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "var(--space-2)" }}>
        <Show
          when={props.sessions.length > 0}
          fallback={
            <Empty
              icon="ph-chat-circle"
              title="还没有会话"
              description="点击上方按钮新建。"
            />
          }
        >
          <For each={props.sessions}>
            {(s) => (
              <button
                onClick={() => props.onSelect(s.id)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "var(--space-3)",
                  background:
                    props.current?.id === s.id
                      ? "var(--agent-soft)"
                      : "transparent",
                  "border-radius": "var(--radius-md)",
                  "margin-bottom": "var(--space-1)",
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
                      "font-weight": props.current?.id === s.id ? "700" : "600",
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
                    "font-size": "10px",
                    color: "var(--text-muted)",
                  }}
                >
                  {s.kind} · {relativeTime(s.createdAt)}
                </p>
              </button>
            )}
          </For>
        </Show>
      </div>
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
  onInput: (v: string) => void;
  onSend: () => Promise<void>;
}) {
  const messages = createMemo(() => {
    if (!props.session) return [];
    return props.audit.filter((a) => a.sessionId === props.session!.id);
  });

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        background: "var(--paper)",
        overflow: "hidden",
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
            when={messages().length > 0}
            fallback={
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "center",
                  color: "var(--text-muted)",
                  "font-size": "var(--text-body-sm)",
                }}
              >
                Start a conversation with SendPalm Agent.
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
                      <Avatar name="You" size={28} />
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
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        "font-size": "var(--text-caption)",
                        "font-weight": "700",
                        color: "var(--text-muted)",
                        "margin-bottom": "2px",
                      }}
                    >
                      {m.kind === "user_input" ? "You" : "Agent"} ·{" "}
                      {relativeTime(m.createdAt)}
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
            placeholder="Ask Agent…"
            style={{
              flex: 1,
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
            style={{
              padding: "10px 16px",
              background: "var(--agent)",
              color: "white",
              "border-radius": "var(--radius-pill)",
              "font-weight": "700",
              border: "none",
              cursor: "pointer",
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
      }}
    >
      <div
        style={{
          flex: 1,
          overflow: "auto",
          padding: "var(--space-3)",
        }}
      >
        <Section title="Active tasks">
          <Show
            when={props.tasks.length > 0}
            fallback={
              <p style={{ color: "var(--text-muted)", "font-size": "10px" }}>
                无
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
                        "font-size": "10px",
                        "font-weight": "700",
                      }}
                    >
                      {t.status}
                    </span>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </Section>

        <Section title="Drafts">
          <Show
            when={props.drafts.length > 0}
            fallback={
              <p style={{ color: "var(--text-muted)", "font-size": "10px" }}>
                无
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
                    to {d.recipient} · {d.status}
                  </p>
                  <p
                    style={{
                      margin: 0,
                      "font-size": "10px",
                      color: "var(--text-secondary)",
                      "max-height": "60px",
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
                      Send
                    </button>
                    <button
                      onClick={() => props.onEditDraft(d)}
                      style={miniActionBtn(
                        "var(--paper-mid)",
                        "var(--text-secondary)",
                      )}
                    >
                      Edit
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
        fallback={<Empty icon="ph-magnifying-glass" title="No results" />}
      >
        <Show when={props.sessions.length > 0}>
          <Group title="Sessions">
            <For each={props.sessions}>
              {(s) => (
                <ResultRow
                  icon={sessionIcon(s.kind)}
                  title={s.title}
                  meta={`${s.kind} · ${relativeTime(s.createdAt)}`}
                  onClick={() => props.onSession(s.id)}
                />
              )}
            </For>
          </Group>
        </Show>
        <Show when={props.drafts.length > 0}>
          <Group title="Drafts">
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
          <Group title="Tasks">
            <For each={props.tasks}>
              {(t) => (
                <ResultRow
                  icon="ph-check-circle"
                  title={t.title}
                  meta={t.status}
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
          "text-transform": "uppercase",
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
          "text-transform": "uppercase",
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
        padding: "6px 4px",
        background: "var(--paper-mid)",
        color: "var(--text-secondary)",
        "border-radius": "var(--radius-md)",
        "font-size": "10px",
        "font-weight": "600",
        border: "none",
        cursor: "pointer",
      }}
    >
      <Icon name={props.icon} size={12} />
      {props.label}
    </button>
  );
}

function miniActionBtn(bg: string, color: string) {
  return {
    padding: "4px 10px",
    background: bg,
    color,
    "border-radius": "var(--radius-pill)",
    "font-size": "10px",
    "font-weight": "700",
    border: "none",
    cursor: "pointer",
  } as const;
}
