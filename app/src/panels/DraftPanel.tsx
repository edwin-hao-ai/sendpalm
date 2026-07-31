/** DraftPanel — draft detail with full CRUD. */

import { Show, createResource, createSignal, createEffect } from "solid-js";
import { getDraft, upsertDraft, deleteDraft } from "../stores/data";
import { setDetailOpen, setSelectedDraftId, showToast, setComposeOpen } from "../stores/ui";
import { Icon } from "../components/Icon";
import type { Draft } from "../types";
import { relativeTime } from "../utils/date";

export function DraftPanel(props: { draftId: string }) {
  const [draft, { refetch }] = createResource(() => props.draftId, getDraft);
  const [edit, setEdit] = createSignal<Draft | null>(null);

  createEffect(() => {
    const d = draft();
    if (d) setEdit({ ...d });
  });

  const save = async () => {
    const e = edit();
    if (!e) return;
    await upsertDraft({ ...e, lastEdited: new Date().toISOString(), status: "edited" });
    await refetch();
    showToast({ message: "草稿已保存", kind: "success" });
  };

  const send = async () => {
    const e = edit();
    if (!e) return;
    await upsertDraft({ ...e, lastEdited: new Date().toISOString(), status: "sent" });
    await refetch();
    showToast({ message: "已发送", kind: "success" });
    setSelectedDraftId(null);
    setDetailOpen(false);
  };

  const remove = async () => {
    if (!confirm("删除此草稿？")) return;
    await deleteDraft(props.draftId);
    setSelectedDraftId(null);
    setDetailOpen(false);
  };

  const openInCompose = () => {
    setComposeOpen(true);
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
          onClick={() => { setSelectedDraftId(null); setDetailOpen(false); }}
          aria-label="Close"
          style={{ color: "var(--text-muted)" }}
        >
          <Icon name="ph-arrow-left" size={18} />
        </button>
        <strong style={{ "font-size": "var(--text-body-sm)", "font-weight": "700" }}>Draft</strong>
        <div style={{ "margin-left": "auto", display: "flex", gap: "var(--space-2)" }}>
          <button
            onClick={openInCompose}
            aria-label="Open in compose"
            style={{ color: "var(--text-muted)", padding: "4px" }}
            title="Open in Compose"
          >
            <Icon name="ph-pencil-line" size={14} />
          </button>
          <button
            onClick={remove}
            aria-label="Delete"
            style={{ color: "var(--text-muted)", padding: "4px" }}
          >
            <Icon name="ph-trash" size={14} />
          </button>
        </div>
      </header>

      <Show when={edit()}>
        {(d) => {
          const e = d();
          return (
            <div style={{ padding: "var(--space-5)", flex: 1, "overflow-y": "auto" }}>
              <p style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)" }}>
                To · {e.recipient}
              </p>
              <input
                value={e.subject}
                onInput={(ev) => setEdit({ ...e, subject: ev.currentTarget.value })}
                placeholder="(无主题)"
                style={{
                  width: "100%",
                  padding: "var(--space-3) 0",
                  "border-radius": 0,
                  border: "none",
                  background: "transparent",
                  "font-size": "var(--text-h4)",
                  "font-family": "var(--font-display)",
                  "font-weight": "800",
                  "margin-bottom": "var(--space-3)",
                  "border-bottom": "0.5px solid var(--border)",
                }}
              />
              <textarea
                value={e.body}
                onInput={(ev) => setEdit({ ...e, body: ev.currentTarget.value })}
                rows={12}
                style={{
                  width: "100%",
                  padding: "var(--space-3) 0",
                  "border-radius": 0,
                  border: "none",
                  background: "transparent",
                  "font-family": "var(--font-body)",
                  "font-size": "var(--text-body-sm)",
                  "line-height": 1.5,
                  resize: "none",
                }}
              />
              <p style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)", "margin-top": "var(--space-3)" }}>
                上次编辑 {relativeTime(e.lastEdited)} · 状态：{e.status}
              </p>
              <div style={{ display: "flex", gap: "var(--space-2)", "margin-top": "var(--space-4)" }}>
                <button
                  onClick={save}
                  style={{
                    padding: "10px 20px",
                    background: "var(--paper-light)",
                    border: "0.5px solid var(--border-strong)",
                    "border-radius": "var(--radius-pill)",
                    "font-weight": "700",
                    "font-size": "var(--text-caption)",
                  }}
                >
                  保存草稿
                </button>
                <button
                  onClick={send}
                  style={{
                    padding: "10px 20px",
                    background: "var(--palm)",
                    color: "white",
                    "border-radius": "var(--radius-pill)",
                    "font-weight": "700",
                    "font-size": "var(--text-caption)",
                  }}
                >
                  发送
                </button>
              </div>
            </div>
          );
        }}
      </Show>
    </div>
  );
}