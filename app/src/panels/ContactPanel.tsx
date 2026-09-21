/** ContactPanel — right-side detail panel with tabs.
 * Tabs: Timeline · Notes · Files · Insights · Network · Calendar
 * Spec: prototype-v11 §3.3.
 *
 * PERF-3: this panel used to fire 8 separate `createResource`
 * reads on mount (contact + messages + events + files + notes +
 * tasks + follow-ups + clips). Each was its own IPC roundtrip
 * and its own SQLite pool checkout, so the slowest query gated
 * every other tab's first render. We now issue a single
 * `getContactBundle(contactId)` (defined in `stores/data.ts`)
 * which runs all 7 list reads via `Promise.all` — the panel
 * waits for one batched promise instead of 7 staggered ones.
 * Per-tab mutations (`upsertContact`, `upsertContactNote`, …)
 * still go through the per-resource Rust commands; the
 * `setBundle` mutate hook patches the bundle in place so the
 * render is optimistic without a full refetch.
 */

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import {
  getContactBundle,
  listEvents,
  listLabels,
  listTasks,
  upsertContact,
  upsertContactNote,
  deleteContact,
  deleteContactNote,
  upsertTask,
  upsertFollowUp,
  deleteTask,
  deleteFollowUp,
  deleteClip,
} from "../stores/data";
import {
  setDetailOpen,
  setSelectedContactId,
  contactTab,
  setContactTab,
  setSelectedMessageId,
  setSelectedFileId,
  showToast,
  setComposeOpen,
  setComposeContext,
  openCompanyDetail,
  type ContactTab,
} from "../stores/ui";
import { contactsList } from "../stores/contacts";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { SkeletonList } from "../components/Skeleton";
import { Empty, ErrorState } from "../components/Empty";
import { ContactEditModal } from "../components/ContactEditModal";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  STAGE_COLOR,
  STAGE_LABEL,
  STAGE_SUGGEST,
  fileIconName,
} from "../utils/labels";
import { relativeTime, formatBytes } from "../utils/date";
import { computeReplyTimeStats } from "../utils/reply-time";
import type {
  Contact,
  ContactNote,
  Task,
  FollowUp,
  Clip,
  Message,
  FileItem,
  CalendarEvent,
  Label,
} from "../types";
import { uid } from "../utils/id";
import { isoNow } from "../utils/date";
import { useRefreshEffect } from "../utils/gestures";

const TABS: { id: ContactTab; label: string }[] = [
  { id: "Timeline", label: "时间线" },
  { id: "Notes", label: "备注" },
  { id: "Files", label: "文件" },
  { id: "Tasks", label: "任务" },
  { id: "Follow-ups", label: "跟进" },
  { id: "Clips", label: "剪藏" },
  { id: "Insights", label: "洞察" },
  { id: "Network", label: "人脉" },
  { id: "Calendar", label: "日程" },
];

const BUCKET_OPTIONS: { id: Contact["defaultBucket"]; label: string }[] = [
  { id: "imbox", label: "Imbox（重要邮件）" },
  { id: "feed", label: "Stream（资讯与 newsletter）" },
  { id: "paperTrail", label: "Records（收据与账单）" },
];

function bucketLabel(b: Contact["defaultBucket"]): string {
  return b === "imbox" ? "Imbox" : b === "feed" ? "Stream" : "Records";
}

/** Comma-joined names for a contact's autofile label ids. */
export function autoLabelNames(c: Contact, labels: Label[] | undefined): string {
  if (!c.autoLabel.length) return "";
  return c.autoLabel
    .map((id) => (labels ?? []).find((l) => l.id === id)?.name ?? "")
    .filter(Boolean)
    .join(", ");
}

// Frozen empty arrays used as fallbacks while the bundle is
// pending or errored. Sharing these across renders (instead of
// `?? []`) lets Solid's `===` checks avoid re-running memos.
const EMPTY_MESSAGES = Object.freeze([]) as unknown as Message[];
const EMPTY_EVENTS = Object.freeze([]) as unknown as CalendarEvent[];
const EMPTY_FILES = Object.freeze([]) as unknown as FileItem[];
const EMPTY_NOTES = Object.freeze([]) as unknown as ContactNote[];
const EMPTY_TASKS = Object.freeze([]) as unknown as Task[];
const EMPTY_FOLLOWUPS = Object.freeze([]) as unknown as FollowUp[];
const EMPTY_CLIPS = Object.freeze([]) as unknown as Clip[];

