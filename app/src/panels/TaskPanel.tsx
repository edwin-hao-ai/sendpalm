/** TaskPanel — task detail with full CRUD. */

import { Show, createResource, createSignal, createEffect } from "solid-js";
import { getTask, upsertTask, deleteTask } from "../stores/data";
import { setDetailOpen, setSelectedTaskId, showToast, bumpSoftRefreshTick } from "../stores/ui";
import { Icon } from "../components/Icon";
import { PanelState } from "../components/PanelState";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Empty } from "../components/Empty";
import type { Task } from "../types";
import { relativeTime } from "../utils/date";
import { useRefreshEffect } from "../utils/gestures";
import { openTaskSource } from "../services/task-extraction";

export function TaskPanel(props: { taskId: string }) {
  const [task, { refetch }] = createResource(() => props.taskId, getTask);
  const [draft, setDraft] = createSignal<Task | null>(null);
  // Native `window.confirm` is unreliable inside a WKWebView (and unstyled
  // everywhere), so destructive actions go through the in-app dialog.
  const [confirmDelete, setConfirmDelete] = createSignal(false);

  useRefreshEffect(() => {
    void refetch();
  });

  createEffect(() => {
    const t = task();
    if (t) setDraft({ ...t });
  });

  const save = async () => {
    const d = draft();
    if (!d) return;
    await upsertTask(d);
    bumpSoftRefreshTick();
    await refetch();
    showToast({ message: "已保存", kind: "success" });
  };

  const remove = async () => {
    await deleteTask(props.taskId);
    bumpSoftRefreshTick();
    setSelectedTaskId(null);
    setDetailOpen(false);
    showToast({ message: "已删除", kind: "info" });
  };

  return (
    <div
      style={{ display: "flex", "flex-direction": "column", height: "100%" }}
    >
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
          onClick={() => {
            setSelectedTaskId(null);
            setDetailOpen(false);
          }}
          aria-label="返回"
          style={{ color: "var(--text-muted)" }}
        >
          <Icon name="ph-arrow-left" size={18} />
        </button>
        <strong
          style={{ "font-size": "var(--text-body-sm)", "font-weight": "700" }}
        >
          任务
        </strong>
        <div style={{ "margin-left": "auto" }}>
          <button
            onClick={() => setConfirmDelete(true)}
            aria-label="删除任务"
            style={{ color: "var(--text-muted)", padding: "4px" }}
          >
            <Icon name="ph-trash" size={14} />
          </button>
        </div>
      </header>

      {/* Loading and failure used to render nothing here, which reads as
          "this task has no fields" rather than "not loaded yet". */}
      <PanelState
        resource={task}
        errorTitle="任务加载失败"
        isEmpty={(t) => !t}
        empty={
          <Empty
            icon="ph-check-square"
            title="任务已不存在"
            description="它可能已被删除。"
          />
        }
      >
      <Show when={draft()}>
        {(d) => {
          const t = d();
          return (
            <div
              style={{
                padding: "var(--space-5)",
                flex: 1,
                "overflow-y": "auto",
              }}
            >
              <input
                value={t.title}
                onInput={(e) =>
                  setDraft({ ...t, title: e.currentTarget.value })
                }
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
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-3)",
                  "margin-bottom": "var(--space-3)",
                }}
              >
                <Field label="状态">
                  <select
                    value={t.status}
                    onChange={(e) =>
                      setDraft({
                        ...t,
                        status: e.currentTarget.value as Task["status"],
                      })
                    }
                    style={inputStyle}
                  >
                    <option value="todo">待办</option>
                    <option value="doing">进行中</option>
                    <option value="done">已完成</option>
                  </select>
                </Field>
                <Field label="优先级">
                  <select
                    value={t.priority}
                    onChange={(e) =>
                      setDraft({
                        ...t,
                        priority: e.currentTarget.value as Task["priority"],
                      })
                    }
                    style={inputStyle}
                  >
                    <option value="low">低</option>
                    <option value="normal">普通</option>
                    <option value="high">高</option>
                  </select>
                </Field>
                <Field label="截止时间">
                  <input
                    type="datetime-local"
                    value={t.due ? t.due.slice(0, 16) : ""}
                    onInput={(e) =>
                      setDraft({
                        ...t,
                        due: e.currentTarget.value
                          ? new Date(e.currentTarget.value).toISOString()
                          : undefined,
                      })
                    }
                    style={inputStyle}
                  />
                </Field>
              </div>
              <Field label="备注">
                <textarea
                  value={t.notes}
                  onInput={(e) =>
                    setDraft({ ...t, notes: e.currentTarget.value })
                  }
                  rows={4}
                  style={{
                    ...inputStyle,
                    "min-height": "100px",
                    "font-family": "var(--font-body)",
                    resize: "vertical",
                  }}
                />
              </Field>
              <Show when={t.relatedMessageId}>
                <button
                  style={{ "min-height": "44px", color: "var(--palm)", "margin-top": "var(--space-3)" }}
                  onClick={async () => {
                    if (!(await openTaskSource(t.relatedMessageId!))) showToast({ message: "来源邮件已不可用", kind: "info" });
                  }}
                >来源邮件</button>
              </Show>
              <p
                style={{
                  "font-size": "var(--text-micro)",
                  color: "var(--text-muted)",
                  "margin-top": "var(--space-3)",
                }}
              >
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
      </PanelState>
      <ConfirmDialog
        open={confirmDelete()}
        title="删除这个任务？"
        body="删除后无法恢复。"
        confirmLabel="删除"
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function Field(props: { label: string; children: unknown }) {
  return (
    <label
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "var(--space-1)",
        flex: 1,
      }}
    >
      <span
        style={{
          "font-size": "var(--text-micro)",
          color: "var(--text-muted)",
          "font-weight": "600",
        }}
      >
        {props.label}
      </span>
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
