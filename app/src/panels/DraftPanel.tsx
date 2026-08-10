/** DraftPanel — draft detail with full CRUD. */

import {
  Show,
  For,
  createResource,
  createSignal,
  createEffect,
} from "solid-js";
import {
  getDraft,
  upsertDraft,
  deleteDraft,
  upsertFollowUp,
} from "../stores/data";
import {
  setDetailOpen,
  setSelectedDraftId,
  showToast,
  setComposeOpen,
  setComposeContext,
} from "../stores/ui";
import { sendEmailViaBackend, getAttachmentContent } from "../services/backend";
import { Icon } from "../components/Icon";
import type { Draft } from "../types";
import { relativeTime, formatBytes, addDays } from "../utils/date";
import { uid } from "../utils/id";
import { useRefreshEffect } from "../utils/gestures";

export function DraftPanel(props: { draftId: string }) {
  const [draft, { refetch }] = createResource(() => props.draftId, getDraft);
  const [edit, setEdit] = createSignal<Draft | null>(null);

  useRefreshEffect(() => {
    void refetch();
  });

  createEffect(() => {
    const d = draft();
    if (d) setEdit({ ...d });
  });

  const save = async () => {
    const e = edit();
    if (!e) return;
    await upsertDraft({
      ...e,
      lastEdited: new Date().toISOString(),
      status: "edited",
    });
    await refetch();
    showToast({ message: "草稿已保存", kind: "success" });
  };

  const send = async () => {
    const e = edit();
    if (!e) return;
    const attachments = (e.attachments ?? []).map((a) => ({
      filename: a.name,
      mime: a.mime,
      dataBase64: a.dataBase64,
    }));
    const cc = (e.cc ?? []).join(", ");
    const bcc = (e.bcc ?? []).join(", ");
    const result = await sendEmailViaBackend(
      e.recipient,
      e.subject || "(no subject)",
      e.body,
      e.accountId,
      attachments,
      cc,
      bcc,
      e.fromAlias,
    );
    if (!result) {
      showToast({
        message: "未配置真实账户，草稿已保存",
        kind: "info",
      });
      return;
    }
    await upsertDraft({
      ...e,
      lastEdited: new Date().toISOString(),
      status: "sent",
    });
    await refetch();
    const createFollowUp = async () => {
      if (!result.local_message_id) {
        showToast({ message: "无法创建跟进（无本地消息 ID）", kind: "info" });
        return;
      }
      const due = addDays(new Date(), 3);
      await upsertFollowUp({
        id: uid("fu"),
        msgId: result.local_message_id,
        dueAt: due.toISOString(),
        status: "pending",
        note: "发送后 3 天跟进",
      });
      showToast({ message: "已设置 3 天后跟进", kind: "success" });
    };
    showToast({
      message: `已发送 · ${result.message_id.slice(0, 24)}…`,
      kind: "success",
      action: {
        label: "设置跟进 3 天",
        run: () => void createFollowUp(),
      },
    });
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
    const d = draft();
    if (!d) return;
    setComposeContext({ mode: "new", draft: d });
    setComposeOpen(true);
  };

  const updateField = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    const e = edit();
    if (!e) return;
    setEdit({ ...e, [key]: value });
  };

  const updateAddrList = (key: "cc" | "bcc", raw: string) => {
    const list = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    updateField(key, list);
  };

  const downloadAttachment = async (
    att: NonNullable<Draft["attachments"]>[number],
  ) => {
    const dataUrl = await getAttachmentContent(att.id);
    if (!dataUrl) {
      showToast({ message: "无法读取附件", kind: "error" });
      return;
    }
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = att.name;
    a.click();
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
            setSelectedDraftId(null);
            setDetailOpen(false);
          }}
          aria-label="Close"
          style={{ color: "var(--text-muted)" }}
        >
          <Icon name="ph-arrow-left" size={18} />
        </button>
        <strong
          style={{ "font-size": "var(--text-body-sm)", "font-weight": "700" }}
        >
          Draft
        </strong>
        <div
          style={{
            "margin-left": "auto",
            display: "flex",
            gap: "var(--space-2)",
          }}
        >
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
            <div
              style={{
                padding: "var(--space-5)",
                flex: 1,
                "overflow-y": "auto",
              }}
            >
              <label
                style={{
                  "font-size": "var(--text-micro)",
                  color: "var(--text-muted)",
                  display: "block",
                  "margin-bottom": "var(--space-1)",
                }}
              >
                To
              </label>
              <input
                value={e.recipient}
                onInput={(ev) =>
                  updateField("recipient", ev.currentTarget.value)
                }
                style={{
                  width: "100%",
                  padding: "var(--space-2) 0",
                  border: "none",
                  "border-bottom": "0.5px solid var(--border)",
                  background: "transparent",
                  "font-size": "var(--text-body-sm)",
                }}
              />

              <label
                style={{
                  "font-size": "var(--text-micro)",
                  color: "var(--text-muted)",
                  display: "block",
                  "margin-top": "var(--space-3)",
                  "margin-bottom": "var(--space-1)",
                }}
              >
                Cc
              </label>
              <input
                value={(e.cc ?? []).join(", ")}
                onInput={(ev) => updateAddrList("cc", ev.currentTarget.value)}
                placeholder="comma separated"
                style={{
                  width: "100%",
                  padding: "var(--space-2) 0",
                  border: "none",
                  "border-bottom": "0.5px solid var(--border)",
                  background: "transparent",
                  "font-size": "var(--text-body-sm)",
                }}
              />

              <label
                style={{
                  "font-size": "var(--text-micro)",
                  color: "var(--text-muted)",
                  display: "block",
                  "margin-top": "var(--space-3)",
                  "margin-bottom": "var(--space-1)",
                }}
              >
                Bcc
              </label>
              <input
                value={(e.bcc ?? []).join(", ")}
                onInput={(ev) => updateAddrList("bcc", ev.currentTarget.value)}
                placeholder="comma separated"
                style={{
                  width: "100%",
                  padding: "var(--space-2) 0",
                  border: "none",
                  "border-bottom": "0.5px solid var(--border)",
                  background: "transparent",
                  "font-size": "var(--text-body-sm)",
                }}
              />

              <input
                value={e.subject}
                onInput={(ev) => updateField("subject", ev.currentTarget.value)}
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
                  "margin-top": "var(--space-4)",
                  "margin-bottom": "var(--space-3)",
                  "border-bottom": "0.5px solid var(--border)",
                }}
              />
              <textarea
                value={e.body}
                onInput={(ev) => updateField("body", ev.currentTarget.value)}
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

              <Show when={(e.attachments ?? []).length > 0}>
                <div
                  style={{
                    "margin-top": "var(--space-4)",
                    "margin-bottom": "var(--space-3)",
                  }}
                >
                  <p
                    style={{
                      "font-size": "var(--text-micro)",
                      color: "var(--text-muted)",
                      "margin-bottom": "var(--space-2)",
                    }}
                  >
                    Attachments · {(e.attachments ?? []).length}
                  </p>
                  <For each={e.attachments ?? []}>
                    {(att) => (
                      <button
                        onClick={() => downloadAttachment(att)}
                        style={{
                          display: "flex",
                          "align-items": "center",
                          gap: "var(--space-2)",
                          padding: "var(--space-2) var(--space-3)",
                          "border-radius": "var(--radius-md)",
                          background: "var(--paper-mid)",
                          "margin-bottom": "var(--space-2)",
                          width: "100%",
                          "text-align": "left",
                        }}
                      >
                        <Icon name="ph-file" size={16} />
                        <span
                          style={{
                            "font-size": "var(--text-caption)",
                            "flex-shrink": 1,
                            "min-width": 0,
                            overflow: "hidden",
                            "text-overflow": "ellipsis",
                            "white-space": "nowrap",
                          }}
                        >
                          {att.name}
                        </span>
                        <span
                          style={{
                            "font-size": "var(--text-micro)",
                            color: "var(--text-muted)",
                            "margin-left": "auto",
                            "flex-shrink": 0,
                          }}
                        >
                          {formatBytes(att.size)}
                        </span>
                      </button>
                    )}
                  </For>
                </div>
              </Show>

              <p
                style={{
                  "font-size": "var(--text-micro)",
                  color: "var(--text-muted)",
                  "margin-top": "var(--space-3)",
                }}
              >
                上次编辑 {relativeTime(e.lastEdited)} · 状态：{e.status}
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-2)",
                  "margin-top": "var(--space-4)",
                }}
              >
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