export function ContactPanel(props: { contactId: string }) {
  // PERF-3: one batched resource for the whole panel payload.
  // The bundle carries 8 fields; the accessors below re-export
  // each as a SolidJS `Resource`-shaped object so the 30+ call
  // sites in this file don't need to change. The new shape is
  // a 1-roundtrip `Promise.all` instead of 8 staggered ones.
  const [bundle, { refetch: refetchBundle, mutate: setBundleRaw }] = createResource(
    () => props.contactId,
    getContactBundle,
  );
  // The bundle carries all 8 fields; the accessors below are
  // thin call-site-stable wrappers that fall back to a frozen
  // empty array (typed correctly) on pending/error. The empty
  // arrays are module-singletons so Solid's `===` checks
  // short-circuit memo invalidation across re-renders.
  const contact = (): Contact | null => bundle()?.contact ?? null;
  const messages = (): Message[] => bundle()?.messages ?? EMPTY_MESSAGES;
  const events = (): CalendarEvent[] => bundle()?.events ?? EMPTY_EVENTS;
  const files = (): FileItem[] => bundle()?.files ?? EMPTY_FILES;
  const notes = (): ContactNote[] => bundle()?.notes ?? EMPTY_NOTES;
  const tasks = (): Task[] => bundle()?.tasks ?? EMPTY_TASKS;
  const followUps = (): FollowUp[] => bundle()?.followUps ?? EMPTY_FOLLOWUPS;
  const clips = (): Clip[] => bundle()?.clips ?? EMPTY_CLIPS;

  // Per-tab `setNotes` mutate helper — preserves the optimistic
  // semantics the old `mutate` accessor had. Tasks / follow-ups
  // / clips don't have an in-panel mutator today, so a single
  // helper is enough; future per-tab mutators can follow the
  // same pattern.
  const setNotes = (fn: (prev: ContactNote[]) => ContactNote[]) =>
    setBundleRaw((prev) => (prev ? { ...prev, notes: fn(prev.notes) } : prev));

  // Compat aliases — all 8 `refetchX` paths collapse to a
  // single bundle refetch. The 30+ call sites that named a
  // specific refetch now all do the same thing, but we keep
  // the per-name surface so the diff is minimal.
  const refetchContact = refetchBundle;
  const refetchMessages = refetchBundle;
  const refetchEvents = refetchBundle;
  const refetchFiles = refetchBundle;
  const refetchNotes = refetchBundle;
  const refetchTasks = refetchBundle;
  const refetchFU = refetchBundle;
  const refetchClips = refetchBundle;

  const [editing, setEditing] = createSignal(false);
  const [bucketMenuOpen, setBucketMenuOpen] = createSignal(false);
  const [autofileOpen, setAutofileOpen] = createSignal(false);
  const [labels] = createResource(listLabels);
  const [confirmDelete, setConfirmDelete] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);

  /** Delete from the panel: cascade-clean related tasks, close the
   *  edit modal AND the panel so no stale draft can resurrect the
   *  contact. */
  const removeContact = async () => {
    const c = contact();
    if (!c || deleting()) return;
    setDeleting(true);
    try {
      const related = (await listTasks()).filter(
        (t) => t.relatedContactId === c.id,
      );
      for (const t of related) await deleteTask(t.id);
      await deleteContact(c.id);
      setEditing(false);
      setSelectedContactId(null);
      setDetailOpen(false);
      showToast({ message: `已删除 ${c.name || "该联系人"}`, kind: "info" });
    } catch (err) {
      showToast({
        message: "删除失败，请重试",
        kind: "error",
        source: "contacts",
        detail: String(err),
      });
    } finally {
      setDeleting(false);
    }
  };

  useRefreshEffect(() => {
    void refetchBundle();
  });

  const msgs = createMemo(() => messages());
  const evts = createMemo(() => events());
  const fls = createMemo(() => files());
  const tks = createMemo(() => tasks());
  const fus = createMemo(() => followUps());
  const cls = createMemo(() => clips());

  const anyPending = createMemo(() => bundle.state === "pending");
  const anyError = createMemo(() => bundle.state === "errored");
  const retryAll = () => {
    void refetchMessages();
    void refetchEvents();
    void refetchFiles();
    void refetchNotes();
    void refetchTasks();
    void refetchFU();
    void refetchClips();
  };

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        animation: "panel-slide 0.28s var(--ease-out) both",
      }}
    >
      <div
        style={{
          padding: "var(--space-4) var(--space-5)",
          "border-bottom": "0.5px solid var(--border)",
          display: "flex",
          "align-items": "center",
          gap: "var(--space-3)",
          background:
            "color-mix(in srgb, var(--paper-light) 82%, transparent)",
          "backdrop-filter": "blur(20px) saturate(1.4)",
          "-webkit-backdrop-filter": "blur(20px) saturate(1.4)",
          position: "sticky",
          top: 0,
          "z-index": 2,
        }}
      >
        <button
          onClick={() => {
            setSelectedContactId(null);
            setDetailOpen(false);
          }}
          aria-label="返回"
          title="返回"
          style={{ color: "var(--text-muted)", cursor: "pointer" }}
        >
          <Icon name="ph-arrow-left" size={18} />
        </button>
        <strong
          style={{ "font-size": "var(--text-body-sm)", "font-weight": "700" }}
        >
          联系人
        </strong>
        <button
          onClick={() => setEditing(true)}
          style={{
            "margin-left": "auto",
            display: "inline-flex",
            "align-items": "center",
            gap: "4px",
            padding: "6px 12px",
            "min-height": "32px",
            background: "var(--paper-mid)",
            color: "var(--text-secondary)",
            "border-radius": "var(--radius-pill)",
            border: "none",
            "font-size": "var(--text-caption)",
            "font-weight": "700",
            cursor: "pointer",
          }}
        >
          <Icon name="ph-pencil-simple" size={14} />
          编辑
        </button>
        <button
          onClick={() => {
            const c = contact();
            const email = c?.emails[0]?.value ?? "";
            if (!c || !email) return;
            setComposeContext({ mode: "new", to: email });
            setComposeOpen(true);
          }}
          disabled={!contact()?.emails[0]?.value}
          title={
            contact()?.emails[0]?.value ? "写邮件" : "此联系人还没有邮箱地址"
          }
          style={{
            display: "inline-flex",
            "align-items": "center",
            gap: "4px",
            padding: "6px 12px",
            "min-height": "32px",
            background: "var(--palm-soft)",
            color: "var(--palm)",
            "border-radius": "var(--radius-pill)",
            border: "none",
            "font-size": "var(--text-caption)",
            "font-weight": "700",
            cursor: contact()?.emails[0]?.value ? "pointer" : "default",
            opacity: contact()?.emails[0]?.value ? 1 : 0.5,
          }}
        >
          <Icon name="ph-paper-plane-tilt" size={14} />
          写邮件
        </button>
        <button
          onClick={() => setContactTab("Tasks")}
          title="给此联系人添加跟进任务"
          style={{
            display: "inline-flex",
            "align-items": "center",
            gap: "4px",
            padding: "6px 12px",
            "min-height": "32px",
            background: "var(--paper-mid)",
            color: "var(--text-secondary)",
            "border-radius": "var(--radius-pill)",
            border: "none",
            "font-size": "var(--text-caption)",
            "font-weight": "700",
            cursor: "pointer",
          }}
        >
          <Icon name="ph-plus" size={14} />
          跟进
        </button>
      </div>

      <Show when={contact()}>
        {(c) => (
          <div
            style={{
              padding: "var(--space-6) var(--space-5) var(--space-4)",
              "text-align": "center",
              "border-bottom": "0.5px solid var(--border)",
            }}
          >
            <div
              style={{
                display: "flex",
                "justify-content": "center",
                "margin-bottom": "var(--space-3)",
              }}
            >
              <Avatar name={c().name} src={c().avatar} size={72} />
            </div>
            <h2
              style={{
                "font-family": "var(--font-display)",
                "font-size": "var(--text-h4)",
                "font-weight": "800",
                margin: 0,
                "margin-bottom": "2px",
              }}
            >
              {c().name}
            </h2>
            <Show when={c().emails[0]}>
              {(email) => (
                <p
                  style={{
                    "font-size": "var(--text-caption)",
                    color: "var(--text-secondary)",
                    margin: 0,
                  }}
                >
                  {email().value}
                </p>
              )}
            </Show>
            <Show when={c().title || c().company}>
              <p
                style={{
                  "font-size": "var(--text-caption)",
                  color: "var(--text-secondary)",
                  margin: "2px 0 0",
                }}
              >
                {c().title}
                {c().title && c().company ? " · " : ""}
                <Show when={c().company} fallback={c().title ? null : "—"}>
                  <button
                    onClick={() => openCompanyDetail(c().company)}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: "var(--palm)",
                      "font-weight": "600",
                    }}
                  >
                    {c().company}
                  </button>
                </Show>
              </p>
            </Show>
            <div
              style={{
                display: "flex",
                gap: "var(--space-2)",
                "justify-content": "center",
                "margin-top": "var(--space-3)",
                "flex-wrap": "wrap",
              }}
            >
              <Tag color={STAGE_COLOR[c().stage]}>{STAGE_LABEL[c().stage]}</Tag>
              <Tag>{`健康度 ${c().health}`}</Tag>
              <Tag>{c().lc}</Tag>
            </div>
            <div
              style={{
                display: "flex",
                gap: "var(--space-2)",
                "justify-content": "center",
                "margin-top": "var(--space-3)",
              }}
            >
              <button
                onClick={async () => {
                  const next = !c().notify;
                  await upsertContact({ ...c(), notify: next });
                  await refetchContact();
                  showToast({
                    message: next
                      ? `已开启 ${c().name} 的新邮件通知`
                      : `已关闭 ${c().name} 的新邮件通知`,
                    kind: "info",
                  });
                }}
                title={c().notify ? "新邮件通知已开启" : "新邮件通知已关闭"}
                style={{
                  display: "inline-flex",
                  "align-items": "center",
                  gap: "4px",
                  padding: "6px 12px",
                  "min-height": "32px",
                  "border-radius": "var(--radius-pill)",
                  border: "none",
                  cursor: "pointer",
                  "font-size": "var(--text-micro)",
                  "font-weight": "600",
                  background: c().notify
                    ? "var(--palm-soft)"
                    : "var(--paper-mid)",
                  color: c().notify ? "var(--palm)" : "var(--text-muted)",
                }}
              >
                <Icon
                  name={c().notify ? "ph-bell" : "ph-bell-slash"}
                  size={12}
                />
                {c().notify ? "通知已开" : "通知已关"}
              </button>
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setBucketMenuOpen(!bucketMenuOpen())}
                  title={`当前投递到 ${bucketLabel(c().defaultBucket)}，点击更换`}
                  aria-haspopup="menu"
                  aria-expanded={bucketMenuOpen()}
                  style={{
                    display: "inline-flex",
                    "align-items": "center",
                    gap: "4px",
                    padding: "6px 12px",
                    "min-height": "32px",
                    "border-radius": "var(--radius-pill)",
                    border: "none",
                    cursor: "pointer",
                    "font-size": "var(--text-micro)",
                    "font-weight": "600",
                    background: "var(--paper-mid)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <Icon name="ph-tray" size={12} />
                  投递到 {bucketLabel(c().defaultBucket)}
                  <Icon name="ph-caret-down" size={10} />
                </button>
                <Show when={bucketMenuOpen()}>
                  <div
                    role="menu"
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: "50%",
                      transform: "translateX(-50%)",
                      "min-width": "220px",
                      background:
                        "color-mix(in srgb, var(--paper-light) 82%, transparent)",
                      "backdrop-filter": "blur(20px) saturate(1.4)",
                      "-webkit-backdrop-filter": "blur(20px) saturate(1.4)",
                      border: "0.5px solid var(--border)",
                      "border-radius": "var(--radius-lg)",
                      "box-shadow": "var(--shadow-lg)",
                      padding: "var(--space-1)",
                      "z-index": 10,
                    }}
                  >
                    <For each={BUCKET_OPTIONS}>
                      {(opt) => (
                        <button
                          role="menuitem"
                          onClick={async () => {
                            setBucketMenuOpen(false);
                            if (opt.id === c().defaultBucket) return;
                            await upsertContact({
                              ...c(),
                              defaultBucket: opt.id,
                            });
                            await refetchContact();
                            showToast({
                              message: `${c().name} 的邮件将投递到 ${bucketLabel(opt.id)}`,
                              kind: "success",
                            });
                          }}
                          style={{
                            display: "flex",
                            "align-items": "center",
                            width: "100%",
                            "text-align": "left",
                            padding: "8px 12px",
                            "min-height": "36px",
                            background: "transparent",
                            border: "none",
                            "border-radius": "var(--radius-md)",
                            "font-size": "var(--text-caption)",
                            "font-weight":
                              opt.id === c().defaultBucket ? "700" : "500",
                            color:
                              opt.id === c().defaultBucket
                                ? "var(--palm)"
                                : "var(--text-primary)",
                            cursor: "pointer",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "var(--paper-mid)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "transparent")
                          }
                        >
                          {opt.label}
                          <Show when={opt.id === c().defaultBucket}>
                            <Icon
                              name="ph-check"
                              size={12}
                              style={{ "margin-left": "auto" }}
                            />
                          </Show>
                        </button>
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: "var(--space-2)",
                "justify-content": "center",
                "margin-top": "var(--space-2)",
                "flex-wrap": "wrap",
              }}
            >
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setAutofileOpen(!autofileOpen())}
                  title="自动给此发件人的邮件打标签"
                  aria-haspopup="menu"
                  aria-expanded={autofileOpen()}
                  style={{
                    display: "inline-flex",
                    "align-items": "center",
                    gap: "4px",
                    padding: "6px 12px",
                    "min-height": "32px",
                    "border-radius": "var(--radius-pill)",
                    border: "none",
                    cursor: "pointer",
                    "font-size": "var(--text-micro)",
                    "font-weight": "600",
                    background:
                      c().autoLabel.length > 0
                        ? "var(--palm-soft)"
                        : "var(--paper-mid)",
                    color:
                      c().autoLabel.length > 0
                        ? "var(--palm)"
                        : "var(--text-muted)",
                  }}
                >
                  <Icon name="ph-tag" size={12} />
                  {autoLabelNames(c(), labels()) || "自动标签"}
                  <Icon name="ph-caret-down" size={10} />
                </button>
                <Show when={autofileOpen()}>
                  <div
                    role="menu"
                    style={{
                      position: "absolute",
                      top: "calc(100% + 6px)",
                      left: "50%",
                      transform: "translateX(-50%)",
                      "min-width": "200px",
                      background:
                        "color-mix(in srgb, var(--paper-light) 82%, transparent)",
                      "backdrop-filter": "blur(20px) saturate(1.4)",
                      "-webkit-backdrop-filter": "blur(20px) saturate(1.4)",
                      border: "0.5px solid var(--border)",
                      "border-radius": "var(--radius-lg)",
                      "box-shadow": "var(--shadow-lg)",
                      padding: "var(--space-1)",
                      "z-index": 10,
                    }}
                  >
                    <Show
                      when={(labels() ?? []).length > 0}
                      fallback={
                        <p
                          style={{
                            margin: 0,
                            padding: "var(--space-3)",
                            "font-size": "var(--text-caption)",
                            color: "var(--text-muted)",
                          }}
                        >
                          还没有标签，去「设置 → 标签」里创建。
                        </p>
                      }
                    >
                      <For each={labels() ?? []}>
                        {(label) => {
                          const active = () =>
                            c().autoLabel.includes(label.id);
                          return (
                            <button
                              role="menuitemcheckbox"
                              aria-checked={active()}
                              onClick={async () => {
                                const next = active()
                                  ? c().autoLabel.filter(
                                      (id) => id !== label.id,
                                    )
                                  : [...c().autoLabel, label.id];
                                await upsertContact({
                                  ...c(),
                                  autoLabel: next,
                                });
                                await refetchContact();
                                showToast({
                                  message: "自动标签已更新",
                                  kind: "success",
                                });
                              }}
                              style={{
                                display: "flex",
                                "align-items": "center",
                                gap: "var(--space-2)",
                                width: "100%",
                                "text-align": "left",
                                padding: "8px 12px",
                                "min-height": "36px",
                                background: "transparent",
                                border: "none",
                                "border-radius": "var(--radius-md)",
                                "font-size": "var(--text-caption)",
                                color: "var(--text-primary)",
                                cursor: "pointer",
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.background =
                                  "var(--paper-mid)")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.background =
                                  "transparent")
                              }
                            >
                              <span
                                aria-hidden="true"
                                style={{
                                  width: "10px",
                                  height: "10px",
                                  "border-radius": "50%",
                                  background: label.color,
                                }}
                              />
                              {label.name}
                              <Show when={active()}>
                                <Icon
                                  name="ph-check"
                                  size={12}
                                  style={{
                                    "margin-left": "auto",
                                    color: "var(--palm)",
                                  }}
                                />
                              </Show>
                            </button>
                          );
                        }}
                      </For>
                    </Show>
                  </div>
                </Show>
              </div>
              <button
                onClick={async () => {
                  const next = !c().recycling;
                  await upsertContact({ ...c(), recycling: next });
                  await refetchContact();
                  showToast({
                    message: next
                      ? `已开启 ${c().name} 的旧邮件自动清理`
                      : `已关闭 ${c().name} 的旧邮件自动清理`,
                    kind: "info",
                  });
                }}
                title="自动清理此发件人的旧邮件"
                style={{
                  display: "inline-flex",
                  "align-items": "center",
                  gap: "4px",
                  padding: "6px 12px",
                  "min-height": "32px",
                  "border-radius": "var(--radius-pill)",
                  border: "none",
                  cursor: "pointer",
                  "font-size": "var(--text-micro)",
                  "font-weight": "600",
                  background: c().recycling
                    ? "var(--palm-soft)"
                    : "var(--paper-mid)",
                  color: c().recycling ? "var(--palm)" : "var(--text-muted)",
                }}
              >
                <Icon name="ph-arrow-clockwise" size={12} />
                {c().recycling ? "自动清理已开" : "自动清理旧邮件"}
              </button>
              <button
                onClick={() => setContactTab("Notes")}
                title="跳到备注"
                style={{
                  display: "inline-flex",
                  "align-items": "center",
                  gap: "4px",
                  padding: "6px 12px",
                  "min-height": "32px",
                  "border-radius": "var(--radius-pill)",
                  border: "none",
                  cursor: "pointer",
                  "font-size": "var(--text-micro)",
                  "font-weight": "600",
                  background: "var(--paper-mid)",
                  color: "var(--text-muted)",
                }}
              >
                <Icon name="ph-note" size={12} />
                {c().notes ? "查看备注" : "记笔记"}
              </button>
            </div>
            <Show when={c().notes}>
              <p
                style={{
                  "margin-top": "var(--space-4)",
                  "font-size": "var(--text-body-sm)",
                  color: "var(--text-secondary)",
                  "line-height": 1.5,
                  "text-align": "left",
                  background: "var(--paper-mid)",
                  padding: "var(--space-3) var(--space-4)",
                  "border-radius": "var(--radius-md)",
                }}
              >
                {c().notes}
              </p>
            </Show>
            <p
              style={{
                "margin-top": "var(--space-3)",
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
              }}
            >
              {STAGE_SUGGEST[c().stage]}
            </p>
          </div>
        )}
      </Show>

      <div
        style={{
          display: "flex",
          gap: "var(--space-1)",
          padding: "var(--space-2) var(--space-5)",
          "border-bottom": "0.5px solid var(--border)",
          "overflow-x": "auto",
        }}
      >
        <For each={TABS}>
          {(t) => (
            <button
              data-testid={`contact-tab-${t.id.toLowerCase()}`}
              onClick={() => setContactTab(t.id)}
              style={{
                padding: "8px 12px",
                "min-height": "36px",
                "border-radius": "var(--radius-pill)",
                border: "none",
                cursor: "pointer",
                background:
                  contactTab() === t.id ? "var(--palm-soft)" : "transparent",
                color:
                  contactTab() === t.id ? "var(--palm)" : "var(--text-secondary)",
                "font-weight": contactTab() === t.id ? "700" : "500",
                "font-size": "var(--text-caption)",
                "white-space": "nowrap",
              }}
            >
              {t.label}
            </button>
          )}
        </For>
      </div>

      <div
        style={{
          flex: 1,
          "overflow-y": "auto",
          padding: "var(--space-4) var(--space-5)",
        }}
      >
        <Show when={anyPending()}>
          <SkeletonList count={6} />
        </Show>
        <Show when={anyError()}>
          <ErrorState
            title="加载失败"
            message="无法读取联系人数据，请重试。"
            retry={retryAll}
          />
        </Show>
        <Show when={!anyPending() && !anyError()}>
          <Show when={contactTab() === "Timeline"}>
            <TimelineTab
              messages={msgs()}
              followUps={fus()}
              onOpen={(id) => {
                setSelectedContactId(null);
                setSelectedMessageId(id);
              }}
              onFollowUpChange={() => void refetchFU()}
            />
          </Show>
          <Show when={contactTab() === "Notes"}>
            <NotesTab
              notes={notes()}
              contactId={props.contactId}
              onAdd={(n) => setNotes((prev) => [n, ...(prev ?? [])])}
              onRemove={(id) =>
                setNotes((prev) => (prev ?? []).filter((x) => x.id !== id))
              }
              onPinChange={(n) =>
                setNotes((prev) =>
                  (prev ?? []).map((x) => (x.id === n.id ? n : x)),
                )
              }
            />
          </Show>
          <Show when={contactTab() === "Files"}>
            <FilesTab
              files={fls()}
              onOpen={(id) => {
                setSelectedContactId(null);
                setSelectedFileId(id);
              }}
            />
          </Show>
          <Show when={contactTab() === "Insights"}>
            <InsightsTab messages={msgs()} contact={contact() ?? null} />
          </Show>
          <Show when={contactTab() === "Network"}>
            <NetworkTab contactId={props.contactId} />
          </Show>
          <Show when={contactTab() === "Calendar"}>
            <CalendarTab events={evts()} />
          </Show>
          <Show when={contactTab() === "Tasks"}>
            <TasksTab
              tasks={tks()}
              contactId={props.contactId}
              onChange={refetchTasks}
            />
          </Show>
          <Show when={contactTab() === "Follow-ups"}>
            <FollowUpsTab
              followUps={fus()}
              messages={msgs()}
              onChange={refetchFU}
            />
          </Show>
          <Show when={contactTab() === "Clips"}>
            <ClipsTab clips={cls()} onChange={refetchClips} />
          </Show>
        </Show>
      </div>
      <Show when={editing() && contact()}>
        <ContactEditModal
          contact={contact()!}
          isNew={false}
          onClose={() => setEditing(false)}
          onSave={async (c) => {
            await upsertContact(c);
            setEditing(false);
            showToast({ message: "联系人已保存", kind: "success" });
          }}
          onDelete={() => setConfirmDelete(true)}
        />
      </Show>
      <ConfirmDialog
        open={confirmDelete()}
        title={`删除 ${contact()?.name || "该联系人"}？`}
        body="与该联系人相关的任务也会一并删除，此操作无法撤销。"
        confirmLabel={deleting() ? "正在删除…" : "删除"}
        onConfirm={() => void removeContact()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function Tag(props: { color?: string; children: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        background: props.color ? `${props.color}20` : "var(--paper-mid)",
        color: props.color ?? "var(--text-secondary)",
        "border-radius": "var(--radius-pill)",
        "font-size": "var(--text-micro)",
        "font-weight": "600",
      }}
    >
      {props.children}
    </span>
  );
}

