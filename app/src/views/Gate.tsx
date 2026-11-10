/** Gate view — Tinder-style swipe cards for first-time senders.
 * Per prototype-v11 §3.1: every first-time sender lands here.
 * User approves (choose destination: imbox/feed/paperTrail) or blocks (screened=false, blocked=true).
 */

import {
  For,
  Show,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
  onMount,
  type JSX,
} from "solid-js";
import { t } from "../i18n";
import { extractTasksForMessage } from "../services/task-extraction";
import {
  getMessage,
  listContacts,
  listGateQueue,
  upsertContact,
  updateMessagesBucketByContact,
  markAllReadByContact,
} from "../stores/data";
import { openUrl } from "@tauri-apps/plugin-opener";
import { EmailBody } from "../components/EmailBody";
import { suggestBucket, BUCKET_SUGGEST_LABEL } from "../utils/suggest";
import { agentChat } from "../services/backend";
import { loadLlmKey } from "../services/llm-config";
import { appSettings, setAppSettings } from "../stores/ui";

import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { Empty, ErrorState } from "../components/Empty";
import { Skeleton } from "../components/Skeleton";
import type { Contact, Message, MessageBucket } from "../types";
import { showToast, setView } from "../stores/ui";
import { useRefreshEffect, useSoftRefreshEffect, useViewport } from "../utils/gestures";
import { SwipeActions } from "../components/SwipeActions";
import { PageHeader } from "../components/PageHeader";
import { VIEW_LABEL, bucketLabel as bucketName } from "../utils/labels";
import { senderRule } from "../utils/mail-rule";
import { safeInvoke } from "../services/backend";

const BUCKETS: {
  id: MessageBucket;
  label: string;
  icon: string;
  hint: string;
}[] = [
  { id: "imbox", label: "收件箱", icon: "ph-tray", hint: "重要邮件" },
  { id: "feed", label: "报刊", icon: "ph-newspaper", hint: "资讯与 newsletter" },
  { id: "paperTrail", label: "单据", icon: "ph-receipt", hint: "收据与账单" },
];

