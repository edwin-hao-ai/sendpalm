import { For, Show, createEffect, createResource, createSignal, onCleanup } from "solid-js";
import { confirmTaskSuggestion, dismissTaskSuggestion, listPendingTaskSuggestions, listTasksPage, upsertTask } from "../stores/data";
import { setDetailOpen, setSelectedTaskId, setSelectedMessageId, setSelectedContactId, setSelectedCompanyName, setSelectedFileId, setSelectedMeetingId, setSelectedDraftId, setView, showToast, consumeCreateIntent } from "../stores/ui";
import { ResourceGate } from "../components/ResourceGate";
import { PageHeader } from "../components/PageHeader";
import { ErrorState } from "../components/Empty";
import { useRefreshEffect, useSoftRefreshEffect } from "../utils/gestures";
import { openTaskSource, taskExtractionAvailable } from "../services/task-extraction";
import type { Task, TaskSuggestion } from "../types";
import "./Tasks.css";

const PAGE_SIZE = 100;
const GROUPS = [{ direction: "mine", label: "我承诺的" }, { direction: "theirs", label: "对方承诺的" }, { direction: undefined, label: "未分类" }] as const;
const STATUS_LABEL = { todo: "待办", doing: "进行中", done: "已完成" };
export function Tasks() {
  const draftCache = new Map<string, TaskSuggestion>();
  const [limit, setLimit] = createSignal(PAGE_SIZE);
  const [data, { refetch }] = createResource(limit, async count => ({ tasks: await listTasksPage(count), suggestions: await listPendingTaskSuggestions() }));
  useRefreshEffect(() => { void refetch(); });
  useSoftRefreshEffect(() => { void refetch(); });
  const [busy, setBusy] = createSignal(false);
  const createTask = async () => {
    if (busy()) return;
    setBusy(true);
    try {
      const id = crypto.randomUUID();
      await upsertTask({ id, title: "新任务", notes: "", status: "todo", priority: "normal", createdAt: new Date().toISOString() });
      await refetch();
      openTask(id);
    } catch { showToast({ message: "创建失败，请重试", kind: "error" }); }
    finally { setBusy(false); }
  };
  // ⌘K → 新建任务 lands here. Declared after `createTask` on purpose: the
  // effect body runs immediately on mount, and a `const` referenced before
  // its initializer would throw.
  createEffect(() => {
    if (consumeCreateIntent("task")) void createTask();
  });
  return <div class="tasks-view" data-testid="tasks-view">
    <PageHeader
      title="Tasks"
      actions={
        <>
          <button class="tasks-button" onClick={() => setView("followUps")}>跟进提醒</button>
          <button class="tasks-button" disabled={busy()} onClick={createTask}>新建任务</button>
        </>
      }
    />
    <Show when={!taskExtractionAvailable()}><p class="tasks-hint">在桌面应用的设置 → Agent 中配置模型后，可从邮件提取任务建议。手动任务和跟进提醒始终可用。</p></Show>
    <ResourceGate resource={data} isEmpty={d => !d.tasks.length && !d.suggestions.length} empty={<p>还没有任务</p>} errorView={() => <ErrorState title="加载失败" retry={() => void refetch()} />}>
      {d => <>
        <Show when={d.suggestions.length}><section aria-label="AI 建议待确认"><h2>AI 建议 · 待确认</h2><p class="tasks-hint">这些是草稿，确认后才会成为任务。请核对原文、日期和承诺方向。</p><For each={d.suggestions}>{s => <SuggestionCard suggestion={s} draftCache={draftCache} onChange={() => void refetch()} />}</For></section></Show>
        <For each={GROUPS}>{group => <Show when={d.tasks.some(t => t.direction === group.direction)}><section><h2>{group.label}</h2><For each={d.tasks.filter(t => t.direction === group.direction)}>{task => <button class="tasks-row" onClick={() => openTask(task.id)}><span>{task.title}</span><span class="tasks-hint">{STATUS_LABEL[task.status]}{task.due ? ` · ${task.due.slice(0, 10)}` : ""}</span></button>}</For></section></Show>}</For>
        <Show when={d.tasks.length === limit()}><button class="tasks-button" onClick={() => setLimit(n => n + PAGE_SIZE)}>加载更多任务</button></Show>
      </>}
    </ResourceGate>
  </div>;
}

function openTask(id: string) {
  setSelectedMessageId(null);
  setSelectedContactId(null);
  setSelectedCompanyName(null);
  setSelectedFileId(null);
  setSelectedMeetingId(null);
  setSelectedDraftId(null);
  setSelectedTaskId(id);
  setDetailOpen(true);
}

function SuggestionCard(props: { suggestion: TaskSuggestion; draftCache: Map<string, TaskSuggestion>; onChange: () => void }) {
  const [draft, setDraft] = createSignal(props.draftCache.get(props.suggestion.id) ?? { ...props.suggestion });
  let completed = false;
  onCleanup(() => {
    if (completed) props.draftCache.delete(props.suggestion.id);
    else props.draftCache.set(props.suggestion.id, draft());
  });
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  const apply = async (confirm: boolean) => {
    if (busy()) return;
    setBusy(true); setError("");
    try {
      if (confirm) await confirmTaskSuggestion(draft());
      else await dismissTaskSuggestion(draft().id);
      completed = true;
      props.onChange();
    } catch { setError("操作失败，请重试并检查标题和方向"); }
    finally { setBusy(false); }
  };
  return <article class="task-suggestion">
    <label>建议标题<input aria-label="建议标题" maxlength={240} value={draft().title} onInput={e => setDraft(d => ({ ...d, title: e.currentTarget.value }))} /></label>
    <div class="task-suggestion-fields">
      <label>承诺方向<select aria-label="承诺方向" value={draft().direction} onChange={e => setDraft(d => ({ ...d, direction: e.currentTarget.value as TaskSuggestion["direction"] }))}><option value="unclear">请选择方向</option><option value="mine">我承诺的</option><option value="theirs">对方承诺的</option></select></label>
      <label>截止日期<input aria-label="截止日期" type="date" value={draft().due?.slice(0, 10) ?? ""} onInput={e => setDraft(d => ({ ...d, due: e.currentTarget.value || undefined }))} /></label>
      <label>优先级<select aria-label="优先级" value={draft().priority} onChange={e => setDraft(d => ({ ...d, priority: e.currentTarget.value as Task["priority"] }))}><option value="low">低</option><option value="normal">普通</option><option value="high">高</option></select></label>
    </div>
    <label>说明 / 原文依据<textarea aria-label="说明 / 原文依据" value={draft().notes} onInput={e => setDraft(d => ({ ...d, notes: e.currentTarget.value }))} /></label>
    <div class="task-suggestion-fields"><button class="tasks-button" onClick={async () => { if (!(await openTaskSource(draft().sourceMessageId))) setError("来源邮件已不可用"); }}>来源邮件</button><button class="tasks-button" disabled={busy() || draft().direction === "unclear" || !draft().title.trim()} onClick={() => void apply(true)}>确认任务</button><button class="tasks-button" disabled={busy()} onClick={() => void apply(false)}>忽略建议</button></div>
    <Show when={error()}><p role="alert">{error()}</p></Show>
  </article>;
}