/** User-facing label for a follow-up status. Internal values
 *  (todo/wait/done) never reach the UI. */
export function followUpStatusLabel(status: FollowUp["status"]): string {
  switch (status) {
    case "todo":
      return "待跟进";
    case "wait":
      return "等待中";
    case "done":
      return "已完成";
    default:
      return "待跟进";
  }
}

function TimelineTab(props: {
  messages: Message[];
  followUps: FollowUp[];
  onOpen: (id: string) => void;
  onFollowUpChange: () => void;
}) {
  const [filter, setFilter] = createSignal<"all" | "from" | "to">("all");

  const followUpMap = createMemo(() => {
    const map = new Map<string, FollowUp>();
    for (const f of props.followUps) map.set(f.msgId, f);
    return map;
  });

  const filtered = createMemo(() => {
    switch (filter()) {
      case "from":
        return props.messages.filter((m) => m.direction !== "out");
      case "to":
        return props.messages.filter((m) => m.direction === "out");
      default:
        return props.messages;
    }
  });

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          "margin-bottom": "var(--space-3)",
        }}
      >
        <For
          each={
            [
              { id: "all", label: "全部" },
              { id: "from", label: "来自 TA" },
              { id: "to", label: "发给 TA" },
            ] as const
          }
        >
          {(f) => (
            <button
              onClick={() => setFilter(f.id)}
              style={{
                padding: "6px 12px",
                "min-height": "32px",
                "border-radius": "var(--radius-pill)",
                background:
                  filter() === f.id ? "var(--palm-soft)" : "transparent",
                color:
                  filter() === f.id ? "var(--palm)" : "var(--text-secondary)",
                "font-weight": filter() === f.id ? "700" : "500",
                "font-size": "var(--text-micro)",
                border: "none",
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          )}
        </For>
      </div>
      <For each={filtered()}>
        {(m) => (
          <TimelineRow
            message={m}
            followUpMap={followUpMap}
            onOpen={props.onOpen}
            onChange={props.onFollowUpChange}
          />
        )}
      </For>
    </div>
  );
}

