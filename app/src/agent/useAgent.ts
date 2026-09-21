/** Shared Agent state + actions — used by both AgentPanel and Agent view.
 * Keeps the side panel and the full workspace in sync without duplication.
 */

import { createMemo, createResource, createSignal } from "solid-js";
import {
  listAgentSessions,
  listAgentTasks,
  listAgentDrafts,
  listAgentAudit,
  upsertAgentSession,
  upsertAgentTask,
  upsertAgentDraft,
  upsertAgentAudit,
  deleteAgentSession,
} from "../stores/data";
import {
  setAgentPanelOpen,
  setDetailOpen,
  setSelectedDraftId,
  showToast,
  appSettings,
} from "../stores/ui";
import { contactsList, refetchContacts } from "../stores/contacts";
import { agentChat } from "../services/backend";
import { IS_BROWSER } from "../services/tauri-shim";
import { uid } from "../utils/id";
import { isoNow } from "../utils/date";
import { useRefreshEffect } from "../utils/gestures";
import type {
  AgentSession,
  AgentSessionKind,
  AgentTask,
  AgentTaskStatus,
  AgentDraft,
  AgentAuditEntry,
  DraftStatus,
} from "../types";

/* ── Chinese labels for agent domain enums ── */

export const SESSION_KIND_LABELS: Record<AgentSessionKind, string> = {
  freeform: "自由对话",
  message: "邮件",
  contact: "联系人",
  event: "日程",
  file: "文件",
};

export function sessionKindLabel(kind: AgentSessionKind): string {
  return SESSION_KIND_LABELS[kind] ?? kind;
}

export const AGENT_TASK_STATUS_LABELS: Record<AgentTaskStatus, string> = {
  todo: "待处理",
  doing: "进行中",
  done: "已完成",
  error: "失败",
};

export function taskStatusLabel(status: AgentTaskStatus): string {
  return AGENT_TASK_STATUS_LABELS[status] ?? status;
}

export const DRAFT_STATUS_LABELS: Record<DraftStatus, string> = {
  pending: "待审批",
  approved: "已批准",
  sent: "已发送",
  edited: "编辑中",
  discarded: "已丢弃",
};

export function draftStatusLabel(status: DraftStatus): string {
  return DRAFT_STATUS_LABELS[status] ?? status;
}

export const AUDIT_KIND_LABELS: Record<string, string> = {
  user_input: "我",
  agent_response: "Agent",
  agent_error: "错误",
  session_new: "新会话",
  draft_approved: "草稿审批",
};

export function auditKindLabel(kind: string): string {
  return AUDIT_KIND_LABELS[kind] ?? kind;
}

/** Human-readable confidence — raw percentages ("confidence 0%")
 *  mean nothing to users; map to 高/中/低 and hide zero. */
export function confidenceLabel(confidence?: number): string | null {
  if (!confidence || confidence <= 0) return null;
  if (confidence >= 80) return "高";
  if (confidence >= 40) return "中";
  return "低";
}

/* ── Chat message assembly ── */

/** How many past turns of the current session are replayed to the
 *  model so follow-up questions have context. */
export const CHAT_HISTORY_LIMIT = 12;

export interface ChatMessage {
  role: string;
  content: string;
}

/** Build the messages array for one chat call: optional system prompt,
 *  the session's prior user/agent turns (oldest → newest, capped), and
 *  the new user input. `history` must NOT already contain `input`. */
export function buildChatMessages(
  systemPrompt: string,
  history: Pick<AgentAuditEntry, "kind" | "message">[],
  input: string,
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const sys = systemPrompt.trim();
  if (sys) messages.push({ role: "system", content: sys });
  const turns = history
    .filter((a) => a.kind === "user_input" || a.kind === "agent_response")
    .slice(-CHAT_HISTORY_LIMIT);
  for (const a of turns) {
    messages.push({
      role: a.kind === "user_input" ? "user" : "assistant",
      content: a.message,
    });
  }
  messages.push({ role: "user", content: input });
  return messages;
}

