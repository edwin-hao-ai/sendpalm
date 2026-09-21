/** AgentPanel — sessions, tasks, drafts, memory, audit log.
 * Spec: prototype-v11 §3.9.
 */

import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
} from "solid-js";
import { produce } from "solid-js/store";
import {
  useAgent,
  sessionKindLabel,
  taskStatusLabel,
  draftStatusLabel,
  auditKindLabel,
  confidenceLabel,
} from "../agent/useAgent";
import { deleteAgentAudit, saveAgentMemory } from "../stores/data";
import { Icon } from "../components/Icon";
import { Empty } from "../components/Empty";
import { Avatar } from "../components/Avatar";
import { Modal } from "../components/Modal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  agentMemory,
  setAgentMemory,
  setAgentPanelOpen,
  selectedContactId,
  showToast,
  appSettings,
} from "../stores/ui";
import { PanelResizeHandle } from "./PanelResizeHandle";
import { relativeTime } from "../utils/date";
import { sessionIcon } from "../utils/agent";
import { load } from "@tauri-apps/plugin-store";
import { STORE_PATH } from "../bootstrap";
import { IS_BROWSER } from "../services/tauri-shim";

/** Modal contact picker — used by the Agent workspace and this panel
 *  when starting a contact-scoped session without a selected contact. */