function TimelineRow(props: {
  message: Message;
  followUpMap: () => Map<string, FollowUp>;
  onOpen: (id: string) => void;
  onChange: () => void;
}) {
  const fu = createMemo(() => props.followUpMap().get(props.message.id));

  const cycle = async (e: MouseEvent) => {
    e.stopPropagation();
    const existing = fu();
    if (!existing) {
      await upsertFollowUp({
        id: uid("fu"),
        msgId: props.message.id,
        dueAt: isoNow().slice(0, 10),
        status: "todo",
        note: undefined,
        surfacedAt: null,
      });
    } else if (existing.status === "todo") {
      await upsertFollowUp({ ...existing, status: "wait" });
    } else if (existing.status === "wait") {
      await upsertFollowUp({ ...existing, status: "done" });
    } else if (existing.status === "done") {
      await deleteFollowUp(existing.id);
    } else {
      await upsertFollowUp({ ...existing, status: "todo" });
    }
    props.onChange();
  };

  return (
    <div
      onClick={() => props.onOpen(props.message.id)}
      style={{
        display: "flex",
        "align-items": "flex-start",
        gap: "var(--space-3)",
        padding: "var(--space-3) 0",
        "border-bottom": "0.5px solid var(--border)",
        cursor: "pointer",
      }}
    >
      <div style={{ flex: 1, "min-width": 0 }}>
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-2)",
          }}
        >
          <span
            style={{
              "font-size": "var(--text-micro)",
              "font-weight": "700",
              color:
                props.message.direction === "out"
                  ? "var(--palm)"
                  : "var(--text-muted)",
              "text-transform": "uppercase",
              "letter-spacing": "0.02em",
            }}
          >
            {props.message.direction === "out" ? "发给 TA" : "来自 TA"}
          </span>
          <strong
            style={{
              "font-weight": "700",
              "font-size": "var(--text-body-sm)",
            }}
          >
            {props.message.subj}
          </strong>
        </div>
        <p
          style={{
            margin: 0,
            "margin-top": "2px",
            color: "var(--text-secondary)",
            "font-size": "var(--text-caption)",
          }}
        >
          {props.message.prev}
        </p>
        <span
          style={{
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
            "margin-top": "4px",
            display: "block",
          }}
        >
          {props.message.tm}
        </span>
      </div>
      <button
        onClick={(e) => void cycle(e)}
        title={
          fu()
            ? `跟进状态：${followUpStatusLabel(fu()!.status)}`
            : "添加跟进提醒"
        }
        aria-label={
          fu()
            ? `跟进状态：${followUpStatusLabel(fu()!.status)}`
            : "添加跟进提醒"
        }
        style={{
          "margin-top": "2px",
          padding: "4px 10px",
          "min-height": "28px",
          "border-radius": "var(--radius-pill)",
          background: fu() ? "var(--palm-soft)" : "var(--paper-mid)",
          color: fu() ? "var(--palm)" : "var(--text-muted)",
          "font-size": "var(--text-micro)",
          "font-weight": "700",
          border: "none",
          cursor: "pointer",
          "white-space": "nowrap",
        }}
      >
        {fu() ? followUpStatusLabel(fu()!.status) : "+ 跟进"}
      </button>
    </div>
  );
}