export function Gate() {
  const [queueItems, { refetch: refetchQueue }] = createResource(listGateQueue);

  const handleBodyClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const a = target?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!a) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    openUrl(a.href).catch(() => {});
  };

  // Keyboard is the third channel for the same two decisions (mouse buttons,
  // swipe, ← / →). The prototype's card is unusable without it on a laptop.
  const onGateKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || e.metaKey || e.ctrlKey || e.altKey)
      return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      void block();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      void approve(suggestedBucket());
    }
  };
  onMount(() => window.addEventListener("keydown", onGateKey));
  onCleanup(() => window.removeEventListener("keydown", onGateKey));

  let initialHardRefresh = true;
  useRefreshEffect(() => {
    if (initialHardRefresh) {
      initialHardRefresh = false;
      return;
    }
    void refetchQueue();
  });
  let initialSoftRefresh = true;
  useSoftRefreshEffect(() => {
    if (initialSoftRefresh) {
      initialSoftRefresh = false;
      return;
    }
    void refetchQueue();
  });

  const queue = createMemo<{ contact: Contact; message: Message }[]>(
    () => queueItems() ?? [],
  );

  // Locally-decided contacts (approved/blocked). The card advances the
  // INSTANT the user decides — the DB writes and the next card are not on
  // the critical path. The previous "await writes + refetch the whole
  // queue" made every decision feel laggy with hundreds of candidates.
  const [decidedIds, setDecidedIds] = createSignal<Set<string>>(new Set());
  const visibleQueue = createMemo(() =>
    queue().filter((q) => !decidedIds().has(q.contact.id)),
  );

  const [cursor, setCursor] = createSignal(0);
  const [busy, setBusy] = createSignal(false);
  /** Sticky screener decision: also write a mail rule for new mail. */
  const [remember, setRemember] = createSignal(false);
  const current = (): { contact: Contact; message: Message } | undefined =>
    visibleQueue()[cursor()];

  /** What a right-swipe files this sender into.
   *
   *  The prototype's Screener asks one question at a time; the bucket is the
   *  suggestion the card already shows in its own text, so the swipe and the
   *  highlighted button always agree. */
  const suggestedBucket = (): MessageBucket => {
    const m = current()?.message;
    return m ? suggestBucket(m).bucket : "imbox";
  };

  /** One short label per bucket for the swipe affordance. The shared
   *  BUCKET_SUGGEST_LABEL carries the longer "建议" wording for the buttons. */
  const SUGGEST_LABEL: Record<MessageBucket, string> = {
    imbox: "收件箱",
    feed: "报刊",
    paperTrail: "单据",
    trash: "回收站",
    spam: "垃圾邮件",
  };

  // The queue query deliberately does not carry body_html (325 contacts ×
  // an 80 KB body each would be tens of MB across the bridge), so the full
  // row is fetched for the ONE card on screen.
  const [currentFull] = createResource(
    () => current()?.message?.id,
    async (id) => (id ? await getMessage(id) : null),
  );


  /** Optimistically hide the card and clamp the cursor. */
  const advance = (contactId: string) => {
    setDecidedIds((prev) => {
      const next = new Set(prev);
      next.add(contactId);
      return next;
    });
    setCursor((c) => Math.max(0, Math.min(c, visibleQueue().length - 2)));
  };

  const restore = (contactId: string) => {
    setDecidedIds((prev) => {
      const next = new Set(prev);
      next.delete(contactId);
      return next;
    });
  };

  /** "以后这个发件人都这样" — writes a mail_rule for NEW mail from this
   *  sender so the next message does not land back in the screener. */
  const createSenderRule = async (contact: Contact, bucket: string) => {
    const email = contact.emails[0]?.value ?? "";
    const rule = senderRule(email, bucket, 1);
    if (!rule) return;
    try {
      // The command returns the rule id, so a swallowed IPC failure cannot be
      // reported as success (safeInvoke returns null for both).
      const saved = await safeInvoke<string>("upsert_mail_rule", { rule });
      if (!saved) {
        showToast({
          message: "规则没有保存，下次这个发件人还会出现在筛选台",
          kind: "warning",
        });
        return;
      }
      showToast({
        message: `以后 ${contact.name} 的邮件直接进${
          bucket === "spam" ? "垃圾邮件" : bucketName(bucket)
        }`,
        kind: "success",
      });
    } catch {
      showToast({ message: "规则保存失败，下次还会出现在筛选台", kind: "warning" });
    }
  };

  const approve = async (bucket: MessageBucket) => {
    const cur = current();
    if (!cur || busy()) return;
    setBusy(true);
    advance(cur.contact.id);
    try {
      const prevBucket = cur.contact.defaultBucket;
      const updatedContact: Contact = {
        ...cur.contact,
        firstSeen: false,
        screened: true,
        defaultBucket: bucket,
      };
      await upsertContact(updatedContact);
      await updateMessagesBucketByContact(cur.contact.id, bucket);
      if (remember()) await createSenderRule(cur.contact, bucket);
      if (bucket === "imbox" && cur.message) void extractTasksForMessage(cur.message.id, "automatic").catch(() => {});
      // Undo matters more here than anywhere else: a swipe is a reflex, and a
      // decision the user cannot take back makes them slow down and stop
      // trusting the gesture.
      showToast({
        message: `已批准 → ${bucket === "imbox" ? "Inbox" : bucket === "feed" ? "Stream" : "Records"}`,
        kind: "success",
        action: prevBucket === undefined
          ? undefined
          : {
              label: "撤销",
              run: async () => {
                await upsertContact({
                  ...cur.contact,
                  firstSeen: true,
                  screened: false,
                  defaultBucket: prevBucket,
                });
                await updateMessagesBucketByContact(cur.contact.id, "imbox");
                restore(cur.contact.id);
                await refetchQueue();
              },
            },
      });
    } catch (err) {
      restore(cur.contact.id);
      showToast({
        message: "操作失败，请重试",
        kind: "error",
        source: "gate",
        detail: String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const block = async () => {
    const cur = current();
    if (!cur || busy()) return;
    setBusy(true);
    advance(cur.contact.id);
    try {
      const updatedContact: Contact = {
        ...cur.contact,
        firstSeen: false,
        screened: true,
        blocked: true,
      };
      await upsertContact(updatedContact);
      await updateMessagesBucketByContact(cur.contact.id, "spam");
      if (remember()) await createSenderRule(cur.contact, "spam");
      showToast({
        message: `已屏蔽 ${cur.contact.name}`,
        kind: "info",
        action: {
          label: "撤销",
          run: async () => {
            await upsertContact({
              ...cur.contact,
              firstSeen: true,
              screened: false,
              blocked: false,
            });
            restore(cur.contact.id);
            await refetchQueue();
          },
        },
      });
    } catch (err) {
      restore(cur.contact.id);
      showToast({
        message: "操作失败，请重试",
        kind: "error",
        source: "gate",
        detail: String(err),
      });
    } finally {
      setBusy(false);
    }
  };

  /** AI 分类建议：一次调用给当前选中发件人逐一出建议（数据只去用户
   *  配置的提供商）。结果以徽标呈现，确认后才生效。 */
  const [aiSuggestions, setAiSuggestions] = createSignal<
    Record<string, "imbox" | "feed" | "paperTrail">
  >({});
  const [aiBusy, setAiBusy] = createSignal(false);

  const aiSuggest = async () => {
    if (aiBusy()) return;
    const llm = appSettings.agent.llm;
    if (!llm.model) {
      showToast({ message: "先在 设置 → 模型服务 配置模型", kind: "info" });
      return;
    }
    setAiBusy(true);
    try {
      const key = await loadLlmKey("custom").catch(() => null);
      const candidates = visibleQueue().slice(0, 30).map((q) => ({
        id: q.contact.id,
        from: q.contact.emails[0]?.value ?? q.contact.name,
        subj: q.message.subj,
        snippet: (q.message.prev || q.message.body || "").slice(0, 300),
      }));
      const resp = await agentChat(
        {
          base_url: llm.baseUrl || "https://api.openai.com/v1",
          api_key: key ?? "",
          model: llm.model,
          temperature: 0,
          max_tokens: 1024,
        },
        [
          {
            role: "system",
            content:
              "你是邮件分类器。为每个发件人选择 imbox(重要私人邮件)、feed(订阅/newsletter/推广)、paperTrail(收据/账单/验证码/系统通知)之一。只输出 JSON 对象，键为发件人 id，值为桶 id。",
          },
          {
            role: "user",
            content: JSON.stringify(candidates),
          },
        ],
      );
      const text = resp?.content ?? "";
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        showToast({ message: "模型没有返回有效建议", kind: "error" });
        return;
      }
      const parsed = JSON.parse(match[0]) as Record<string, string>;
      const clean: Record<string, "imbox" | "feed" | "paperTrail"> = {};
      for (const [id, bucket] of Object.entries(parsed)) {
        if (bucket === "imbox" || bucket === "feed" || bucket === "paperTrail") {
          clean[id] = bucket;
        }
      }
      setAiSuggestions(clean);
      showToast({
        message: `AI 给了 ${Object.keys(clean).length} 条建议——点「按 AI 建议应用」确认`,
        kind: "info",
        ttlMs: 6000,
      });
    } catch (e) {
      showToast({
        message: "AI 建议生成失败——请检查模型配置后重试",
        kind: "error",
        source: "gate-ai",
        detail: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setAiBusy(false);
    }
  };

  /** Persist "以后都这样" for a batch of sender→bucket decisions. */
  const rememberSenders = async (
    list: { id: string; contact: Contact | undefined; bucket: string }[],
  ) => {
    let saved = 0;
    for (const item of list) {
      if (!item.contact) continue;
      const email = item.contact.emails[0]?.value ?? "";
      const rule = senderRule(email, item.bucket, 1);
      if (!rule) continue;
      const id = await safeInvoke<string>("upsert_mail_rule", { rule });
      if (id) saved += 1;
    }
    showToast({
      message:
        saved > 0
          ? `已记住 ${saved} 位发件人，以后他们的邮件直接归档`
          : "规则没有保存，下次还会出现在筛选台",
      kind: saved > 0 ? "success" : "warning",
    });
  };

  const applyAiSuggestions = async () => {
    const sug = aiSuggestions();
    const ids = Object.keys(sug);
    if (ids.length === 0 || bulkBusy()) return;
    setBulkBusy(true);
    let ok = 0;
    try {
      for (const id of ids) {
        const item = visibleQueue().find((q) => q.contact.id === id);
        if (!item) continue;
        await upsertContact({
          ...item.contact,
          firstSeen: false,
          screened: true,
          defaultBucket: sug[id]!,
        });
        await updateMessagesBucketByContact(id, sug[id]!);
        ok += 1;
      }
      // The confirmation is the moment to make the decision stick: without
      // this, next week's mail from the same senders lands back here.
      const remembered = ids
        .map((id) => ({
          id,
          contact: visibleQueue().find((q) => q.contact.id === id)?.contact,
          bucket: sug[id]!,
        }))
        .filter((x) => x.contact);
      showToast({
        message: `已按 AI 建议整理 ${ok} 位发件人`,
        kind: "success",
        ttlMs: 12_000,
        action: remembered.length
          ? {
              label: "以后都这样",
              run: () => void rememberSenders(remembered),
            }
          : undefined,
      });
      setAiSuggestions({});
      await refetchQueue();
    } finally {
      setBulkBusy(false);
    }
  };

  const [batchMode, setBatchMode] = createSignal(false);
  const [selected, setSelected] = createSignal<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = createSignal(false);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () =>
    setSelected(new Set<string>(visibleQueue().map((q) => q.contact.id)));
  const clearSelection = () => setSelected(new Set<string>());

  /** Bulk-apply a decision to every selected sender. Sequential writes keep
   *  the DB happy; progress surfaces via the toast. */
  const bulkApply = async (
    kind: "imbox" | "feed" | "paperTrail" | "block" | "read",
  ) => {
    const ids = [...selected()];
    if (ids.length === 0 || bulkBusy()) return;
    setBulkBusy(true);
    let ok = 0;
    try {
      for (const id of ids) {
        const item = visibleQueue().find((q) => q.contact.id === id);
        if (!item) continue;
        if (kind === "read") {
          await markAllReadByContact(id);
        } else if (kind === "block") {
          await upsertContact({
            ...item.contact,
            firstSeen: false,
            screened: true,
            blocked: true,
          });
          await updateMessagesBucketByContact(id, "spam");
        } else {
          await upsertContact({
            ...item.contact,
            firstSeen: false,
            screened: true,
            defaultBucket: kind,
          });
          await updateMessagesBucketByContact(id, kind);
          if (kind === "imbox" && item.message) {
            void extractTasksForMessage(item.message.id, "automatic").catch(() => {});
          }
        }
        ok += 1;
      }
      showToast({
        message:
          kind === "read"
            ? `已把 ${ok} 位发件人的邮件标为已读`
            : kind === "block"
              ? `已屏蔽 ${ok} 位发件人`
              : `已批准 ${ok} 位发件人`,
        kind: "success",
      });
      clearSelection();
      await refetchQueue();
    } catch (err) {
      showToast({ message: "批量操作失败，请重试", kind: "error", detail: String(err) });
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div
      style={{
        // 720px: wide enough that the message reads as a message, narrow
        // enough that the eye goes to one card. 560px wrapped the H1 onto
        // three lines and left the buttons below the fold.
        "max-width": "720px",
        margin: "0 auto",
        padding: "var(--space-5)",
        animation: "view-enter 0.3s var(--ease-out) both",
      }}
    >
        <Show
          when={!queueItems.error}
          fallback={
            <ErrorState
              title="筛选台加载失败"
              message="请检查网络后重试。"
              retry={() => void refetchQueue()}
            />
          }
        >
      <PageHeader
        title={VIEW_LABEL.screener}
        description={
          <span
            style={{
              display: "inline-flex",
              "align-items": "center",
              "flex-wrap": "wrap",
              gap: "var(--space-2)",
            }}
          >
            <Icon name="ph-shield-check" size={14} />
            {visibleQueue().length} 位待审 ·{" "}
            {t("gate.intro.body", "第一次给你写信的人会先停在这里。右滑放进，左滑拦下。")}
          </span>
        }
        actions={
          <>
          <button
            data-batch-toggle
            onClick={() => {
              setBatchMode(!batchMode());
              clearSelection();
            }}
            style={{
              padding: "6px 14px",
              background: batchMode() ? "var(--palm-soft)" : "transparent",
              border: "none",
              color: batchMode() ? "var(--palm)" : "var(--palm)",
              "font-weight": "700",
              "font-size": "var(--text-caption)",
              cursor: "pointer",
              display: "inline-flex",
              "align-items": "center",
              gap: "4px",
              "border-radius": "var(--radius-pill)",
            }}
          >
            <Icon name="ph-list-checks" size={14} />
            批量整理
          </button>
          <button
            onClick={() => setView("screenerHistory")}
            style={{
              padding: "6px 14px",
              background: "transparent",
              border: "none",
              color: "var(--palm)",
              "font-weight": "700",
              "font-size": "var(--text-caption)",
              cursor: "pointer",
              display: "inline-flex",
              "align-items": "center",
              gap: "4px",
            }}
          >
            <Icon name="ph-clock-counter-clockwise" size={14} />
            查看筛选历史
          </button>
          </>
        }
      />

      <Show when={queueItems() !== undefined} fallback={<GateSkeleton />}>
      <Show when={!appSettings.preferences.gateGuideSeen && visibleQueue().length > 0}>
        <div
          data-gate-guide
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-3)",
            margin: "0 0 var(--space-3)",
            padding: "10px 14px",
            "border-radius": "var(--radius-md)",
            background: "var(--palm-soft)",
            color: "var(--text-primary)",
            "font-size": "var(--text-body-sm)",
            "line-height": 1.6,
          }}
        >
          <Icon name="ph-shield-check" size={18} />
          <span style={{ flex: 1 }}>
            <b>筛选台怎么用：</b>下面的都是第一次给你写信的发件人。对每个人决定一次：
            <b>批准到收件箱</b>（重要的人）、<b>报刊</b>（订阅和 newsletter）、
            <b>单据</b>（收据账单），或<b>阻止</b>。以后他们的邮件会自动归位。
            人多时点右上角「批量整理」一次性处理。
          </span>
          <button
            type="button"
            aria-label="知道了"
            onClick={() =>
              setAppSettings("preferences", "gateGuideSeen", true)
            }
            style={{
              "flex-shrink": 0,
              padding: "4px 12px",
              "border-radius": "var(--radius-pill)",
              border: "none",
              background: "var(--palm)",
              color: "#fff",
              "font-size": "var(--text-caption)",
              "font-weight": 700,
              cursor: "pointer",
            }}
          >
            知道了
          </button>
        </div>
      </Show>
      <Show
        when={!batchMode()}
        fallback={
          <BatchPanel
            items={visibleQueue()}
            selected={selected()}
            busy={bulkBusy()}
            aiBusy={aiBusy()}
            aiCount={Object.keys(aiSuggestions()).length}
            onAiSuggest={() => void aiSuggest()}
            onAiApply={() => void applyAiSuggestions()}
            onToggle={toggleSelect}
            onSelectAll={selectAll}
            onClear={clearSelection}
            onApply={(kind) => void bulkApply(kind)}
          />
        }
      >
      <Show when={current()} fallback={<DoneState />}>
        {(pair) => {
          const c = () => pair().contact;
          const m = () => pair().message;
          return (
            <>
            <SwipeActions
              style={{ "border-radius": "var(--radius-xl)" }}
              // Swipe works with a mouse too: the prototype's card is the
              // whole point of the Screener, and gating the gesture to touch
              // left desktop users with four buttons in a row and no motion.
              leftAction={{
                label: "屏蔽",
                icon: "ph-prohibit",
                color: "red",
                onClick: () => void block(),
              }}
              rightAction={{
                label: `放进 ${SUGGEST_LABEL[suggestedBucket()]}`,
                icon: "ph-check",
                color: "green",
                onClick: () => void approve(suggestedBucket()),
              }}
              threshold={90}
              maxDrag={220}
            >
              {/* Gesture legend — the prototype puts the two directions in
                  words right above the card so the card does not have to
                  teach by accident. */}
              <div
                data-gate-legend
                style={{
                  display: "flex",
                  "align-items": "center",
                  "justify-content": "space-between",
                  "font-size": "var(--text-micro)",
                  color: "var(--text-muted)",
                  "font-weight": "600",
                  "margin-bottom": "var(--space-2)",
                  padding: "0 var(--space-1)",
                }}
              >
                <span>← 左滑拦下</span>
                <span>
                  右滑放进 <strong style={{ color: "var(--palm)" }}>{SUGGEST_LABEL[suggestedBucket()]}</strong>
                </span>
              </div>
              <div
                data-gate-card={c().name}
                style={{
                  background:
                    "color-mix(in srgb, var(--paper-light) 82%, transparent)",
                  "backdrop-filter": "blur(20px) saturate(1.4)",
                  "-webkit-backdrop-filter": "blur(20px) saturate(1.4)",
                  border: "0.5px solid var(--border)",
                  "border-radius": "var(--radius-xl)",
                  padding: "var(--space-6)",
                  "box-shadow": "var(--shadow-md)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: "var(--space-4)",
                    "align-items": "center",
                    "margin-bottom": "var(--space-4)",
                  }}
                >
                  <Avatar name={c().name || "?"} src={c().avatar} size={56} />
                  <div style={{ flex: 1, "min-width": 0 }}>
                    <h3
                      style={{
                        "font-family": "var(--font-display)",
                        "font-size": "var(--text-h4)",
                        "font-weight": "800",
                        margin: 0,
                      }}
                    >
                      {c().name || "未知发件人"}
                    </h3>
                    <p
                      style={{
                        margin: 0,
                        "font-size": "var(--text-caption)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {c().emails[0]?.value ?? "（还没有邮箱地址）"}
                    </p>
                    <Show when={c().company || c().title}>
                      <p
                        style={{
                          margin: 0,
                          "margin-top": "2px",
                          "font-size": "var(--text-micro)",
                          color: "var(--text-muted)",
                        }}
                      >
                        {[c().title, c().company].filter(Boolean).join(" · ")}
                      </p>
                    </Show>
                  </div>
                </div>

                <div
                  style={{
                    padding: "var(--space-4)",
                    background: "var(--paper-light)",
                    border: "0.5px solid var(--border)",
                    "border-radius": "var(--radius-md)",
                    "margin-bottom": "var(--space-4)",
                  }}
                >
                  <strong
                    style={{
                      "font-size": "var(--text-body-sm)",
                      "font-weight": "700",
                    }}
                  >
                    {m().subj}
                  </strong>
                  {/* The same renderer every other surface uses. A Screener
                      card that shows tag soup instead of the message is how a
                      user decides blind. Expanded bodies scroll inside the
                      card; the decision buttons stay in reach. */}
                  <div
                    onClick={handleBodyClick}
                    style={{
                      "margin-top": "var(--space-2)",
                      // Keep the three bucket buttons on the first screen:
                      // a decision the user has to scroll to reach is not a
                      // decision they will make.
                      "max-height": "220px",
                      "overflow-y": "auto",
                    }}
                  >
                    <EmailBody
                      message={currentFull() ?? m()}
                      minHeight={120}
                      showImagesBar={false}
                      style={{ "font-size": "var(--text-body-sm)" }}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    "flex-wrap": "wrap",
                    gap: "var(--space-2)",
                    "margin-bottom": "var(--space-4)",
                  }}
                >
                  <label
                    data-gate-remember
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "6px",
                      "margin-bottom": "6px",
                      "font-size": "var(--text-caption)",
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={remember()}
                      onChange={(e) => setRemember(e.currentTarget.checked)}
                      style={{ width: "14px", height: "14px" }}
                    />
                    以后这个发件人的邮件都这样处理
                  </label>
                  <For each={BUCKETS}>
                    {(b) => (
                      <button
                        data-suggested={(() => {
                          const sug = suggestBucket(m());
                          return sug.bucket === b.id && b.id !== "imbox"
                            ? "true"
                            : undefined;
                        })()}
                        title={(() => {
                          const sug = suggestBucket(m());
                          return sug.bucket === b.id
                            ? `建议：${BUCKET_SUGGEST_LABEL[b.id]}（${sug.reasons.join("、")}）`
                            : b.hint;
                        })()}
                        onClick={() => approve(b.id)}
                        disabled={busy()}
                        data-testid={`gate-approve-${b.id}`}
                        style={{
                          flex: 1,
                          display: "flex",
                          "flex-direction": "column",
                          "align-items": "center",
                          gap: "4px",
                          padding: "var(--space-3)",
                          background: "var(--paper-light)",
                          "border-radius": "var(--radius-md)",
                          border: "1px solid var(--border)",
                          "font-size": "var(--text-caption)",
                          "font-weight": "600",
                          color: "var(--text-primary)",
                          cursor: busy() ? "default" : "pointer",
                          opacity: busy() ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "var(--mint)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background =
                            "var(--paper-light)")
                        }
                      >
                        <Icon name={b.icon} size={20} />
                        {b.label}
                        <span
                          style={{
                            "font-size": "var(--text-micro)",
                            "font-weight": "500",
                            color: "var(--text-muted)",
                          }}
                        >
                          {b.hint}
                        </span>
                      </button>
                    )}
                  </For>
                </div>

                <button
                  onClick={block}
                  disabled={busy()}
                  style={{
                    width: "100%",
                    padding: "var(--space-3)",
                    background: "transparent",
                    "border-radius": "var(--radius-md)",
                    border: "1.5px solid var(--status-danger)",
                    color: "var(--status-danger)",
                    "font-weight": "700",
                    "font-size": "var(--text-caption)",
                    display: "flex",
                    "align-items": "center",
                    "justify-content": "center",
                    gap: "var(--space-2)",
                    cursor: busy() ? "default" : "pointer",
                    opacity: busy() ? 0.5 : 1,
                  }}
                >
                  <Icon name="ph-prohibit" size={16} />
                  永久屏蔽此发件人
                </button>
              </div>
            </SwipeActions>
            <p
              style={{
                "text-align": "center",
                "margin-top": "var(--space-3)",
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
              }}
            >
              第 {cursor() + 1} / {visibleQueue().length} 位待审
            </p>
            </>
          );
        }}
      </Show>
      </Show>
      </Show>
      </Show>
    </div>
  );
}

/** Batch triage panel — newsletter-scale queues can't be cleared one card
 *  at a time. Aggregates every pending sender into a multi-select list with
 *  bulk decisions. */
function BatchPanel(props: {
  items: { contact: Contact; message: Message }[];
  selected: Set<string>;
  busy: boolean;
  aiBusy: boolean;
  aiCount: number;
  onAiSuggest: () => void;
  onAiApply: () => void;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onApply: (kind: "imbox" | "feed" | "paperTrail" | "block" | "read") => void;
}) {
  const allSelected = () =>
    props.items.length > 0 && props.selected.size === props.items.length;
  const btn = (danger = false): JSX.CSSProperties => ({
    padding: "8px 14px",
    "min-height": "40px",
    "border-radius": "var(--radius-pill)",
    background: danger ? "transparent" : "var(--palm-soft)",
    border: danger ? "1.5px solid var(--status-danger)" : "none",
    color: danger ? "var(--status-danger)" : "var(--palm)",
    "font-size": "var(--text-caption)",
    "font-weight": 700,
    cursor: props.busy ? "default" : "pointer",
    opacity: props.busy ? 0.6 : 1,
    "white-space": "nowrap",
  });
  return (
    <div data-gate-batch style={{ "margin-top": "var(--space-3)" }}>
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
          "margin-bottom": "var(--space-2)",
          "font-size": "var(--text-caption)",
          color: "var(--text-secondary)",
        }}
      >
        <button
          onClick={() => (allSelected() ? props.onClear() : props.onSelectAll())}
          style={{ ...btn(), padding: "4px 12px", "min-height": "32px" }}
        >
          {allSelected() ? "清除选择" : `全选 ${props.items.length} 位`}
        </button>
        <span style={{ "margin-left": "auto" }}>已选 {props.selected.size} 位</span>
      </div>
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "4px",
          "max-height": "52dvh",
          "overflow-y": "auto",
        }}
      >
        <For each={props.items}>
          {(item) => {
            const email = item.contact.emails[0]?.value ?? "";
            const isNl = !!item.message.isNewsletter;
            return (
              <label
                data-batch-row={item.contact.id}
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--space-3)",
                  padding: "10px var(--space-3)",
                  "border-radius": "var(--radius-md)",
                  background: "color-mix(in srgb, var(--paper-light) 82%, transparent)",
                  border: "0.5px solid var(--border)",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={props.selected.has(item.contact.id)}
                  onChange={() => props.onToggle(item.contact.id)}
                  style={{ width: "18px", height: "18px", "flex-shrink": 0 }}
                />
                <Avatar name={item.contact.name} src={item.contact.avatar} size={36} />
                <span style={{ flex: 1, "min-width": 0 }}>
                  <span style={{ display: "flex", "align-items": "baseline", gap: "6px" }}>
                    <span
                      style={{
                        "font-size": "var(--text-body-sm)",
                        "font-weight": 600,
                        color: "var(--text-primary)",
                        "white-space": "nowrap",
                        overflow: "hidden",
                        "text-overflow": "ellipsis",
                      }}
                    >
                      {item.contact.name}
                    </span>
                    <Show
                      when={(() => {
                        const sug = suggestBucket(item.message);
                        return sug.bucket !== "imbox" ? sug : null;
                      })()}
                    >
                      {(sug) => (
                        <span
                          data-suggest-pill
                          style={{
                            "font-size": "var(--text-micro)",
                            "font-weight": 700,
                            color: "var(--text-secondary)",
                            background: "var(--paper-mid)",
                            "border-radius": "var(--radius-pill)",
                            padding: "1px 7px",
                            "flex-shrink": 0,
                          }}
                        >
                          建议 {BUCKET_SUGGEST_LABEL[sug().bucket]}
                        </span>
                      )}
                    </Show>
                    <Show when={isNl}>
                      <span
                        data-newsletter-pill
                        style={{
                          "font-size": "var(--text-micro)",
                          "font-weight": 700,
                          color: "var(--palm)",
                          background: "var(--palm-soft)",
                          "border-radius": "var(--radius-pill)",
                          padding: "1px 7px",
                          "flex-shrink": 0,
                        }}
                      >
                        订阅 · 建议报刊
                      </span>
                    </Show>
                  </span>
                  <span
                    style={{
                      display: "block",
                      "font-size": "var(--text-caption)",
                      color: "var(--text-muted)",
                      "white-space": "nowrap",
                      overflow: "hidden",
                      "text-overflow": "ellipsis",
                    }}
                  >
                    {email} · {item.message.subj || "(无主题)"}
                  </span>
                </span>
              </label>
            );
          }}
        </For>
      </div>
      <Show when={props.items.length === 0}>
        <p style={{ "text-align": "center", color: "var(--text-muted)", "font-size": "var(--text-body-sm)" }}>
          都审完了 🎉
        </p>
      </Show>
      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          "flex-wrap": "wrap",
          "margin-top": "var(--space-3)",
          position: "sticky",
          bottom: "var(--space-3)",
        }}
      >
        <button disabled={props.busy} style={btn()} onClick={() => props.onApply("imbox")}>
          批准到收件箱
        </button>
        <button disabled={props.busy} style={btn()} onClick={() => props.onApply("feed")}>
          到报刊
        </button>
        <button disabled={props.busy} style={btn()} onClick={() => props.onApply("paperTrail")}>
          到单据
        </button>
        <button disabled={props.busy} style={btn()} onClick={() => props.onApply("read")}>
          标为已读
        </button>
        <button
          type="button"
          data-ai-suggest
          disabled={props.aiBusy}
          onClick={props.onAiSuggest}
          style={{ ...btn(), border: "1px dashed var(--palm)" }}
        >
          {props.aiBusy ? "AI 分析中…" : "✨ AI 建议"}
        </button>
        <Show when={props.aiCount > 0}>
          <button
            type="button"
            data-ai-apply
            disabled={props.busy}
            onClick={props.onAiApply}
            style={btn()}
          >
            按 AI 建议应用（{props.aiCount}）
          </button>
        </Show>
        <button disabled={props.busy} style={btn(true)} onClick={() => props.onApply("block")}>
          屏蔽
        </button>
      </div>
    </div>
  );
}