export function ContactPickerModal(props: {
  contacts: { id: string; name: string; avatar?: string }[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = createSignal("");
  const filtered = createMemo(() => {
    const needle = q().trim().toLowerCase();
    if (!needle) return props.contacts;
    return props.contacts.filter((c) => c.name.toLowerCase().includes(needle));
  });
  return (
    <Modal open onClose={props.onClose} title="选择联系人" width="420px">
      <input
        value={q()}
        onInput={(e) => setQ(e.currentTarget.value)}
        placeholder="搜索联系人…"
        aria-label="搜索联系人"
        style={{
          width: "100%",
          padding: "8px 12px",
          border: "0.5px solid var(--border)",
          "border-radius": "var(--radius-md)",
          background: "var(--paper-light)",
          "font-size": "var(--text-body-sm)",
          "margin-bottom": "var(--space-2)",
        }}
      />
      <div style={{ "max-height": "320px", "overflow-y": "auto" }}>
        <Show
          when={filtered().length > 0}
          fallback={<Empty icon="ph-user" title="没有匹配的联系人" />}
        >
          <For each={filtered()}>
            {(c) => (
              <button
                onClick={() => props.onPick(c.id)}
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--space-3)",
                  width: "100%",
                  padding: "var(--space-2) var(--space-3)",
                  "min-height": "44px",
                  background: "transparent",
                  "border-radius": "var(--radius-md)",
                  "text-align": "left",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <Avatar name={c.name} size={28} />
                <span
                  style={{
                    flex: 1,
                    "min-width": 0,
                    "font-size": "var(--text-body-sm)",
                    "font-weight": "600",
                    "white-space": "nowrap",
                    overflow: "hidden",
                    "text-overflow": "ellipsis",
                  }}
                >
                  {c.name}
                </span>
              </button>
            )}
          </For>
        </Show>
      </div>
    </Modal>
  );
}

export function AgentPanel() {
  const agent = useAgent();
  const [tab, setTab] = createSignal<
    "sessions" | "tasks" | "drafts" | "memory" | "audit"
  >("sessions");
  const [pickingContact, setPickingContact] = createSignal(false);
  const [confirmClearAudit, setConfirmClearAudit] = createSignal(false);

  const contactById = agent.contactById;

  /* Memory edits auto-save (debounced). The store effect skips the
   * initial run so simply opening the panel doesn't write to disk. */
  const [memState, setMemState] = createSignal<
    "idle" | "dirty" | "saving" | "saved"
  >("idle");
  let memTimer: ReturnType<typeof setTimeout> | undefined;
  let memSavedReset: ReturnType<typeof setTimeout> | undefined;
  let memFirstRun = true;

  const persistMemory = async (snapshotJson: string) => {
    setMemState("saving");
    try {
      const store = await load(STORE_PATH);
      await saveAgentMemory(store, JSON.parse(snapshotJson));
      setMemState("saved");
      clearTimeout(memSavedReset);
      memSavedReset = setTimeout(() => {
        setMemState((s) => (s === "saved" ? "idle" : s));
      }, 2000);
    } catch (e) {
      setMemState("idle");
      if (IS_BROWSER()) {
        showToast({
          message: "浏览器预览模式下，记忆只保留在当前会话",
          kind: "info",
        });
      } else {
        showToast({
          message: "记忆保存失败，请重试",
          kind: "error",
          source: "agent",
          detail: String(e),
        });
      }
    }
  };

  createEffect(() => {
    const snapshot = JSON.stringify(agentMemory);
    if (memFirstRun) {
      memFirstRun = false;
      return;
    }
    setMemState("dirty");
    clearTimeout(memTimer);
    memTimer = setTimeout(() => void persistMemory(snapshot), 600);
  });
  onCleanup(() => {
    clearTimeout(memTimer);
    clearTimeout(memSavedReset);
  });

  /** 设置 → Agent 里的「记忆可编辑」开关。 */
  const memoryEditable = () => appSettings.agent.memoryEditable;

  const newContactSession = () => {
    const preselected = selectedContactId();
    if (preselected) {
      void agent.newSession("contact", preselected);
      return;
    }
    if ((agent.contacts() ?? []).length === 0) {
      showToast({
        message: "还没有联系人，先在联系人页添加",
        kind: "warning",
      });
      return;
    }
    setPickingContact(true);
  };

  const clearAudit = async () => {
    const list = agent.audit() ?? [];
    for (const a of list) await deleteAgentAudit(a.id);
    await agent.refetchAll();
    showToast({ message: "审计记录已清空", kind: "info" });
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
          aria-label="关闭 Agent 面板"
          style={{
            color: "var(--text-muted)",
            width: "32px",
            height: "32px",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
          }}
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
                padding: "10px 4px",
                "min-height": "44px",
                "border-bottom":
                  tab() === t.id
                    ? "2px solid var(--agent)"
                    : "2px solid transparent",
                color: tab() === t.id ? "var(--agent)" : "var(--text-muted)",
                "font-size": "var(--text-micro)",
                "font-weight": tab() === t.id ? "700" : "500",
                display: "flex",
                "flex-direction": "column",
                "align-items": "center",
                "justify-content": "center",
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
              + 自由对话
            </button>
            <button onClick={() => agent.newSession("message")} style={miniBtn}>
              + 邮件
            </button>
            <button onClick={newContactSession} style={miniBtn}>
              + 联系人
            </button>
          </div>

          <Show
            when={(agent.sessions() ?? []).length > 0}
            fallback={
              <Empty
                icon="ph-chat-circle"
                title="还没有会话"
                description="点上方按钮新建一个会话。"
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
                    <Icon name={sessionIcon(s.kind)} size={14} />
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
                      "font-size": "var(--text-micro)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {sessionKindLabel(s.kind)} · {relativeTime(s.createdAt)}
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
                  color: "var(--text-muted)",
                  margin: "0 0 var(--space-2)",
                }}
              >
                当前会话的任务
              </h4>
              <Show
                when={agent.sessionTasks().length > 0}
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
                            "font-size": "var(--text-micro)",
                            "font-weight": "700",
                          }}
                        >
                          {taskStatusLabel(t.status)}
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
                                  "font-size": "var(--text-micro)",
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
                      <Show when={confidenceLabel(t.confidence)}>
                        {(label) => (
                          <div
                            style={{
                              "font-size": "var(--text-micro)",
                              color: "var(--text-muted)",
                              "margin-top": "var(--space-2)",
                            }}
                          >
                            把握度：{label()}
                          </div>
                        )}
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
            fallback={
              <Empty
                icon="ph-list-checks"
                title="没有任务"
                description="在会话里向 Agent 提问，它会自动生成任务。"
              />
            }
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
                        "font-size": "var(--text-micro)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {taskStatusLabel(t.status)}
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
            fallback={
              <Empty
                icon="ph-pencil-line"
                title="没有草稿"
                description="让 Agent 起草回复后，草稿会出现在这里。"
              />
            }
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
                      onClick={() => agent.approveDraft(d)}
                      style={{
                        padding: "6px 12px",
                        background: "var(--palm-soft)",
                        color: "var(--palm)",
                        "border-radius": "var(--radius-pill)",
                        "font-size": "var(--text-caption)",
                        "font-weight": "700",
                      }}
                    >
                      批准
                    </button>
                    <button
                      onClick={() => agent.editDraft(d)}
                      style={{
                        padding: "6px 12px",
                        background: "var(--paper-mid)",
                        color: "var(--text-secondary)",
                        "border-radius": "var(--radius-pill)",
                        "font-size": "var(--text-caption)",
                        "font-weight": "700",
                      }}
                    >
                      编辑
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
                      color: "var(--text-muted)",
                      margin: 0,
                    }}
                  >
                    全局记忆
                  </h4>
                  <span
                    data-testid="memory-save-state"
                    style={{
                      "font-size": "var(--text-micro)",
                      color:
                        memState() === "saved"
                          ? "var(--palm)"
                          : "var(--text-muted)",
                    }}
                  >
                    {memState() === "saving"
                      ? "保存中…"
                      : memState() === "saved"
                        ? "已自动保存 ✓"
                        : memState() === "dirty"
                          ? "编辑中…"
                          : ""}
                  </span>
                </div>
                <Show when={!memoryEditable()}>
                  <p
                    style={{
                      "font-size": "var(--text-caption)",
                      color: "var(--text-muted)",
                      "margin-bottom": "var(--space-2)",
                    }}
                  >
                    记忆编辑已在 设置 → Agent 中关闭，当前为只读。
                  </p>
                </Show>
                <For
                  each={globalEntries()}
                  fallback={
                    <p
                      style={{
                        "font-size": "var(--text-caption)",
                        color: "var(--text-muted)",
                      }}
                    >
                      还没有全局记忆，点下方「添加记忆」创建第一条。
                    </p>
                  }
                >
                  {(entry) => {
                    const [localKey, setLocalKey] = createSignal(entry[0]);
                    const commitKey = () => {
                      const oldKey = entry[0];
                      const newKey = localKey().trim();
                      if (!newKey || newKey === oldKey) return;
                      if (newKey in agentMemory.global) {
                        showToast({
                          message: `已存在名为「${newKey}」的记忆，未重命名`,
                          kind: "warning",
                        });
                        setLocalKey(oldKey);
                        return;
                      }
                      const value = agentMemory.global[oldKey] ?? "";
                      setAgentMemory(
                        "global",
                        produce((d) => {
                          delete d[oldKey];
                          d[newKey] = value;
                        }),
                      );
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
                            disabled={!memoryEditable()}
                            placeholder="名称"
                            aria-label="记忆名称"
                            style={{
                              flex: 1,
                              "min-width": 0,
                              padding: "4px 8px",
                              "border-radius": "var(--radius-sm)",
                              border: "0.5px solid var(--border)",
                              background: "var(--paper-light)",
                              "font-size": "var(--text-caption)",
                              "font-weight": "600",
                            }}
                          />
                          <Show when={memoryEditable()}>
                            <button
                              onClick={() =>
                                setAgentMemory(
                                  "global",
                                  produce((d) => {
                                    delete d[entry[0]];
                                  }),
                                )
                              }
                              aria-label="删除这条记忆"
                              title="删除这条记忆"
                              style={{
                                color: "var(--status-danger)",
                                padding: "6px",
                                display: "flex",
                              }}
                            >
                              <Icon name="ph-trash" size={14} />
                            </button>
                          </Show>
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
                          disabled={!memoryEditable()}
                          placeholder="内容"
                          aria-label="记忆内容"
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
                <Show when={memoryEditable()}>
                  <button
                    onClick={() =>
                      setAgentMemory("global", `条目 ${Date.now()}`, "")
                    }
                    style={{
                      "margin-bottom": "var(--space-4)",
                      padding: "8px 14px",
                      "min-height": "36px",
                      background: "var(--paper-mid)",
                      color: "var(--text-secondary)",
                      "border-radius": "var(--radius-pill)",
                      "font-size": "var(--text-caption)",
                      "font-weight": "600",
                    }}
                  >
                    <Icon name="ph-plus" size={12} /> 添加记忆
                  </button>
                </Show>

                <h4
                  style={{
                    "font-size": "var(--text-micro)",
                    "font-weight": "700",
                    "letter-spacing": "0.06em",
                    color: "var(--text-muted)",
                    margin: "var(--space-4) 0 var(--space-2)",
                  }}
                >
                  联系人记忆
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
                          disabled={!memoryEditable()}
                          placeholder={`关于 ${c?.name ?? "这位联系人"} 的备注`}
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
              <Empty
                icon="ph-clock-counter-clockwise"
                title="还没有审计记录"
                description="Agent 的每步操作都会记录在这里。"
              />
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
                      style={{
                        flex: 1,
                        "min-width": 0,
                        "font-size": "var(--text-caption)",
                      }}
                    >
                      {a.message}
                    </span>
                  </div>
                  <p
                    style={{
                      margin: "2px 0 0 20px",
                      "font-size": "var(--text-micro)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {auditKindLabel(a.kind)} · {relativeTime(a.createdAt)}
                  </p>
                </div>
              )}
            </For>
            <button
              onClick={() => setConfirmClearAudit(true)}
              style={{
                "margin-top": "var(--space-3)",
                padding: "8px 14px",
                "min-height": "36px",
                background: "var(--paper-mid)",
                color: "var(--status-danger)",
                "border-radius": "var(--radius-pill)",
                "font-size": "var(--text-caption)",
                "font-weight": "600",
              }}
            >
              清空审计记录
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
            placeholder="问 Agent…（Enter 发送）"
            aria-label="问 Agent"
            style={{
              flex: 1,
              "min-width": 0,
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
            aria-label="发送"
            style={{
              padding: "8px 14px",
              "min-height": "36px",
              background: "var(--agent)",
              color: "white",
              "border-radius": "var(--radius-pill)",
              "font-size": "var(--text-caption)",
              "font-weight": "700",
              cursor:
                agent.chatInput().trim() && agent.currentSession()
                  ? "pointer"
                  : "not-allowed",
              opacity:
                agent.chatInput().trim() && agent.currentSession() ? 1 : 0.4,
            }}
          >
            <Icon name="ph-paper-plane-tilt" size={12} />
          </button>
        </div>
      </Show>

      <Show when={pickingContact()}>
        <ContactPickerModal
          contacts={agent.contacts() ?? []}
          onPick={(id) => {
            setPickingContact(false);
            void agent.newSession("contact", id);
          }}
          onClose={() => setPickingContact(false)}
        />
      </Show>
      <ConfirmDialog
        open={confirmClearAudit()}
        title="清空全部审计记录？"
        body={`将删除全部 ${(agent.audit() ?? []).length} 条记录，不可恢复。`}
        confirmLabel="清空"
        onConfirm={() => void clearAudit()}
        onCancel={() => setConfirmClearAudit(false)}
      />
    </aside>
  );
}

const miniBtn = {
  padding: "8px 12px",
  "min-height": "36px",
  background: "var(--paper-mid)",
  "border-radius": "var(--radius-pill)",
  "font-size": "var(--text-caption)",
  "font-weight": "600",
  color: "var(--text-secondary)",
};