function NotesTab(props: {
  notes: ContactNote[];
  contactId: string;
  onAdd: (n: ContactNote) => void;
  onRemove: (id: string) => void;
  onPinChange: (n: ContactNote) => void;
}) {
  const [draft, setDraft] = createSignal("");
  const add = async () => {
    const body = draft().trim();
    if (!body) return;
    const n: ContactNote = {
      id: uid("cn"),
      contactId: props.contactId,
      body,
      pinned: false,
      createdAt: isoNow(),
    };
    await upsertContactNote(n);
    props.onAdd(n);
    setDraft("");
  };

  const sortedNotes = createMemo(() =>
    [...props.notes].sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  );
  return (
    <div>
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          background: "var(--canary)",
          "border-radius": "var(--radius-md)",
          "margin-bottom": "var(--space-4)",
        }}
      >
        <textarea
          value={draft()}
          onInput={(e) => setDraft(e.currentTarget.value)}
          placeholder="记录关于这位联系人的事…"
          rows={3}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "vertical",
            "font-family": "var(--font-body)",
            "font-size": "var(--text-body-sm)",
            color: "var(--text-primary)",
          }}
        />
        <div
          style={{
            display: "flex",
            "justify-content": "flex-end",
            "margin-top": "var(--space-2)",
          }}
        >
          <button
            onClick={add}
            disabled={!draft().trim()}
            style={{
              padding: "6px 16px",
              "min-height": "32px",
              background: "var(--ink)",
              color: "white",
              "border-radius": "var(--radius-pill)",
              border: "none",
              "font-size": "var(--text-caption)",
              "font-weight": "700",
              cursor: "pointer",
              opacity: draft().trim() ? 1 : 0.4,
            }}
          >
            保存
          </button>
        </div>
      </div>
      <For each={sortedNotes()}>
        {(n) => (
          <div
            style={{
              padding: "var(--space-3)",
              background: n.pinned ? "var(--canary)" : "var(--paper-mid)",
              "border-radius": "var(--radius-md)",
              "margin-bottom": "var(--space-2)",
            }}
          >
            <p
              style={{
                margin: 0,
                "font-size": "var(--text-body-sm)",
                "white-space": "pre-wrap",
              }}
            >
              {n.body}
            </p>
            <div
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--space-2)",
                "margin-top": "var(--space-2)",
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
              }}
            >
              <span>{relativeTime(n.createdAt)}</span>
              <Show when={n.pinned}>
                <Icon name="ph-push-pin" size={11} />
              </Show>
              <button
                onClick={async () => {
                  const updated = { ...n, pinned: !n.pinned };
                  await upsertContactNote(updated);
                  props.onPinChange(updated);
                }}
                style={{
                  color: "var(--text-muted)",
                  "margin-left": "auto",
                  padding: "8px",
                  cursor: "pointer",
                }}
                title={n.pinned ? "取消置顶" : "置顶"}
              >
                <Icon
                  name={n.pinned ? "ph-push-pin-slash" : "ph-push-pin"}
                  size={12}
                />
              </button>
              <button
                onClick={async () => {
                  await deleteContactNote(n.id);
                  props.onRemove(n.id);
                }}
                style={{
                  color: "var(--text-muted)",
                  padding: "8px",
                  cursor: "pointer",
                }}
                title="删除这条备注"
                aria-label="删除这条备注"
              >
                <Icon name="ph-trash" size={12} />
              </button>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function FilesTab(props: {
  files: FileItem[];
  onOpen: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        "grid-template-columns": "repeat(auto-fill, minmax(160px, 1fr))",
        gap: "var(--space-3)",
      }}
    >
      <For
        each={props.files}
        fallback={
          <Empty
            icon="ph-files"
            title="暂无附件"
            description="该联系人没有附件。"
          />
        }
      >
        {(f) => (
          <button
            onClick={() => props.onOpen(f.id)}
            style={{
              display: "flex",
              "flex-direction": "column",
              "align-items": "center",
              gap: "var(--space-3)",
              width: "100%",
              padding: "var(--space-3)",
              background: "var(--paper-mid)",
              "border-radius": "var(--radius-md)",
              "text-align": "center",
              cursor: "pointer",
              border: "none",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--paper-dark)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--paper-mid)")
            }
          >
            <Icon name={fileIconName(f.type)} size={40} />
            <div style={{ width: "100%", "min-width": 0 }}>
              <div
                style={{
                  "font-weight": "600",
                  "white-space": "nowrap",
                  overflow: "hidden",
                  "text-overflow": "ellipsis",
                }}
              >
                {f.name}
              </div>
              <div
                style={{
                  "font-size": "var(--text-micro)",
                  color: "var(--text-muted)",
                  "margin-top": "var(--space-1)",
                }}
              >
                {formatBytes(f.size)} · {f.type}
              </div>
            </div>
          </button>
        )}
      </For>
    </div>
  );
}