/** Skeleton shown while the Gate queue loads — mirrors the real card so
 *  there is no layout jump and the user sees progress instead of a blank
 *  page (or a premature "都审完了"). */
function GateSkeleton() {
  return (
    <div
      style={{
        background: "var(--surface-elevated)",
        border: "0.5px solid var(--border)",
        "border-radius": "var(--radius-xl)",
        padding: "var(--space-6)",
        "box-shadow": "var(--shadow-md)",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "var(--space-4)",
          "align-items": "center",
          "margin-bottom": "var(--space-4)",
        }}
      >
        <Skeleton circle height={56} />
        <div style={{ flex: 1, "min-width": 0 }}>
          <Skeleton height={18} width="40%" />
          <div style={{ height: "var(--space-2)" }} />
          <Skeleton height={12} width="65%" />
        </div>
      </div>
      <Skeleton height={140} />
      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          "margin-top": "var(--space-4)",
        }}
      >
        <Skeleton height={64} />
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    </div>
  );
}

function DoneState() {
  return (
    <Empty
      icon="ph-check-circle"
      title="都审完了，收件箱见"
      description={t(
        "gate.empty.body",
        "现在没有陌生发件人需要审核。新的陌生发件人会先停在这里。",
      )}
      action={{ label: "回到收件箱", onClick: () => setView("imbox") }}
    />
  );
}

