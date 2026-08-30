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
  upsertAgentAudit,
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
  AgentDraft,
} from "../types";

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
    await refetchSessions();
  };

  const sendChat = async () => {
    const input = chatInput().trim();
    if (!input || !currentSession()) return;
    await appendAudit("user_input", input);
    setChatInput("");

    // Build the messages we send to the LLM. We prepend the
    // user's configured system prompt (if any) and a single
    // user turn with the current input. M11 — real OpenAI-
    // compatible backend, configured in Settings → Agent.
    const llm = appSettings.agent.llm;
    const messages: { role: string; content: string }[] = [];
    if (llm.systemPrompt.trim()) {
      messages.push({ role: "system", content: llm.systemPrompt.trim() });
    }
    messages.push({ role: "user", content: input });

    // Browser-mode fallback: tauri-plugin-store has no
    // agent_chat command, so the frontend surfaces a clear hint
    // instead of silently failing. The Tauri shell will replace
    // this with a real network round-trip.
    if (IS_BROWSER()) {
      await appendAudit(
        "agent_response",
        "（浏览器预览模式）Settings → Agent 里填入 API key + model 后即可走真 LLM。当前返回 mock 响应。",
      );
      const t: AgentTask = {
        id: uid("at"),
        sessionId: currentSession()!.id,
        title: input,
        description: "Agent 生成的占位任务",
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
      showToast({ message: "Agent 已开始处理（浏览器预览）", kind: "info" });
      return;
    }

    // Mark the task as "doing" before awaiting the LLM. SolidJS
    // re-runs `tasks` resource after `refetchTasks()` so the user
    // sees the spinner without any artificial delay. The previous
    // `setTimeout(..., 200)` was a fake-streaming hack that the
    // P2 audit identified: a 200ms wait before the network call
    // is a perceived-latency tax for no user-visible benefit.
    const t: AgentTask = {
      id: uid("at"),
      sessionId: currentSession()!.id,
      title: input,
      description: "调用真实 LLM 中…",
      status: "doing",
      steps: [
        { id: uid("st"), label: "分析请求", done: true },
        { id: uid("st"), label: "调用 LLM", done: false },
        { id: uid("st"), label: "生成结果", done: false },
      ],
      confidence: 0,
      trigger: input,
      createdAt: isoNow(),
    };
    await upsertAgentTask(t);
    await refetchTasks();
    showToast({ message: "Agent 正在调用 LLM…", kind: "info" });

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
      // Mark the second step done and the third done, then save the
      // reply into the task description so the user can see it.
      t.steps[1]!.done = true;
      t.steps[2]!.done = true;
      t.status = "done";
      t.description = text;
      await upsertAgentTask(t);
      await refetchTasks();
      showToast({ message: "LLM 已返回", kind: "success" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await appendAudit("agent_error", `LLM 调用失败：${msg}`);
      t.status = "error";
      t.description = `失败：${msg}`;
      await upsertAgentTask(t);
      await refetchTasks();
      showToast({ message: `LLM 失败：${msg}`, kind: "error" });
    }
  };

  const approveDraft = async (d: AgentDraft) => {
    // Caller is expected to persist draft status if desired.
    await appendAudit("draft_approved", `草稿已审批 · ${d.subject}`);
    showToast({ message: "已审批 — 进入发送队列", kind: "success" });
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
    newSession,
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