function InsightsTab(props: {
  messages: Message[];
  contact: Contact | null;
}) {
  const msgCount = () => props.messages.length;
  const last30d = createMemo(() => {
    const cutoff = Date.now() - 30 * 86400_000;
    return props.messages.filter((m) => new Date(m.st).getTime() >= cutoff)
      .length;
  });
  const channels = createMemo(() => {
    const set = new Set<string>();
    const ch = props.contact?.ch;
    if (Array.isArray(ch)) for (const c of ch) set.add(c);
    return [...set];
  });
  const replyStats = createMemo(() => computeReplyTimeStats(props.messages));
  const replyTimeValue = () => {
    const s = replyStats();
    if (s.averageHours == null) return "—";
    return `${s.averageHours}h 平均 / ${s.medianHours}h 中位`;
  };
  const health = () => props.contact?.health ?? null;
  const healthColor = () =>
    props.contact ? STAGE_COLOR[props.contact.stage] : undefined;
  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <Insight label="总消息数" value={String(msgCount())} icon="ph-envelope" />
      <Insight
        label="最近 30 天"
        value={String(last30d())}
        icon="ph-calendar-blank"
      />
      <Insight
        label="沟通渠道"
        value={channels().join(", ") || "—"}
        icon="ph-share-network"
      />
      <Insight
        label="回复周期"
        value={props.contact?.pattern ?? "—"}
        icon="ph-clock"
      />
      <Insight
        label="回复时间"
        value={replyTimeValue()}
        icon="ph-clock-countdown"
      />
      <Show when={health() != null}>
        <div
          style={{
            padding: "var(--space-3)",
            background: healthColor()
              ? `linear-gradient(to right, ${healthColor()} ${health()}%, transparent ${health()}%), var(--paper-mid)`
              : "var(--paper-mid)",
            "border-radius": "var(--radius-md)",
          }}
        >
          <div
            style={{
              display: "flex",
              "align-items": "center",
              gap: "var(--space-2)",
              "margin-bottom": "var(--space-1)",
            }}
          >
            <Icon name="ph-heart" size={14} />
            <span
              style={{
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
                "font-weight": "700",
                "text-transform": "uppercase",
                "letter-spacing": "0.06em",
              }}
            >
              关系健康度
            </span>
          </div>
          <div
            style={{
              "font-size": "var(--text-body-sm)",
              color: "var(--text-primary)",
            }}
          >
            {health()}%
          </div>
        </div>
      </Show>
      <Insight
        label="最近联系"
        value={props.contact?.lc ?? "—"}
        icon="ph-calendar-check"
      />
    </div>
  );
}

