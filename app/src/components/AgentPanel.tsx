/** AgentPanel — sessions, tasks, drafts, memory, audit log.
 * Spec: prototype-v11 §3.9.
 */

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import {
  listAgentSessions, listAgentTasks, listAgentDrafts, listAgentAudit, listContacts,
  upsertAgentSession, upsertAgentTask, upsertAgentDraft,
  upsertAgentAudit, deleteAgentAudit,
} from "../stores/data";
import { Icon } from "../components/Icon";
import { Empty } from "../components/Empty";
import { setAgentPanelOpen, setDetailOpen, setSelectedDraftId, showToast } from "../stores/ui";
import { PanelResizeHandle } from "./PanelResizeHandle";
import { uid } from "../utils/id";
import { isoNow, relativeTime } from "../utils/date";
import type { AgentSession, AgentTask, AgentDraft, AgentSessionKind } from "../types";

export function AgentPanel() {
  const [sessions] = createResource(() => listAgentSessions());
  const [tasks] = createResource(() => listAgentTasks());
  const [drafts] = createResource(() => listAgentDrafts());
  const [audit] = createResource(() => listAgentAudit());
  const [contacts] = createResource(() => listContacts());
  const [activeSessionId, setActiveSessionId] = createSignal<string | null>(null);
  const [chatInput, setChatInput] = createSignal("");
  const [tab, setTab] = createSignal<"sessions" | "tasks" | "drafts" | "memory" | "audit">("sessions");

  const currentSession = createMemo<AgentSession | undefined>(() => {
    const id = activeSessionId();
    if (id) return (sessions() ?? []).find((s) => s.id === id);
    return (sessions() ?? [])[0];
  });

  const sessionTasks = createMemo<AgentTask[]>(() => {
    const id = currentSession()?.id;
    if (!id) return [];
    return (tasks() ?? []).filter((t) => t.sessionId === id);
  });

  const contactById = (id: string) => (contacts() ?? []).find((c) => c.id === id);

  const newSession = async (kind: AgentSessionKind, ref?: string) => {
    const titleMap: Record<AgentSessionKind, string> = {
      freeform: "Freeform",
      message: "Message",
      contact: ref ? `${contactById(ref)?.name ?? "?"} 上下文` : "Contact",
      event: "Event",
      file: "File",
    };
    const session: AgentSession = {
      id: uid("as"),
      kind,
      title: titleMap[kind],
      context: ref ? { type: kind, ref } : null,
      createdAt: isoNow(),
    };
    await upsertAgentSession(session);
    setActiveSessionId(session.id);
    await appendAudit("session_new", `新建会话 · ${session.title}`);
    showToast({ message: "新会话已创建", kind: "success" });
  };

  const sendChat = async () => {
    const input = chatInput().trim();
    if (!input || !currentSession()) return;
    await appendAudit("user_input", input);
    setChatInput("");
    // Simulate agent response after 800ms
    setTimeout(async () => {
      await appendAudit("agent_response", "Agent 正在处理你的请求…（M6 接入真实 LLM）");
      const t: AgentTask = {
        id: uid("at"),
        sessionId: currentSession()!.id,
        title: input,
        description: "Agent 生成的任务",
        status: "doing",
        steps: [
          { id: uid("st"), label: "分析请求", done: true },
          { id: uid("st"), label: "查找上下文", done: false },
          { id: uid("st"), label: "生成结果", done: false },
        ],
        confidence: 75,
        trigger: input,
        createdAt: isoNow(),
      };
      await upsertAgentTask(t);
      showToast({ message: "Agent 已开始处理", kind: "info" });
    }, 600);
  };

  const appendAudit = async (kind: string, message: string, payload?: string) => {
    await upsertAgentAudit({
      id: uid("aa"),
      sessionId: currentSession()?.id,
      kind,
      message,
      payload,
      createdAt: isoNow(),
      undoable: false,
    });
  };

  const approveDraft = async (d: AgentDraft) => {
    await upsertAgentDraft({ ...d, status: "approved" });
    await appendAudit("draft_approved", `草稿已审批 · ${d.subject}`);
    showToast({ message: "已审批 — 进入发送队列", kind: "success" });
  };

  const editDraft = (d: AgentDraft) => {
    setSelectedDraftId(d.id);
    setDetailOpen(true);
    setAgentPanelOpen(false);
  };

  const tabs = [
    { id: "sessions", label: "会话", icon: "ph-chat-circle" },
    { id: "tasks", label: "任务", icon: "ph-list-checks" },
    { id: "drafts", label: "草稿", icon: "ph-pencil-line" },
    { id: "memory", label: "记忆", icon: "ph-brain" },
    { id: "audit", label: "审计", icon: "ph-clock-counter-clockwise" },
  ] as const;

  return (
    <aside
      id="agent-panel"
      style={{
        background: "var(--surface-elevated)",
        "border-left": "0.5px solid var(--border)",
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        position: "relative",
      }}
    >
      <PanelResizeHandle panel="agent" side="left" />
      {/* Header */}
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          "border-bottom": "0.5px solid var(--border)",
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
        }}
      >
        <Icon name="ph-sparkle" size={18} color="var(--agent)" />
        <strong style={{ "font-size": "var(--text-body-sm)", "font-weight": "700", flex: 1 }}>SendPalm Agent</strong>
        <button
          onClick={() => setAgentPanelOpen(false)}
          aria-label="Close agent panel"
          style={{ color: "var(--text-muted)", padding: "4px" }}
        >
          <Icon name="ph-x" size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", "border-bottom": "0.5px solid var(--border)", padding: "0 var(--space-2)" }}>
        <For each={tabs}>
          {(t) => (
            <button
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: "8px 4px",
                "border-bottom": tab() === t.id ? "2px solid var(--agent)" : "2px solid transparent",
                color: tab() === t.id ? "var(--agent)" : "var(--text-muted)",
                "font-size": "10px",
                "font-weight": tab() === t.id ? "700" : "500",
                display: "flex",
                "flex-direction": "column",
                "align-items": "center",
                gap: "2px",
              }}
            >
              <Icon name={t.icon} size={14} />
              {t.label}
            </button>
          )}
        </For>
      </div>

      {/* Content */}
      <div style={{ flex: 1, "overflow-y": "auto", padding: "var(--space-3)" }}>
        {/* Sessions tab */}
        <Show when={tab() === "sessions"}>
          <div style={{ display: "flex", gap: "var(--space-1)", "flex-wrap": "wrap", "margin-bottom": "var(--space-3)" }}>
            <button onClick={() => newSession("freeform")} style={miniBtn}>+ Freeform</button>
            <button onClick={() => newSession("message")} style={miniBtn}>+ Message</button>
            <button onClick={() => newSession("contact", (contacts() ?? [])[0]?.id)} style={miniBtn}>+ Contact</button>
          </div>

          <Show when={(sessions() ?? []).length > 0} fallback={
            <Empty icon="ph-chat-circle" title="还没会话" description="点 + 新建一个。" />
          }>
            <For each={sessions() ?? []}>
              {(s) => (
                <button
                  onClick={() => setActiveSessionId(s.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "var(--space-3)",
                    background: currentSession()?.id === s.id ? "var(--agent-soft)" : "var(--paper-light)",
                    "border-radius": "var(--radius-md)",
                    "margin-bottom": "var(--space-2)",
                    "text-align": "left",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", "align-items": "center", gap: "var(--space-2)" }}>
                    <Icon name={
                      s.kind === "freeform" ? "ph-chat-circle" :
                      s.kind === "message" ? "ph-envelope" :
                      s.kind === "contact" ? "ph-user" :
                      s.kind === "event" ? "ph-calendar-blank" : "ph-file"
                    } size={14} />
                    <span style={{ flex: 1, "font-weight": "600", "font-size": "var(--text-body-sm)" }}>{s.title}</span>
                  </div>
                  <p style={{ margin: "4px 0 0", "font-size": "10px", color: "var(--text-muted)" }}>
                    {s.kind} · {relativeTime(s.createdAt)}
                  </p>
                </button>
              )}
            </For>
          </Show>

          {/* Tasks of current session */}
          <Show when={currentSession()}>
            <div style={{ "border-top": "0.5px solid var(--border)", "padding-top": "var(--space-3)", "margin-top": "var(--space-3)" }}>
              <h4 style={{ "font-size": "var(--text-micro)", "font-weight": "700", "letter-spacing": "0.06em", "text-transform": "uppercase", color: "var(--text-muted)", margin: "0 0 var(--space-2)" }}>
                Active tasks
              </h4>
              <Show when={sessionTasks().length > 0} fallback={<p style={{ color: "var(--text-muted)", "font-size": "10px" }}>无</p>}>
                <For each={sessionTasks()}>
                  {(t) => (
                    <div style={{
                      padding: "var(--space-3)",
                      background: "var(--paper-light)",
                      "border-radius": "var(--radius-md)",
                      "margin-bottom": "var(--space-2)",
                      "border-left": `3px solid ${t.status === "done" ? "var(--palm)" : t.status === "doing" ? "var(--yellow)" : "var(--text-muted)"}`,
                    }}>
                      <div style={{ display: "flex", "align-items": "center", gap: "var(--space-2)" }}>
                        <span style={{ "font-size": "var(--text-body-sm)", "font-weight": "600", flex: 1 }}>{t.title}</span>
                        <span style={{
                          padding: "2px 8px",
                          background: "var(--paper-mid)",
                          "border-radius": "var(--radius-pill)",
                          "font-size": "10px",
                          "font-weight": "700",
                        }}>{t.status}</span>
                      </div>
                      <Show when={t.steps.length > 0}>
                        <div style={{ "margin-top": "var(--space-2)" }}>
                          <For each={t.steps}>
                            {(s) => (
                              <div style={{ display: "flex", "align-items": "center", gap: "4px", "font-size": "10px", color: s.done ? "var(--palm)" : "var(--text-muted)" }}>
                                <Icon name={s.done ? "ph-check-circle" : "ph-circle"} size={11} />
                                {s.label}
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                      <Show when={t.confidence}>
                        <div style={{ "font-size": "10px", color: "var(--text-muted)", "margin-top": "var(--space-2)" }}>
                          <Icon name="ph-percent" size={10} /> confidence {t.confidence}%
                        </div>
                      </Show>
                    </div>
                  )}
                </For>
              </Show>
            </div>
          </Show>
        </Show>

        {/* Tasks tab */}
        <Show when={tab() === "tasks"}>
          <Show when={(tasks() ?? []).length > 0} fallback={<Empty icon="ph-list-checks" title="没有任务" />}>
            <For each={tasks() ?? []}>
              {(t) => (
                <div style={{
                  padding: "var(--space-3)",
                  background: "var(--paper-light)",
                  "border-radius": "var(--radius-md)",
                  "margin-bottom": "var(--space-2)",
                }}>
                  <div style={{ display: "flex", "align-items": "center", gap: "var(--space-2)" }}>
                    <span style={{ flex: 1, "font-weight": "600", "font-size": "var(--text-body-sm)" }}>{t.title}</span>
                    <span style={{ "font-size": "10px", color: "var(--text-muted)" }}>{t.status}</span>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </Show>

        {/* Drafts tab */}
        <Show when={tab() === "drafts"}>
          <Show when={(drafts() ?? []).length > 0} fallback={<Empty icon="ph-pencil-line" title="没有草稿" />}>
            <For each={drafts() ?? []}>
              {(d) => (
                <div style={{
                  padding: "var(--space-3)",
                  background: "var(--paper-light)",
                  "border-radius": "var(--radius-md)",
                  "margin-bottom": "var(--space-2)",
                }}>
                  <strong style={{ "font-size": "var(--text-body-sm)" }}>{d.subject}</strong>
                  <p style={{ margin: "4px 0", "font-size": "var(--text-caption)", color: "var(--text-muted)" }}>
                    to {d.recipient} · {d.status}
                  </p>
                  <p style={{ margin: 0, "font-size": "10px", color: "var(--text-secondary)", "max-height": "60px", overflow: "hidden" }}>
                    {d.body}
                  </p>
                  <div style={{ display: "flex", gap: "var(--space-2)", "margin-top": "var(--space-2)" }}>
                    <button onClick={() => approveDraft(d)} style={{ padding: "4px 10px", background: "var(--palm-soft)", color: "var(--palm)", "border-radius": "var(--radius-pill)", "font-size": "10px", "font-weight": "700" }}>
                      Send
                    </button>
                    <button onClick={() => editDraft(d)} style={{ padding: "4px 10px", background: "var(--paper-mid)", color: "var(--text-secondary)", "border-radius": "var(--radius-pill)", "font-size": "10px", "font-weight": "700" }}>
                      Edit
                    </button>
                    <button style={{ padding: "4px 10px", background: "transparent", color: "var(--text-muted)", "border-radius": "var(--radius-pill)", "font-size": "10px" }}>
                      Edit manually
                    </button>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </Show>

        {/* Memory tab */}
        <Show when={tab() === "memory"}>
          <Show when={currentSession()}>
            <h4 style={{ "font-size": "var(--text-micro)", "font-weight": "700", "letter-spacing": "0.06em", "text-transform": "uppercase", color: "var(--text-muted)", margin: "0 0 var(--space-2)" }}>
              Current session
            </h4>
            <div style={{ padding: "var(--space-3)", background: "var(--paper-light)", "border-radius": "var(--radius-md)", "margin-bottom": "var(--space-3)" }}>
              <p style={{ margin: 0, "font-size": "var(--text-body-sm)" }}>
                {currentSession()!.title}
              </p>
              <p style={{ margin: "var(--space-1) 0 0", "font-size": "10px", color: "var(--text-muted)" }}>
                {currentSession()!.kind} · {relativeTime(currentSession()!.createdAt)}
              </p>
            </div>
          </Show>
          <h4 style={{ "font-size": "var(--text-micro)", "font-weight": "700", "letter-spacing": "0.06em", "text-transform": "uppercase", color: "var(--text-muted)", margin: "var(--space-3) 0 var(--space-2)" }}>
            Memory
          </h4>
          <p style={{ "font-size": "var(--text-caption)", color: "var(--text-secondary)" }}>
            记忆在全局 / per-contact 维度管理。在 tauri-plugin-store 中持久化。
          </p>
          <p style={{ "font-size": "var(--text-caption)", color: "var(--text-muted)", "margin-top": "var(--space-3)" }}>
            M10 接入 LLM 时启用真实记忆抽取与编辑。
          </p>
        </Show>

        {/* Audit tab */}
        <Show when={tab() === "audit"}>
          <Show when={(audit() ?? []).length > 0} fallback={<Empty icon="ph-clock-counter-clockwise" title="还没有审计记录" />}>
            <For each={audit() ?? []}>
              {(a) => (
                <div style={{
                  padding: "var(--space-2) 0",
                  "border-bottom": "0.5px solid var(--border)",
                }}>
                  <div style={{ display: "flex", "align-items": "center", gap: "var(--space-2)" }}>
                    <Icon name={
                      a.kind === "draft_approved" ? "ph-check-circle" :
                      a.kind === "session_new" ? "ph-plus-circle" :
                      a.kind === "user_input" ? "ph-chat-circle" :
                      a.kind === "agent_response" ? "ph-sparkle" :
                      "ph-activity"
                    } size={12} />
                    <span style={{ flex: 1, "font-size": "var(--text-caption)" }}>{a.message}</span>
                    <Show when={a.undoable}>
                      <button style={{ "font-size": "10px", color: "var(--palm)" }}>Undo</button>
                    </Show>
                  </div>
                  <p style={{ margin: "2px 0 0 20px", "font-size": "10px", color: "var(--text-muted)" }}>
                    {a.kind} · {relativeTime(a.createdAt)}
                  </p>
                </div>
              )}
            </For>
            <button
              onClick={async () => {
              const list = audit() ?? [];
              for (const a of list) await deleteAgentAudit(a.id);
              showToast({ message: "审计已清空", kind: "info" });
            }}
              style={{ "margin-top": "var(--space-3)", padding: "6px 12px", background: "var(--paper-mid)", color: "var(--text-muted)", "border-radius": "var(--radius-pill)", "font-size": "10px" }}
            >
              清空审计
            </button>
          </Show>
        </Show>
      </div>

      {/* Chat input */}
      <Show when={tab() === "sessions"}>
        <div style={{ "border-top": "0.5px solid var(--border)", padding: "var(--space-3)", display: "flex", gap: "var(--space-2)", background: "var(--surface-recessed)" }}>
          <input
            value={chatInput()}
            onInput={(e) => setChatInput(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter") sendChat(); }}
            placeholder="Ask Agent…"
            style={{
              flex: 1,
              padding: "6px 12px",
              "border-radius": "var(--radius-pill)",
              border: "0.5px solid var(--border)",
              background: "var(--paper-light)",
              "font-size": "var(--text-body-sm)",
            }}
          />
          <button
            onClick={sendChat}
            disabled={!chatInput().trim() || !currentSession()}
            style={{
              padding: "6px 14px",
              background: "var(--agent)",
              color: "white",
              "border-radius": "var(--radius-pill)",
              "font-size": "var(--text-caption)",
              "font-weight": "700",
              opacity: chatInput().trim() && currentSession() ? 1 : 0.4,
            }}
          >
            <Icon name="ph-paper-plane-tilt" size={12} />
          </button>
        </div>
      </Show>
    </aside>
  );
}

const miniBtn = {
  padding: "4px 10px",
  background: "var(--paper-mid)",
  "border-radius": "var(--radius-pill)",
  "font-size": "10px",
  "font-weight": "600",
  color: "var(--text-secondary)",
};