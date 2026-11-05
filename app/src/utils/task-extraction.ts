import type { Message, TaskPriority, TaskSuggestionDirection } from "../types";
import { htmlToPlainText } from "./html";

export const TASK_INPUT_MAX_CHARS = 12_000;
export const TASK_MAX_SUGGESTIONS = 3;
export const TASK_MAX_COMPLETION_TOKENS = 512;
const TITLE_MAX_CHARS = 240;
const NOTES_MAX_CHARS = 1000;
export interface ParsedTaskSuggestion {
  title: string;
  notes: string;
  due?: string;
  priority: TaskPriority;
  direction: TaskSuggestionDirection;
}

export function parseTaskExtractionResponse(raw: string): ParsedTaskSuggestion[] {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !("tasks" in value) || !Array.isArray(value.tasks) || value.tasks.length > TASK_MAX_SUGGESTIONS) throw new Error("无效任务结果");
  return value.tasks.map((candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") throw new Error("无效任务");
    const c = candidate as Record<string, unknown>;
    if (typeof c.title !== "string" || !c.title.trim() || c.title.length > TITLE_MAX_CHARS) throw new Error("无效标题");
    if (c.direction !== "mine" && c.direction !== "theirs" && c.direction !== "unclear") throw new Error("无效方向");
    if (c.priority != null && c.priority !== "low" && c.priority !== "normal" && c.priority !== "high") throw new Error("无效优先级");
    if (c.notes != null && (typeof c.notes !== "string" || c.notes.length > NOTES_MAX_CHARS)) throw new Error("无效说明");
    let due: string | undefined;
    if (c.due != null && c.due !== "") {
      if (typeof c.due !== "string" || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(c.due)) throw new Error("无效日期");
      const parsed = new Date(c.due);
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== c.due.slice(0, 10)) throw new Error("无效日期");
      due = c.due;
    }
    return { title: c.title.trim(), notes: (c.notes as string) ?? "", due, priority: (c.priority as TaskPriority) ?? "normal", direction: c.direction };
  });
}

export function buildTaskExtractionInput(message: Message, accountEmail: string, sender: string): string {
  const metadata = { direction: message.direction, accountEmail: accountEmail.slice(0, 320), sender: sender.slice(0, 320), recipients: (message.to ?? "").slice(0, 640), cc: (message.cc ?? []).join(", ").slice(0, 640), subject: (message.subj ?? "").slice(0, 500), receivedAt: message.st };
  const body = (message.body || htmlToPlainText(message.bodyHtml || "")).slice(0, TASK_INPUT_MAX_CHARS);
  let length = body.length;
  let input = JSON.stringify({ ...metadata, body: body.slice(0, length) });
  while (input.length > TASK_INPUT_MAX_CHARS && length > 0) {
    length = Math.max(0, length - (input.length - TASK_INPUT_MAX_CHARS));
    input = JSON.stringify({ ...metadata, body: body.slice(0, length) });
  }
  return input;
}