export function ScreenerHistory() {
  const [contacts, { refetch }] = createResource(listContacts);

  useRefreshEffect(() => {
    void refetch();
  });

  const screenedIn = createMemo(() =>
    (contacts() ?? []).filter((c) => c.screened && !c.firstSeen && !c.blocked),
  );
  const screenedOut = createMemo(() =>
    (contacts() ?? []).filter((c) => c.blocked),
  );

  const toggle = async (c: Contact, block: boolean) => {
    const updated: Contact = {
      ...c,
      blocked: block,
      screened: true,
      firstSeen: false,
    };
    await upsertContact(updated);
    await updateMessagesBucketByContact(c.id, block ? "spam" : c.defaultBucket);
    showToast({
      message: block ? `已将 ${c.name} 移入屏蔽` : `已将 ${c.name} 移入允许`,
      kind: "info",
    });
    refetch();
  };

  return (
    <div
      style={{
        "max-width": "880px",
        margin: "0 auto",
        padding: "var(--space-6) var(--space-5)",
        animation: "view-enter 0.3s var(--ease-out) both",
      }}
    >
      <Show
        when={!contacts.error}
        fallback={
          <ErrorState
            title="筛选历史加载失败"
            message="请检查网络后重试。"
            retry={() => void refetch()}
          />
        }
      >
        <PageHeader
          title="筛选历史"
          actions={
            <button
              onClick={() => setView("screener")}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: "4px",
              }}
              aria-label="返回筛选台"
              title="返回筛选台"
            >
              <Icon name="ph-arrow-left" size={20} />
            </button>
          }
        />

      <div
        style={{
          display: "grid",
          "grid-template-columns": "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "var(--space-4)",
        }}
      >
        <HistoryColumn
          title="允许的发件人"
          icon="ph-check-circle"
          color="var(--mint)"
          contacts={screenedIn()}
          actionLabel="屏蔽"
          onAction={(c) => toggle(c, true)}
        />
        <HistoryColumn
          title="屏蔽的发件人"
          icon="ph-prohibit"
          color="var(--coral)"
          contacts={screenedOut()}
          actionLabel="允许"
          onAction={(c) => toggle(c, false)}
        />
      </div>
      </Show>
    </div>
  );
}