function Insight(props: { label: string; value: string; icon: string }) {
  return (
    <div
      style={{
        padding: "var(--space-3)",
        background: "var(--paper-mid)",
        "border-radius": "var(--radius-md)",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
          "margin-bottom": "var(--space-1)",
        }}
      >
        <Icon name={props.icon} size={14} />
        <span
          style={{
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
            "font-weight": "700",
            "text-transform": "uppercase",
            "letter-spacing": "0.06em",
          }}
        >
          {props.label}
        </span>
      </div>
      <div
        style={{
          "font-size": "var(--text-body-sm)",
          color: "var(--text-primary)",
        }}
      >
        {props.value}
      </div>
    </div>
  );
}

function NetworkTab(props: { contactId: string }) {
  // P2/ARCH-3: contacts come from the shared store now. Multiple
  // views subscribing to contactsList share one roundtrip; we
  // don't need a per-component resource here.
  const contacts = contactsList;
  const [allEvents] = createResource(() => listEvents());

  const connections = createMemo(() => {
    const list = contacts();
    const c = list.find((x: { id: string }) => x.id === props.contactId);
    if (!c) return [];
    return list.filter(
      (x: { id: string; company: string }) =>
        x.id !== props.contactId && x.company === c.company && c.company,
    );
  });

  const sharedMeetings = createMemo(() => {
    return (allEvents() ?? []).filter(
      (e) => e.pids.includes(props.contactId) && e.pids.length > 1,
    );
  });

  return (
    <div>
      <h4
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-h4)",
          "font-weight": "800",
          margin: "0 0 var(--space-2)",
        }}
      >
        同公司
      </h4>
      <For
        each={connections()}
        fallback={
          <p
            style={{
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            暂无
          </p>
        }
      >
        {(c) => (
          <div
            style={{
              padding: "var(--space-2) 0",
              "border-bottom": "0.5px solid var(--border)",
            }}
          >
            <strong>{c.name}</strong>
            <div
              style={{
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
              }}
            >
              {c.title}
            </div>
          </div>
        )}
      </For>

      <h4
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-h4)",
          "font-weight": "800",
          margin: "var(--space-5) 0 var(--space-2)",
        }}
      >
        共同会议
      </h4>
      <For
        each={sharedMeetings()}
        fallback={
          <p
            style={{
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            暂无
          </p>
        }
      >
        {(e) => (
          <div
            style={{
              padding: "var(--space-2) 0",
              "border-bottom": "0.5px solid var(--border)",
            }}
          >
            <strong>{e.title}</strong>
            <div
              style={{
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
              }}
            >
              {new Date(e.dt).toLocaleDateString()} · {e.pids.length} 位参会人
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function CalendarTab(props: {
  events: CalendarEvent[];
}) {
  return (
    <div>
      <For
        each={props.events}
        fallback={
          <p
            style={{
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            暂无会议
          </p>
        }
      >
        {(e) => (
          <div
            style={{
              padding: "var(--space-3)",
              "border-left": `3px solid ${e.color}`,
              background: "var(--paper-mid)",
              "border-radius": "var(--radius-md)",
              "margin-bottom": "var(--space-2)",
            }}
          >
            <strong style={{ "font-size": "var(--text-body-sm)" }}>
              {e.title}
            </strong>
            <div
              style={{
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
              }}
            >
              {new Date(e.dt).toLocaleDateString()} · {e.tm}
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function TasksTab(props: {
  tasks: Task[];
  contactId: string;
  onChange: () => void;
}) {
  const [title, setTitle] = createSignal("");

  const add = async () => {
    const t = title().trim();
    if (!t) return;
    await upsertTask({
      id: uid("tk"),
      title: t,
      status: "todo",
      priority: "normal",
      relatedContactId: props.contactId,
      notes: "",
      createdAt: isoNow(),
    });
    setTitle("");
    props.onChange();
  };

  const toggle = async (task: Task) => {
    await upsertTask({
      ...task,
      status: task.status === "done" ? "todo" : "done",
    });
    props.onChange();
  };

  const remove = async (id: string) => {
    await deleteTask(id);
    props.onChange();
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          "margin-bottom": "var(--space-3)",
        }}
      >
        <input
          value={title()}
          onInput={(e) => setTitle(e.currentTarget.value)}
          placeholder="添加任务…"
          style={{
            flex: 1,
            padding: "8px 12px",
            "border-radius": "var(--radius-md)",
            border: "0.5px solid var(--border)",
            "font-size": "var(--text-body-sm)",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
        />
        <button
          onClick={() => void add()}
          style={{
            padding: "8px 14px",
            background: "var(--palm)",
            color: "white",
            "border-radius": "var(--radius-pill)",
            "font-weight": "700",
            "font-size": "var(--text-caption)",
          }}
        >
          添加
        </button>
      </div>
      <For
        each={props.tasks}
        fallback={
          <p
            style={{
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            暂无任务
          </p>
        }
      >
        {(t) => (
          <div
            style={{
              display: "flex",
              "align-items": "center",
              gap: "var(--space-2)",
              padding: "var(--space-2) 0",
              "border-bottom": "0.5px solid var(--border)",
            }}
          >
            <input
              type="checkbox"
              checked={t.status === "done"}
              onChange={() => void toggle(t)}
              style={{ "accent-color": "var(--palm)" }}
            />
            <span
              style={{
                flex: 1,
                "font-size": "var(--text-body-sm)",
                "text-decoration":
                  t.status === "done" ? "line-through" : "none",
                color:
                  t.status === "done"
                    ? "var(--text-muted)"
                    : "var(--text-primary)",
              }}
            >
              {t.title}
            </span>
            <button
              onClick={() => void remove(t.id)}
              style={{ color: "var(--text-muted)" }}
              aria-label="删除"
            >
              <Icon name="ph-trash" size={14} />
            </button>
          </div>
        )}
      </For>
    </div>
  );
}

function FollowUpsTab(props: {
  followUps: FollowUp[];
  messages: Message[];
  onChange: () => void;
}) {
  const msgMap = createMemo(() => {
    const map = new Map<string, Message>();
    for (const m of props.messages) map.set(m.id, m);
    return map;
  });

  const markDone = async (f: FollowUp) => {
    await upsertFollowUp({ ...f, status: "done" });
    props.onChange();
  };

  const remove = async (id: string) => {
    await deleteFollowUp(id);
    props.onChange();
  };

  return (
    <div>
      <For
        each={props.followUps}
        fallback={
          <p
            style={{
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            暂无跟进
          </p>
        }
      >
        {(f) => {
          const m = msgMap().get(f.msgId);
          return (
            <div
              style={{
                padding: "var(--space-3) 0",
                "border-bottom": "0.5px solid var(--border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--space-2)",
                }}
              >
                <span
                  style={{
                    "font-size": "var(--text-micro)",
                    "font-weight": "700",
                    color:
                      f.status === "done"
                        ? "var(--text-muted)"
                        : new Date(f.dueAt) <= new Date()
                          ? "var(--status-danger)"
                          : "var(--palm)",
                  }}
                >
                  {f.status === "done" ? "已完成" : relativeTime(f.dueAt)}
                </span>
                {f.note && (
                  <span
                    style={{
                      "font-size": "var(--text-micro)",
                      color: "var(--text-muted)",
                    }}
                  >
                    · {f.note}
                  </span>
                )}
              </div>
              <div
                style={{
                  "font-size": "var(--text-body-sm)",
                  "font-weight": "600",
                  "margin-top": "2px",
                }}
              >
                {m?.subj || "(无主题)"}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-2)",
                  "margin-top": "var(--space-2)",
                }}
              >
                <Show when={f.status !== "done"}>
                  <button
                    onClick={() => void markDone(f)}
                    style={{
                      "font-size": "var(--text-micro)",
                      color: "var(--palm)",
                      "font-weight": "700",
                    }}
                  >
                    标记完成
                  </button>
                </Show>
                <button
                  onClick={() => void remove(f.id)}
                  style={{
                    "font-size": "var(--text-micro)",
                    color: "var(--text-muted)",
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
}

function ClipsTab(props: { clips: Clip[]; onChange: () => void }) {
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    showToast({ message: "已复制", kind: "success" });
  };

  const remove = async (id: string) => {
    await deleteClip(id);
    props.onChange();
  };

  return (
    <div>
      <For
        each={props.clips}
        fallback={
          <p
            style={{
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            暂无剪藏
          </p>
        }
      >
        {(c) => (
          <div
            style={{
              padding: "var(--space-3) 0",
              "border-bottom": "0.5px solid var(--border)",
            }}
          >
            <p
              style={{
                margin: 0,
                "font-size": "var(--text-body-sm)",
                color: "var(--text-secondary)",
                "line-height": 1.5,
              }}
            >
              “{c.text}”
            </p>
            <div
              style={{
                display: "flex",
                gap: "var(--space-2)",
                "margin-top": "var(--space-2)",
              }}
            >
              <button
                onClick={() => void copy(c.text)}
                style={{
                  "font-size": "var(--text-micro)",
                  color: "var(--palm)",
                  "font-weight": "700",
                }}
              >
                复制
              </button>
              <button
                onClick={() => void remove(c.id)}
                style={{
                  "font-size": "var(--text-micro)",
                  color: "var(--text-muted)",
                }}
              >
                删除
              </button>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