export function useAgent() {
  const [sessions, { refetch: refetchSessions }] =
    createResource(listAgentSessions);
  const [tasks, { refetch: refetchTasks }] = createResource(() =>
    listAgentTasks(),
  );
  const [drafts, { refetch: refetchDrafts }] = createResource(() =>
    listAgentDrafts(),
  );
  const [audit, { refetch: refetchAudit }] = createResource(listAgentAudit);
  // P2/ARCH-3: contacts now come from the shared store, not a
  // per-hook resource. Multiple views subscribing to the same
  // Contact list share one roundtrip.
  const contacts = contactsList;

  useRefreshEffect(() => {
    void refetchSessions();
    void refetchTasks();
    void refetchDrafts();
    void refetchAudit();
    void refetchContacts();
  });

  const [activeSessionId, setActiveSessionId] = createSignal<string | null>(
    null,
  );
  const [chatInput, setChatInput] = createSignal("");
  /** True while a chat call is in flight — drives the "Agent 正在思考…"
   *  placeholder bubble in the conversation. */
  const [thinking, setThinking] = createSignal(false);

  const contactById = (id: string) =>
    (contacts() ?? []).find((c) => c.id === id);

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

  const sessionDrafts = createMemo<AgentDraft[]>(() => {
    const id = currentSession()?.id;
    if (!id) return [];
    return (drafts() ?? []).filter((d) => d.sessionId === id);
  });

  const refetchAll = async () => {
    await Promise.all([
      refetchSessions(),
      refetchTasks(),
      refetchDrafts(),
      refetchAudit(),
      refetchContacts(),
    ]);
  };

  /** First non-undefined error across all Agent resources, or
   *  undefined if every fetch has succeeded. Surfaced as a single
   *  signal so AgentPanel / Agent view can show one ErrorState
   *  instead of checking five resources. */
  const error = () =>
    sessions.error ??
    tasks.error ??
    drafts.error ??
    audit.error;

  /** `true` while ANY of the 4 Agent-owned resources is still resolving.
   *  Pairs with `error()` so a ResourceGate can show one Skeleton
   *  / ErrorState across the whole Agent surface instead of having
   *  to check each individual resource. Contacts now live in the
   *  shared store, so its loading state is opaque to this hook. */
  const isLoading = () =>
    sessions.loading ||
    tasks.loading ||
    drafts.loading ||
    audit.loading;

  const appendAudit = async (
    kind: string,
    message: string,
    payload?: string,
  ) => {
    await upsertAgentAudit({
      id: uid("aa"),
      sessionId: currentSession()?.id,
      kind,
      message,
      payload,
      createdAt: isoNow(),
      undoable: false,
    });
    await refetchAudit();
  };

  const newSession = async (kind: AgentSessionKind, ref?: string) => {
    const titleMap: Record<AgentSessionKind, string> = {
      freeform: "自由对话",
      message: "邮件",
      contact: ref
        ? `${contactById(ref)?.name ?? "联系人"} 的上下文`
        : "联系人会话",
      event: "日程",
      file: "文件",
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
    await refetchSessions();
  };

  const deleteSession = async (id: string) => {
    await deleteAgentSession(id);
    if (activeSessionId() === id) setActiveSessionId(null);
    await refetchSessions();
    showToast({ message: "会话已删除", kind: "info" });
  };

  const sendChat = async () => {
    const input = chatInput().trim();
    const session = currentSession();
    if (!input || !session) return;
    // Capture history BEFORE appending the new input so
    // buildChatMessages doesn't see the current turn twice.
    const history = (audit() ?? []).filter(
      (a) => a.sessionId === session.id,
    );
    await appendAudit("user_input", input);
    setChatInput("");

    const llm = appSettings.agent.llm;
    const messages = buildChatMessages(llm.systemPrompt, history, input);

    if (IS_BROWSER()) {
      // Browser preview has no real backend — explain once via toast
      // instead of writing a fake "mock response" into the permanent
      // conversation history.
      showToast({
        message:
          "浏览器预览模式：在 设置 → Agent 里配置模型服务后即可真实对话",
        kind: "info",
        ttlMs: 6000,
      });
      const t: AgentTask = {
        id: uid("at"),
        sessionId: session.id,
        title: input,
        description: "浏览器预览生成的示例任务",
        status: "doing",
        steps: [
          { id: uid("st"), label: "分析请求", done: true },
          { id: uid("st"), label: "查找上下文", done: false },
          { id: uid("st"), label: "生成结果", done: false },
        ],
        confidence: 0,
        trigger: input,
        createdAt: isoNow(),
      };
      await upsertAgentTask(t);
      await refetchTasks();
      return;
    }

    const t: AgentTask = {
      id: uid("at"),
      sessionId: session.id,
      title: input,
      description: "Agent 正在思考…",
      status: "doing",
      steps: [
        { id: uid("st"), label: "分析请求", done: true },
        { id: uid("st"), label: "生成回复", done: false },
        { id: uid("st"), label: "整理结果", done: false },
      ],
      confidence: 0,
      trigger: input,
      createdAt: isoNow(),
    };
    await upsertAgentTask(t);
    await refetchTasks();
    setThinking(true);

    try {
      const reply = await agentChat(
        {
          base_url: llm.baseUrl.trim() || "https://api.openai.com/v1",
          api_key: llm.apiKey,
          model: llm.model.trim(),
          temperature: llm.temperature,
          max_tokens: llm.maxTokens,
        },
        messages,
      );
      const text = reply?.content?.trim() || "（模型未返回内容）";
      await appendAudit("agent_response", text);
      t.steps[1]!.done = true;
      t.steps[2]!.done = true;
      t.status = "done";
      t.description = text;
      await upsertAgentTask(t);
      await refetchTasks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await appendAudit("agent_error", "Agent 调用失败，请检查模型配置");
      t.status = "error";
      t.description = "调用失败，请检查 设置 → Agent 中的模型配置";
      await upsertAgentTask(t);
      await refetchTasks();
      showToast({
        message: "Agent 调用失败，请检查 设置 → Agent 中的模型配置",
        kind: "error",
        source: "agent",
        detail: msg,
      });
    } finally {
      setThinking(false);
    }
  };

  const approveDraft = async (d: AgentDraft) => {
    if (d.status !== "approved") {
      await upsertAgentDraft({ ...d, status: "approved" });
      await refetchDrafts();
    }
    await appendAudit("draft_approved", `草稿已批准 · ${d.subject}`);
    showToast({ message: "草稿已批准，可在草稿箱中发送", kind: "success" });
  };

  const editDraft = (d: AgentDraft) => {
    setSelectedDraftId(d.id);
    setDetailOpen(true);
    setAgentPanelOpen(false);
  };

  const switchSession = (id: string) => setActiveSessionId(id);

  return {
    sessions,
    tasks,
    drafts,
    audit,
    contacts,
    contactById,
    activeSessionId,
    setActiveSessionId,
    currentSession,
    sessionTasks,
    sessionDrafts,
    chatInput,
    setChatInput,
    thinking,
    newSession,
    deleteSession,
    sendChat,
    approveDraft,
    editDraft,
    appendAudit,
    switchSession,
    refetchAll,
    error,
    isLoading,
    /** Raw sessions resource — needed by consumers that want to plug
     *  the Agent state into a ResourceGate (loading/error/empty). The
     *  hook still owns the underlying fetch; this is just a re-export
     *  so views don't have to reach into the hook internals. */
    sessionsResource: sessions,
  };
}
