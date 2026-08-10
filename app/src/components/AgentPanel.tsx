/** AgentPanel — sessions, tasks, drafts, memory, audit log.
 * Spec: prototype-v11 §3.9.
 */

import { For, Show, createMemo, createSignal } from "solid-js";
import { produce } from "solid-js/store";
import { useAgent } from "../agent/useAgent";
import { deleteAgentAudit, saveAgentMemory } from "../stores/data";
import { Icon } from "../components/Icon";
import { Empty } from "../components/Empty";
import {
  agentMemory,
  setAgentMemory,
  setAgentPanelOpen,
  selectedContactId,
  showToast,
} from "../stores/ui";
import { PanelResizeHandle } from "./PanelResizeHandle";
import { relativeTime } from "../utils/date";
import { load } from "@tauri-apps/plugin-store";
import { STORE_PATH } from "../bootstrap";

export function AgentPanel() {
  const agent = useAgent();
  const [tab, setTab] = createSignal<
    "sessions" | "tasks" | "drafts" | "memory" | "audit"
  >("sessions");

  const contactById = agent.contactById;

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
        <strong
          style={{
            "font-size": "var(--text-body-sm)",
            "font-weight": "700",
            flex: 1,
          }}
        >
          SendPalm Agent
        </strong>
        <button
          onClick={() => setAgentPanelOpen(false)}
          aria-label="Close agent panel"
          style={{ color: "var(--text-muted)", padding: "4px" }}
        >
          <Icon name="ph-x" size={14} />
        </button>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          "border-bottom": "0.5px solid var(--border)",
          padding: "0 var(--space-2)",
        }}
      >
        <For each={tabs}>
          {(t) => (
            <button
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                padding: "8px 4px",
                "border-bottom":
                  tab() === t.id
                    ? "2px solid var(--agent)"
                    : "2px solid transparent",
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
          <div
            style={{
              display: "flex",
              gap: "var(--space-1)",
              "flex-wrap": "wrap",
              "margin-bottom": "var(--space-3)",
            }}
          >
            <button
              onClick={() => agent.newSession("freeform")}
              style={miniBtn}
            >
              + Freeform
            </button>
            <button onClick={() => agent.newSession("message")} style={miniBtn}>
              + Message
            </button>
            <button
              onClick={() => {
                const ref =
                  selectedContactId() ?? (agent.contacts() ?? [])[0]?.id;
                if (!ref) {
                  showToast({ message: "没有可选的联系人", kind: "warning" });
                  return;
                }
                void agent.newSession("contact", ref);
              }}
              style={miniBtn}
            >
              + Contact
            </button>
          </div>

          <Show
            when={(agent.sessions() ?? []).length > 0}
            fallback={
              <Empty
                icon="ph-chat-circle"
                title="还没会话"
                description="点 + 新建一个。"
              />
            }
          >
            <For each={agent.sessions() ?? []}>
              {(s) => (
                <button
                  onClick={() => agent.setActiveSessionId(s.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "var(--space-3)",
                    background:
                      agent.currentSession()?.id === s.id
                        ? "var(--agent-soft)"
                        : "var(--paper-light)",
                    "border-radius": "var(--radius-md)",
                    "margin-bottom": "var(--space-2)",
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
                    <Icon
                      name={
                        s.kind === "freeform"
                          ? "ph-chat-circle"
                          : s.kind === "message"
                            ? "ph-envelope"
                            : s.kind === "contact"
                              ? "ph-user"
                              : s.kind === "event"
                                ? "ph-calendar-blank"
                                : "ph-file"
                      }
                      size={14}
                    />
                    <span
                      style={{
                        flex: 1,
                        "font-weight": "600",
                        "font-size": "var(--text-body-sm)",
                      }}
                    >
                      {s.title}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: "4px 0 0",
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

          {/* Tasks of current session */}
          <Show when={agent.currentSession()}>
            <div
              style={{
                "border-top": "0.5px solid var(--border)",
                "padding-top": "var(--space-3)",
                "margin-top": "var(--space-3)",
              }}
            >
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
                Active tasks
              </h4>
              <Show
                when={agent.sessionTasks().length > 0}
                fallback={
                  <p
                    style={{ color: "var(--text-muted)", "font-size": "10px" }}
                  >
                    无
                  </p>
                }
              >
                <For each={agent.sessionTasks()}>
                  {(t) => (
                    <div
                      style={{
                        padding: "var(--space-3)",
                        background: "var(--paper-light)",
                        "border-radius": "var(--radius-md)",
                        "margin-bottom": "var(--space-2)",
                        "border-left": `3px solid ${t.status === "done" ? "var(--palm)" : t.status === "doing" ? "var(--yellow)" : "var(--text-muted)"}`,
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
                            "font-size": "var(--text-body-sm)",
                            "font-weight": "600",
                            flex: 1,
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
                      <Show when={t.steps.length > 0}>
                        <div style={{ "margin-top": "var(--space-2)" }}>
                          <For each={t.steps}>
                            {(s) => (
                              <div
                                style={{
                                  display: "flex",
                                  "align-items": "center",
                                  gap: "4px",
                                  "font-size": "10px",
                                  color: s.done
                                    ? "var(--palm)"
                                    : "var(--text-muted)",
                                }}
                              >
                                <Icon
                                  name={
                                    s.done ? "ph-check-circle" : "ph-circle"
                                  }
                                  size={11}
                                />
                                {s.label}
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                      <Show when={t.confidence}>
                        <div
                          style={{
                            "font-size": "10px",
                            color: "var(--text-muted)",
                            "margin-top": "var(--space-2)",
                          }}
                        >
                          <Icon name="ph-percent" size={10} /> confidence{" "}
                          {t.confidence}%
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
          <Show
            when={(agent.tasks() ?? []).length > 0}
            fallback={<Empty icon="ph-list-checks" title="没有任务" />}
          >
            <For each={agent.tasks() ?? []}>
              {(t) => (
                <div
                  style={{
                    padding: "var(--space-3)",
                    background: "var(--paper-light)",
                    "border-radius": "var(--radius-md)",
                    "margin-bottom": "var(--space-2)",
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
                        "font-size": "10px",
                        color: "var(--text-muted)",
                      }}
                    >
                      {t.status}
                    </span>
                  </div>
                </div>
              )}
            </For>
          </Show>
        </Show>

        {/* Drafts tab */}
        <Show when={tab() === "drafts"}>
          <Show
            when={(agent.drafts() ?? []).length > 0}
            fallback={<Empty icon="ph-pencil-line" title="没有草稿" />}
          >
            <For each={agent.drafts() ?? []}>
              {(d) => (
                <div
                  style={{
                    padding: "var(--space-3)",
                    background: "var(--paper-light)",
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
                      onClick={() => agent.approveDraft(d)}
                      style={{
                        padding: "4px 10px",
                        background: "var(--palm-soft)",
                        color: "var(--palm)",
                        "border-radius": "var(--radius-pill)",
                        "font-size": "10px",
                        "font-weight": "700",
                      }}
                    >
                      Send
                    </button>
                    <button
                      onClick={() => agent.editDraft(d)}
                      style={{
                        padding: "4px 10px",
                        background: "var(--paper-mid)",
                        color: "var(--text-secondary)",
                        "border-radius": "var(--radius-pill)",
                        "font-size": "10px",
                        "font-weight": "700",
                      }}
                    >
                      Edit
                    </button>
                    <button
                      style={{
                        padding: "4px 10px",
                        background: "transparent",
                        color: "var(--text-muted)",
                        "border-radius": "var(--radius-pill)",
                        "font-size": "10px",
                      }}
                    >
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
          {(() => {
            const globalEntries = createMemo(() =>
              Object.entries(agentMemory.global),
            );
            const sessionContactId = createMemo(() => {
              const ctx = agent.currentSession()?.context;
              return ctx?.type === "contact" ? ctx.ref : null;
            });
            const persistMemory = async () => {
              try {
                const store = await load(STORE_PATH);
                const snapshot = JSON.parse(JSON.stringify(agentMemory));
                await saveAgentMemory(store, snapshot);
                showToast({ message: "记忆已保存", kind: "success" });
              } catch {
                showToast({
                  message: "浏览器模式下记忆不会持久化",
                  kind: "info",
                });
              }
            };
            return (
              <>
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "space-between",
                    margin: "0 0 var(--space-3)",
                  }}
                >
                  <h4
                    style={{
                      "font-size": "var(--text-micro)",
                      "font-weight": "700",
                      "letter-spacing": "0.06em",
                      "text-transform": "uppercase",
                      color: "var(--text-muted)",
                      margin: 0,
                    }}
                  >
                    Global memory
                  </h4>
                  <button
                    onClick={persistMemory}
                    style={{
                      padding: "4px 10px",
                      background: "var(--palm-soft)",
                      color: "var(--palm)",
                      "border-radius": "var(--radius-pill)",
                      "font-size": "10px",
                      "font-weight": "600",
                    }}
                  >
                    Save memory
                  </button>
                </div>
                <For
                  each={globalEntries()}
                  fallback={
                    <p
                      style={{
                        "font-size": "var(--text-caption)",
                        color: "var(--text-muted)",
                      }}
                    >
                      No global memory yet.
                    </p>
                  }
                >
                  {(entry) => {
                    const [localKey, setLocalKey] = createSignal(entry[0]);
                    const commitKey = () => {
                      const oldKey = entry[0];
                      const newKey = localKey().trim();
                      if (newKey && newKey !== oldKey) {
                        const value = agentMemory.global[oldKey] ?? "";
                        setAgentMemory(
                          "global",
                          produce((d) => {
                            delete d[oldKey];
                            d[newKey] = value;
                          }),
                        );
                      }
                    };
                    return (
                      <div
                        style={{
                          "margin-bottom": "var(--space-3)",
                          padding: "var(--space-3)",
                          background: "var(--paper-light)",
                          "border-radius": "var(--radius-md)",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: "var(--space-2)",
                            "margin-bottom": "var(--space-2)",
                          }}
                        >
                          <input
                            value={localKey()}
                            onInput={(e) => setLocalKey(e.currentTarget.value)}
                            onBlur={commitKey}
                            placeholder="Key"
                            style={{
                              flex: 1,
                              padding: "4px 8px",
                              "border-radius": "var(--radius-sm)",
                              border: "0.5px solid var(--border)",
                              background: "var(--paper-light)",
                              "font-size": "var(--text-caption)",
                              "font-weight": "600",
                            }}
                          />
                          <button
                            onClick={() =>
                              setAgentMemory(
                                "global",
                                produce((d) => {
                                  delete d[entry[0]];
                                }),
                              )
                            }
                            aria-label="Delete memory"
                            style={{ color: "var(--danger)" }}
                          >
                            <Icon name="ph-trash" size={14} />
                          </button>
                        </div>
                        <textarea
                          value={entry[1]}
                          onInput={(e) =>
                            setAgentMemory(
                              "global",
                              entry[0],
                              e.currentTarget.value,
                            )
                          }
                          placeholder="Value"
                          rows={3}
                          style={{
                            width: "100%",
                            padding: "6px 8px",
                            "border-radius": "var(--radius-sm)",
                            border: "0.5px solid var(--border)",
                            background: "var(--paper-light)",
                            "font-size": "var(--text-caption)",
                            resize: "vertical",
                          }}
                        />
                      </div>
                    );
                  }}
                </For>
                <button
                  onClick={() =>
                    setAgentMemory("global", `entry_${Date.now()}`, "")
                  }
                  style={{
                    "margin-bottom": "var(--space-4)",
                    padding: "6px 12px",
                    background: "var(--paper-mid)",
                    color: "var(--text-secondary)",
                    "border-radius": "var(--radius-pill)",
                    "font-size": "var(--text-caption)",
                    "font-weight": "600",
                  }}
                >
                  <Icon name="ph-plus" size={12} /> Add global memory
                </button>

                <h4
                  style={{
                    "font-size": "var(--text-micro)",
                    "font-weight": "700",
                    "letter-spacing": "0.06em",
                    "text-transform": "uppercase",
                    color: "var(--text-muted)",
                    margin: "var(--space-4) 0 var(--space-2)",
                  }}
                >
                  Per-contact memory
                </h4>
                <Show when={sessionContactId()}>
                  {(getId) => {
                    const id = getId();
                    const c = contactById(id);
                    return (
                      <div
                        style={{
                          "margin-bottom": "var(--space-3)",
                          padding: "var(--space-3)",
                          background: "var(--paper-light)",
                          "border-radius": "var(--radius-md)",
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            "font-size": "var(--text-caption)",
                            "font-weight": "600",
                          }}
                        >
                          {c?.name ?? id}
                        </p>
                        <textarea
                          value={agentMemory.contacts[id] ?? ""}
                          onInput={(e) =>
                            setAgentMemory(
                              "contacts",
                              id,
                              e.currentTarget.value,
                            )
                          }
                          placeholder={`Notes about ${c?.name ?? "this contact"}`}
                          rows={4}
                          style={{
                            width: "100%",
                            "margin-top": "var(--space-2)",
                            padding: "6px 8px",
                            "border-radius": "var(--radius-sm)",
                            border: "0.5px solid var(--border)",
                            background: "var(--paper-light)",
                            "font-size": "var(--text-caption)",
                            resize: "vertical",
                          }}
                        />
                      </div>
                    );
                  }}
                </Show>
                <For each={Object.entries(agentMemory.contacts)}>
                  {(entry) => {
                    const c = contactById(entry[0]);
                    return (
                      <div
                        style={{
                          padding: "var(--space-2) 0",
                          "border-bottom": "0.5px solid var(--border)",
                          "font-size": "var(--text-caption)",
                        }}
                      >
                        <strong>{c?.name ?? entry[0]}</strong>
                        <p
                          style={{
                            margin: "2px 0 0",
                            color: "var(--text-secondary)",
                            "white-space": "pre-wrap",
                          }}
                        >
                          {entry[1]}
                        </p>
                      </div>
                    );
                  }}
                </For>
              </>
            );
          })()}
        </Show>

        {/* Audit tab */}
        <Show when={tab() === "audit"}>
          <Show
            when={(agent.audit() ?? []).length > 0}
            fallback={
              <Empty icon="ph-clock-counter-clockwise" title="还没有审计记录" />
            }
          >
            <For each={agent.audit() ?? []}>
              {(a) => (
                <div
                  style={{
                    padding: "var(--space-2) 0",
                    "border-bottom": "0.5px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "var(--space-2)",
                    }}
                  >
                    <Icon
                      name={
                        a.kind === "draft_approved"
                          ? "ph-check-circle"
                          : a.kind === "session_new"
                            ? "ph-plus-circle"
                            : a.kind === "user_input"
                              ? "ph-chat-circle"
                              : a.kind === "agent_response"
                                ? "ph-sparkle"
                                : "ph-activity"
                      }
                      size={12}
                    />
                    <span
                      style={{ flex: 1, "font-size": "var(--text-caption)" }}
                    >
                      {a.message}
                    </span>
                    <Show when={a.undoable}>
                      <button
                        style={{ "font-size": "10px", color: "var(--palm)" }}
                      >
                        Undo
                      </button>
                    </Show>
                  </div>
                  <p
                    style={{
                      margin: "2px 0 0 20px",
                      "font-size": "10px",
                      color: "var(--text-muted)",
                    }}
                  >
                    {a.kind} · {relativeTime(a.createdAt)}
                  </p>
                </div>
              )}
            </For>
            <button
              onClick={async () => {
                const list = agent.audit() ?? [];
                for (const a of list) await deleteAgentAudit(a.id);
                showToast({ message: "审计已清空", kind: "info" });
              }}
              style={{
                "margin-top": "var(--space-3)",
                padding: "6px 12px",
                background: "var(--paper-mid)",
                color: "var(--text-muted)",
                "border-radius": "var(--radius-pill)",
                "font-size": "10px",
              }}
            >
              清空审计
            </button>
          </Show>
        </Show>
      </div>

      {/* Chat input */}
      <Show when={tab() === "sessions"}>
        <div
          style={{
            "border-top": "0.5px solid var(--border)",
            padding: "var(--space-3)",
            display: "flex",
            gap: "var(--space-2)",
            background: "var(--surface-recessed)",
          }}
        >
          <input
            value={agent.chatInput()}
            onInput={(e) => agent.setChatInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") agent.sendChat();
            }}
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
            onClick={() => void agent.sendChat()}
            disabled={!agent.chatInput().trim() || !agent.currentSession()}
            style={{
              padding: "6px 14px",
              background: "var(--agent)",
              color: "white",
              "border-radius": "var(--radius-pill)",
              "font-size": "var(--text-caption)",
              "font-weight": "700",
              opacity:
                agent.chatInput().trim() && agent.currentSession() ? 1 : 0.4,
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
