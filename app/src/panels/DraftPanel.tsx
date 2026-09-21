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
  setSettingsTab,
  setView,
  showToast,
  setComposeOpen,
  setComposeContext,
} from "../stores/ui";
import { sendEmailViaBackend, getAttachmentContent } from "../services/backend";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { Skeleton } from "../components/Skeleton";
import type { Draft } from "../types";
import { relativeTime, formatBytes, addDays } from "../utils/date";
import { draftStatusLabel } from "../utils/draft-status";
import { uid } from "../utils/id";
import { useRefreshEffect } from "../utils/gestures";
import { firstInvalidAddress } from "../compose/Compose";

export function DraftPanel(props: { draftId: string }) {
  const [draft, { refetch }] = createResource(() => props.draftId, getDraft);
  const [edit, setEdit] = createSignal<Draft | null>(null);
  const [sending, setSending] = createSignal(false);
  const [confirmDelete, setConfirmDelete] = createSignal(false);
  const [confirmDiscard, setConfirmDiscard] = createSignal(false);

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
    if (!e || sending()) return;
    const badTo = firstInvalidAddress(e.recipient);
    if (!e.recipient.trim() || badTo) {
      showToast({
        message: badTo
          ? `收件人地址格式不正确：${badTo}`
          : "请先填写收件人",
        kind: "error",
      });
      return;
    }
    for (const [label, list] of [
      ["抄送", e.cc ?? []],
      ["密送", e.bcc ?? []],
    ] as const) {
      const bad = firstInvalidAddress(list.join(", "));
      if (bad) {
        showToast({ message: `${label}地址格式不正确：${bad}`, kind: "error" });
        return;
      }
    }
    setSending(true);
    try {
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
          message: "尚未绑定邮箱账户，无法发送。草稿已保存。",
          kind: "info",
          action: {
            label: "去设置",
            run: () => {
              setSettingsTab("accounts");
              setView("settings");
            },
          },
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
        message: `已发送给 ${e.recipient}`,
        kind: "success",
        action: {
          label: "设置 3 天后跟进",
          run: () => void createFollowUp(),
        },
      });
      setSelectedDraftId(null);
      setDetailOpen(false);
    } finally {
      setSending(false);
    }
  };

  const remove = async () => {
    await deleteDraft(props.draftId);
    setSelectedDraftId(null);
    setDetailOpen(false);
  };

  const close = () => {
    setSelectedDraftId(null);
    setDetailOpen(false);
  };

  /** True when the user has unsaved edits — compares the working copy
   *  against the persisted draft on the fields the panel exposes. */
  const isDirty = () => {
    const e = edit();
    const d = draft();
    if (!e || !d) return false;
    return (
      e.recipient !== d.recipient ||
      e.subject !== d.subject ||
      e.body !== d.body ||
      (e.cc ?? []).join(",") !== (d.cc ?? []).join(",") ||
      (e.bcc ?? []).join(",") !== (d.bcc ?? []).join(",")
    );
  };

  const requestClose = () => {
    if (isDirty()) setConfirmDiscard(true);
    else close();
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

  const fieldLabelStyle = {
    "font-size": "var(--text-micro)",
    color: "var(--text-muted)",
    display: "block",
    "margin-bottom": "var(--space-1)",
  } as const;

  const fieldInputStyle = {
    width: "100%",
    padding: "var(--space-2) 0",
    border: "none",
    "border-bottom": "0.5px solid var(--border)",
    background: "transparent",
    "font-size": "var(--text-body-sm)",
  } as const;

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
          onClick={requestClose}
          aria-label="返回"
          title="返回"
          style={{ color: "var(--text-muted)" }}
        >
          <Icon name="ph-arrow-left" size={18} />
        </button>
        <strong
          style={{ "font-size": "var(--text-body-sm)", "font-weight": "700" }}
        >
          草稿
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
            aria-label="在写信窗口中打开"
            style={{ color: "var(--text-muted)", padding: "4px" }}
            title="在写信窗口中打开"
          >
            <Icon name="ph-pencil-line" size={14} />
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            aria-label="删除草稿"
            title="删除草稿"
            style={{ color: "var(--text-muted)", padding: "4px" }}
          >
            <Icon name="ph-trash" size={14} />
          </button>
        </div>
      </header>

      <ConfirmDialog
        open={confirmDelete()}
        title="删除此草稿？"
        body="删除后无法恢复。"
        confirmLabel="删除"
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmDiscard()}
        title="放弃未保存的修改？"
        body="当前修改尚未保存，返回后将丢失。"
        confirmLabel="放弃修改"
        onConfirm={close}
        onCancel={() => setConfirmDiscard(false)}
      />

      <Show
        when={edit()}
        fallback={
          <div
            style={{
              padding: "var(--space-5)",
              display: "flex",
              "flex-direction": "column",
              gap: "var(--space-4)",
            }}
          >
            <Skeleton height={18} width="60%" />
            <Skeleton height={28} />
            <Skeleton height={200} />
          </div>
        }
      >
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
              <label style={fieldLabelStyle}>收件人</label>
              <input
                value={e.recipient}
                onInput={(ev) =>
                  updateField("recipient", ev.currentTarget.value)
                }
                placeholder="多个地址用逗号分隔"
                style={fieldInputStyle}
              />

              <label
                style={{
                  ...fieldLabelStyle,
                  "margin-top": "var(--space-3)",
                }}
              >
                抄送
              </label>
              <input
                value={(e.cc ?? []).join(", ")}
                onInput={(ev) => updateAddrList("cc", ev.currentTarget.value)}
                placeholder="多个地址用逗号分隔"
                style={fieldInputStyle}
              />

              <label
                style={{
                  ...fieldLabelStyle,
                  "margin-top": "var(--space-3)",
                }}
              >
                密送
              </label>
              <input
                value={(e.bcc ?? []).join(", ")}
                onInput={(ev) => updateAddrList("bcc", ev.currentTarget.value)}
                placeholder="多个地址用逗号分隔"
                style={fieldInputStyle}
              />

              <input
                value={e.subject}
                onInput={(ev) => updateField("subject", ev.currentTarget.value)}
                placeholder="(无主题)"
                aria-label="主题"
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
                aria-label="正文"
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
                    附件 · {(e.attachments ?? []).length}
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
                上次编辑 {relativeTime(e.lastEdited)} · 状态：
                {draftStatusLabel(e.status)}
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
                <Show when={e.status !== "sent"}>
                  <button
                    onClick={() => void send()}
                    disabled={sending()}
                    style={{
                      padding: "10px 20px",
                      background: "var(--palm)",
                      color: "var(--paper-light)",
                      "border-radius": "var(--radius-pill)",
                      "font-weight": "700",
                      "font-size": "var(--text-caption)",
                      opacity: sending() ? 0.6 : 1,
                      cursor: sending() ? "wait" : "pointer",
                    }}
                  >
                    {sending() ? "发送中…" : "发送"}
                  </button>
                </Show>
              </div>
            </div>
          );
        }}
      </Show>
    </div>
  );
}
