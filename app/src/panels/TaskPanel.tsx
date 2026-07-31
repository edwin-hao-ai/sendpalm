/** TaskPanel — task detail with full CRUD. */

import { Show, createResource, createSignal, createEffect } from "solid-js";
import { getTask, upsertTask, deleteTask } from "../stores/data";
import { setDetailOpen, setSelectedTaskId, showToast } from "../stores/ui";
import { Icon } from "../components/Icon";
import type { Task } from "../types";
import { relativeTime } from "../utils/date";

export function TaskPanel(props: { taskId: string }) {
  const [task, { refetch }] = createResource(() => props.taskId, getTask);
  const [draft, setDraft] = createSignal<Task | null>(null);

  createEffect(() => {
    const t = task();
    if (t) setDraft({ ...t });
  });

  const save = async () => {
    const d = draft();
    if (!d) return;
    await upsertTask(d);
    await refetch();
    showToast({ message: "已保存", kind: "success" });
  };

  const remove = async () => {
    if (!confirm("确定要删除这个任务？")) return;
    await deleteTask(props.taskId);
    setSelectedTaskId(null);
    setDetailOpen(false);
    showToast({ message: "已删除", kind: "info" });
  };

  return (
    <div style={{ display: "flex", "flex-direction": "column", height: "100%" }}>
      <header
        style={{
          padding: "var(--space-3) var(--space-5)",
          "border-bottom": "0.5px solid var(--border)",
          display: "flex",
          "align-items": "center",
          gap: "var(--space-3)",
          background: "var(--surface-elevated)",
        }}
      >
        <button
          onClick={() => { setSelectedTaskId(null); setDetailOpen(false); }}
          aria-label="Close"
          style={{ color: "var(--text-muted)" }}
        >
          <Icon name="ph-arrow-left" size={18} />
        </button>
        <strong style={{ "font-size": "var(--text-body-sm)", "font-weight": "700" }}>Task</strong>
        <div style={{ "margin-left": "auto" }}>
          <button
            onClick={remove}
            aria-label="Delete"
            style={{ color: "var(--text-muted)", padding: "4px" }}
          >
            <Icon name="ph-trash" size={14} />
          </button>
        </div>
      </header>

      <Show when={draft()}>
        {(d) => {
          const t = d();
          return (
            <div style={{ padding: "var(--space-5)", flex: 1, "overflow-y": "auto" }}>
              <input
                value={t.title}
                onInput={(e) => setDraft({ ...t, title: e.currentTarget.value })}
                style={{
                  width: "100%",
                  padding: "var(--space-3)",
                  "border-radius": "var(--radius-md)",
                  border: "none",
                  background: "var(--paper-mid)",
                  "font-size": "var(--text-h4)",
                  "font-family": "var(--font-display)",
                  "font-weight": "800",
                  "margin-bottom": "var(--space-4)",
                }}
              />
              <div style={{ display: "flex", gap: "var(--space-3)", "margin-bottom": "var(--space-3)" }}>
                <Field label="Status">
                  <select
                    value={t.status}
                    onChange={(e) => setDraft({ ...t, status: e.currentTarget.value as Task["status"] })}
                    style={inputStyle}
                  >
                    <option value="todo">Todo</option>
                    <option value="doing">Doing</option>
                    <option value="done">Done</option>
                  </select>
                </Field>
                <Field label="Priority">
                  <select
                    value={t.priority}
                    onChange={(e) => setDraft({ ...t, priority: e.currentTarget.value as Task["priority"] })}
                    style={inputStyle}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                  </select>
                </Field>
                <Field label="Due">
                  <input
                    type="datetime-local"
                    value={t.due ? t.due.slice(0, 16) : ""}
                    onInput={(e) => setDraft({ ...t, due: e.currentTarget.value ? new Date(e.currentTarget.value).toISOString() : undefined })}
                    style={inputStyle}
                  />
                </Field>
              </div>
              <Field label="Notes">
                <textarea
                  value={t.notes}
                  onInput={(e) => setDraft({ ...t, notes: e.currentTarget.value })}
                  rows={4}
                  style={{
                    ...inputStyle,
                    "min-height": "100px",
                    "font-family": "var(--font-body)",
                    resize: "vertical",
                  }}
                />
              </Field>
              <p style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)", "margin-top": "var(--space-3)" }}>
                创建于 {relativeTime(t.createdAt)}
              </p>
              <button
                onClick={save}
                style={{
                  "margin-top": "var(--space-4)",
                  padding: "10px 20px",
                  background: "var(--palm)",
                  color: "white",
                  "border-radius": "var(--radius-pill)",
                  "font-weight": "700",
                  "font-size": "var(--text-caption)",
                }}
              >
                保存
              </button>
            </div>
          );
        }}
      </Show>
    </div>
  );
}

function Field(props: { label: string; children: unknown }) {
  return (
    <label style={{ display: "flex", "flex-direction": "column", gap: "var(--space-1)", flex: 1 }}>
      <span style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)", "font-weight": "600" }}>{props.label}</span>
      {props.children as never}
    </label>
  );
}

const inputStyle = {
  padding: "8px 12px",
  border: "0.5px solid var(--border)",
  "border-radius": "var(--radius-md)",
  background: "var(--paper-light)",
  "font-size": "var(--text-body-sm)",
};