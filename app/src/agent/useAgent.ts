/** Shared Agent state + actions — used by both AgentPanel and Agent view.
 * Keeps the side panel and the full workspace in sync without duplication.
 */

import { createMemo, createResource, createSignal } from "solid-js";
import {
  listAgentSessions,
  listAgentTasks,
  listAgentDrafts,
  listAgentAudit,
  listContacts,
  upsertAgentSession,
  upsertAgentTask,
  upsertAgentAudit,
} from "../stores/data";
import {
  setAgentPanelOpen,
  setDetailOpen,
  setSelectedDraftId,
  showToast,
} from "../stores/ui";
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
  const [contacts, { refetch: refetchContacts }] = createResource(listContacts);

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
    ]);
  };

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
    setTimeout(async () => {
      await appendAudit(
        "agent_response",
        "Agent 正在处理你的请求…（M6 接入真实 LLM）",
      );
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
      await refetchTasks();
      showToast({ message: "Agent 已开始处理", kind: "info" });
    }, 600);
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
  };
}