function HistoryColumn(props: {
  title: string;
  icon: string;
  color: string;
  contacts: Contact[];
  actionLabel: string;
  onAction: (c: Contact) => void;
}) {
  const { isMobile } = useViewport();
  return (
    <div
      style={{
        background: "var(--paper-light)",
        border: "0.5px solid var(--border)",
        "border-radius": "var(--radius-xl)",
        padding: "var(--space-4)",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
          "margin-bottom": "var(--space-4)",
          "font-weight": "800",
          "font-size": "var(--text-body)",
        }}
      >
        <Icon name={props.icon} size={18} style={{ color: props.color }} />
        {props.title}
        <span
          style={{
            "margin-left": "auto",
            "font-size": "var(--text-caption)",
            color: "var(--text-muted)",
            "font-weight": "600",
          }}
        >
          {props.contacts.length}
        </span>
      </div>

      <Show
        when={props.contacts.length > 0}
        fallback={
          <div
            style={{
              padding: "var(--space-6)",
              "text-align": "center",
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            暂无记录
          </div>
        }
      >
        <div
          style={{ display: "flex", "flex-direction": "column", gap: "8px" }}
        >
          <For each={props.contacts}>
            {(c) => {
              const content = (
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--space-3)",
                    padding: "var(--space-3)",
                    background: "var(--surface-elevated)",
                    "border-radius": "var(--radius-md)",
                  }}
                >
                  <Avatar name={c.name || "?"} src={c.avatar} size={40} />
                  <div style={{ flex: 1, "min-width": 0 }}>
                    <div
                      style={{
                        "font-weight": "700",
                        "font-size": "var(--text-body-sm)",
                        "white-space": "nowrap",
                        overflow: "hidden",
                        "text-overflow": "ellipsis",
                      }}
                    >
                      {c.name || "未知发件人"}
                    </div>
                    <div
                      style={{
                        "font-size": "var(--text-micro)",
                        color: "var(--text-secondary)",
                        "white-space": "nowrap",
                        overflow: "hidden",
                        "text-overflow": "ellipsis",
                      }}
                    >
                      {c.emails[0]?.value ?? "（还没有邮箱地址）"}
                    </div>
                  </div>
                  <button
                    onClick={() => props.onAction(c)}
                    style={{
                      padding: "8px 12px",
                      "min-height": "36px",
                      background: "transparent",
                      border: `1px solid ${props.color}`,
                      color: props.color,
                      "border-radius": "var(--radius-md)",
                      "font-size": "var(--text-micro)",
                      "font-weight": "700",
                      cursor: "pointer",
                    }}
                  >
                    {props.actionLabel}
                  </button>
                </div>
              );
              const isBlockAction = props.actionLabel === "屏蔽";
              return (
                <SwipeActions
                  style={{ "border-radius": "var(--radius-md)" }}
                  leftAction={
                    isBlockAction
                      ? {
                          label: "屏蔽",
                          icon: "ph-prohibit",
                          color: "red",
                          onClick: () => props.onAction(c),
                        }
                      : undefined
                  }
                  rightAction={
                    !isBlockAction
                      ? {
                          label: "允许",
                          icon: "ph-check",
                          color: "blue",
                          onClick: () => props.onAction(c),
                        }
                      : undefined
                  }
                  disabled={!isMobile()}
                >
                  {content}
                </SwipeActions>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
