/** Stream view — newsletters, casual reads, newspaper mode.
 *
 *  Per prototype-v9 §renderStream: a continuous scroll of full-bleed cards.
 *  Click a card to expand the full message body inline; click again to
 *  collapse. The DetailPanel never opens for a Stream click — that would
 *  interrupt the reading flow.
 *
 *  Backend: pages 100 messages at a time via `usePaginatedMessages`, so
 *  a 5k-newsletter mailbox does not lock the UI on first paint.
 *  Rendering: virtua's VList mounts only ~30 DOM nodes for the visible
 *  window even when the dataset is 1000+.
 */
import {
  For,
  Show,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import { VList, type VListHandle } from "virtua/solid";
import { listContacts } from "../stores/data";
import type { Contact, Message } from "../types";
import { listFiles, upsertMessage } from "../stores/data";
import { usePaginatedMessages } from "../utils/paginated-messages";
import { useAccountScope } from "../utils/use-account-scope";
import { AccountTabs } from "../components/AccountTabs";
import { Avatar } from "../components/Avatar";
import { Empty } from "../components/Empty";
import { ErrorState } from "../components/Empty";
import { Icon } from "../components/Icon";
import { htmlToPlainText, looksLikeHtml } from "../utils/html";
import { PageHeader } from "../components/PageHeader";
import { RowSelect, selectedRowStyle } from "../components/RowSelect";
import { EmailBody } from "../components/EmailBody";
import { setView, showToast, appSettings } from "../stores/ui";
import { formatMessageDate } from "../utils/message-dates";

/** Profile timezone for mail date labels (falls back to OS zone in helpers). */
const profileTz = () => appSettings.profile.timezone;

import { registerPrepend } from "../services/sync-events";

const PREVIEW_PARAGRAPHS = 2;

function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function Stream() {
  const [contacts] = createResource(listContacts);
  const [files] = createResource(listFiles);
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set());
  const accountScope = useAccountScope();

  const paged = usePaginatedMessages(() => ({
    bucket: "feed" as const,
    ...accountScope.scope(),
  }));
  const items = paged.items;

  // Live-prepend on sync:new-messages so a freshly delivered newsletter
  // appears at the top of the list within one IPC round-trip instead of
  // waiting for the next refreshTick-driven LIMIT 100 refetch.
  onCleanup(
    registerPrepend("feed", (ids) => {
      void paged.prependByIds(ids);
    }),
  );

  const contactById = createMemo<Map<string, Contact>>(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts() ?? []) map.set(c.id, c);
    return map;
  });

  const fileById = createMemo<Map<string, { name: string; mime: string }>>(
    () => {
      const map = new Map<string, { name: string; mime: string }>();
      for (const f of files() ?? [])
        map.set(f.id, { name: f.name, mime: f.mime });
      return map;
    },
  );

  const MAX_EXPANDED_HTML = 5;

  const toggle = (id: string) => {
    const next = new Set(expanded());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      // Each expanded HTML card mounts a sandboxed iframe + pays a
      // DOMPurify pass on its body_html. Unbounded "expand everything"
      // is the Stream memory hog — cap concurrent expanded cards and
      // collapse the oldest (insertion order) past the cap.
      while (next.size > MAX_EXPANDED_HTML) {
        const oldest = next.values().next().value;
        if (oldest === undefined) break;
        next.delete(oldest);
      }
    }
    setExpanded(next);
  };

  const isExpanded = (id: string) => expanded().has(id);

  // Flag changes (setAside / replyLater) do NOT change the bucket, so the
  // card stays in the Stream list — removing it optimistically would make
  // the message "come back" on the next refresh, which reads as a bug.
  const setAside = async (m: Message) => {
    try {
      await upsertMessage({ ...m, setAside: true });
      paged.patchMessage(m.id, { setAside: true });
      showToast({
        message: "已搁置，仍保留在报刊中",
        kind: "success",
        action: { label: "查看搁置堆", run: () => {
            setView("setAside");
          } },
      });
    } catch (err) {
      showToast({
        message: "操作失败，请重试",
        kind: "error",
        source: "stream",
        detail: String(err),
      });
    }
  };

  const replyLater = async (m: Message) => {
    try {
      await upsertMessage({ ...m, replyLater: true });
      paged.patchMessage(m.id, { replyLater: true });
      showToast({
        message: "已加入稍后回复，仍保留在报刊中",
        kind: "success",
        action: { label: "查看稍后回复", run: () => {
            setView("replyLater");
          } },
      });
    } catch (err) {
      showToast({
        message: "操作失败，请重试",
        kind: "error",
        source: "stream",
        detail: String(err),
      });
    }
  };

  let listRef: VListHandle | undefined;
  const loadMoreIfNearEnd = (offset: number) => {
    const handle = listRef;
    if (!handle || !paged.hasMore() || paged.loadingMore()) return;
    const remaining = handle.scrollSize - (offset + handle.viewportSize);
    if (remaining < 800) {
      void paged.loadMore();
    }
  };

  return (
    <div
      style={{
        animation: "view-enter 0.3s var(--ease-out) both",
        height: "100%",
        display: "flex",
        "flex-direction": "column",
      }}
    >
      <Show
        when={!paged.resource.error}
        fallback={
          <ErrorState
            title="报刊加载失败"
            message="请检查网络后重试。"
            retry={() => void paged.refresh()}
          />
        }
      >
        <SectionHeader
          title="报刊"
          subtitle={`订阅邮件、长文慢慢看。点击卡片展开全文，可同时展开多篇。${
            paged.hasMore() ? ` 已加载 ${items().length}/${paged.total()}` : ""
          }`}
        />
        <AccountTabs
          bucket="feed"
          total={() => paged.total()}
          accounts={accountScope.accounts()}
        />
        <Show
          when={paged.resource.state !== "pending"}
          fallback={
            <div
              style={{
                "max-width": "720px",
                margin: "var(--space-4) auto",
                padding: "0 var(--space-5)",
              }}
            >
              <SkeletonBlock />
            </div>
          }
        >
          <Show when={items().length > 0} fallback={<EmptyState />}>
            <div
              style={{
                "max-width": "720px",
                width: "100%",
                margin: "0 auto",
                padding: "0 var(--space-5) var(--space-6)",
                flex: 1,
                "min-height": 0,
              }}
            >
              <VList
                ref={(h) =>
                  (listRef = (h ?? undefined) as VListHandle | undefined)
                }
                data={items()}
                onScroll={loadMoreIfNearEnd}
                style={{ height: "100%" }}
              >
                {(m: Message) => (
                  <StreamCard
                    m={m}
                    contact={contactById().get(m.pid)}
                    attachments={(m.attachments ?? [])
                      .map((id) => fileById().get(id))
                      .filter((f): f is { name: string; mime: string } => !!f)}
                    expanded={isExpanded(m.id)}
                    onToggle={() => toggle(m.id)}
                    onSetAside={() => void setAside(m)}
                    onReplyLater={() => void replyLater(m)}
                  />
                )}
              </VList>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  );
}

interface StreamCardProps {
  m: Message;
  contact: Contact | undefined;
  attachments: { name: string; mime: string }[];
  expanded: boolean;
  onToggle: () => void;
  onSetAside: () => void;
  onReplyLater: () => void;
}

function StreamCard(props: StreamCardProps) {
  // Derive preview paragraphs from the RICH part when it exists: the
  // text/plain fallback of HTML mail is full of `<https://…>` reference
  // link syntax and "无法阅读此邮件" boilerplate, which read as broken.
  // Expanded cards already render the sanitized HTML iframe.
  const paragraphs = createMemo(() => {
    const source =
      props.m.bodyHtml && looksLikeHtml(props.m.bodyHtml)
        ? htmlToPlainText(props.m.bodyHtml)
        : (props.m.body ?? "");
    return splitParagraphs(source);
  });
  const hasHtml = () => !!props.m.bodyHtml;
  // Text paragraphs are the fallback rendering for plain-text mail and
  // the collapsed preview for HTML mail. When an HTML body is expanded,
  // the iframe is the single rendering path — showing the paragraphs too
  // would print the same content twice.
  const showParagraphs = createMemo(
    () => !(hasHtml() && props.expanded) && paragraphs().length > 0,
  );
  const visibleParagraphs = createMemo(() => {
    if (props.expanded) return paragraphs();
    // Character cap, not just paragraph count: HTML-derived text often
    // arrives as ONE giant paragraph — a 2-paragraph slice then shows
    // the entire body and the card looks broken ("no HTML rendering").
    const out: string[] = [];
    let chars = 0;
    for (const p of paragraphs().slice(0, PREVIEW_PARAGRAPHS)) {
      if (chars + p.length > 280) {
        const room = Math.max(0, 280 - chars);
        if (room > 40) out.push(p.slice(0, room).trimEnd() + "…");
        break;
      }
      out.push(p);
      chars += p.length + 1;
    }
    return out;
  });

  return (
    <article
      data-stream-card
      data-expanded={props.expanded ? "true" : "false"}
      onClick={(e) => {
        // Don't toggle when clicking an interactive child (button/link/iframe).
        const target = e.target as HTMLElement;
        if (target.closest("button, a, input, iframe")) return;
        props.onToggle();
      }}
      style={{
        "border-radius": "var(--radius-lg)",
        padding: "var(--space-5) var(--space-4)",
        background: "var(--paper-light)",
        border: "0.5px solid var(--border)",
        "box-shadow": props.expanded ? "var(--shadow-md)" : "var(--shadow-sm)",
        cursor: "pointer",
        transition:
          "box-shadow var(--duration-fast) var(--ease-out)",
        "margin-bottom": "var(--space-3)",
        ...selectedRowStyle(props.m.id),
      }}
    >
      <header
        style={{
          display: "flex",
          gap: "var(--space-3)",
          "align-items": "center",
          "margin-bottom": "var(--space-3)",
        }}
      >
        <RowSelect id={props.m.id} />
        <Avatar
          name={props.contact?.name ?? "订阅"}
          src={props.contact?.avatar}
          size={40}
        />
        <div style={{ flex: 1, "min-width": 0 }}>
          <strong style={{ "font-weight": 700 }}>
            {props.contact?.name ?? "订阅"}
          </strong>
          <div
            style={{
              "font-size": "var(--text-micro)",
              color: "var(--text-muted)",
            }}
          >
            {formatMessageDate(props.m, profileTz(), "list").primary.value}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.onToggle();
          }}
          title={props.expanded ? "收起" : "展开全文"}
          aria-label={props.expanded ? "收起" : "展开全文"}
          style={{
            background: "transparent",
            border: "0",
            color: "var(--text-muted)",
            cursor: "pointer",
            width: "44px",
            height: "44px",
            margin: "-10px -10px -10px 0",
            "border-radius": "var(--radius-pill)",
            display: "inline-flex",
            "align-items": "center",
            "justify-content": "center",
          }}
        >
          <Icon
            name={props.expanded ? "ph-caret-up" : "ph-caret-down"}
            size={16}
          />
        </button>
      </header>

      <h3
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-h4)",
          "font-weight": 800,
          margin: "0 0 var(--space-3)",
        }}
      >
        {props.m.subj}
      </h3>

      <Show when={hasHtml() && props.expanded}>
        <div
          data-stream-html
          style={{
            margin: "0 0 var(--space-3)",
            "border-radius": "var(--radius-md)",
            overflow: "hidden",
            border: "0.5px solid var(--border)",
            background: "var(--paper)",
          }}
        >
          {/* The image bar stays on: a newsletter without its images is a
              page of blank boxes, and the bar is the only way to reveal them
              (plus "always show for this sender"). */}
          <EmailBody
            message={props.m}
            minHeight={200}
            trustSender={!props.contact?.blocked}
          />
        </div>
      </Show>

      <Show when={showParagraphs()}>
        <div style={{ position: "relative" }}>
          <div
            style={{
              color: "var(--text-secondary)",
              "font-size": "var(--text-body-sm)",
              "line-height": 1.7,
              // Room for the fade to swallow the last lines instead of
              // cutting them mid-glyph.
              "padding-bottom": props.expanded ? 0 : "28px",
            }}
          >
            <For each={visibleParagraphs()}>
              {(p) => <p style={{ margin: "0 0 var(--space-2)" }}>{p}</p>}
            </For>
          </div>

          {/* Collapsed: the text does not end, it fades into the paper. A hard
              cut reads as "this mail is three lines long"; a soft fade reads
              as "there is more, keep reading" — which is the whole point of a
              newspaper column. */}
          <Show when={!props.expanded}>
            <div
              aria-hidden="true"
              data-stream-fade
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: "72px",
                background:
                  "linear-gradient(to bottom, transparent 0%, var(--paper-light) 72%, var(--paper-light) 100%)",
                "pointer-events": "none",
              }}
            />
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                right: "2px",
                bottom: "2px",
                display: "inline-flex",
                "align-items": "center",
                gap: "4px",
                "font-size": "var(--text-micro)",
                "font-weight": 700,
                color: "var(--text-muted)",
                "letter-spacing": "0.04em",
                "pointer-events": "none",
              }}
            >
              继续读 <Icon name="ph-caret-down" size={10} />
            </span>
          </Show>
        </div>
      </Show>

      <Show
        when={
          !props.expanded &&
          !hasHtml() &&
          paragraphs().length > PREVIEW_PARAGRAPHS
        }
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.onToggle();
          }}
          style={{
            background: "var(--palm-soft)",
            border: "0",
            color: "var(--palm)",
            "font-weight": 700,
            "font-size": "var(--text-caption)",
            padding: "6px 14px",
            "border-radius": "var(--radius-pill)",
            cursor: "pointer",
            display: "inline-flex",
            "align-items": "center",
            gap: "4px",
          }}
        >
          展开全文（还有 {paragraphs().length - PREVIEW_PARAGRAPHS} 段）
          <Icon name="ph-caret-down" size={12} />
        </button>
      </Show>

      <Show when={props.expanded}>
        <footer
          data-stream-actions
          onClick={(e) => e.stopPropagation()}
          style={{
            display: "flex",
            gap: "var(--space-2)",
            "flex-wrap": "wrap",
            "margin-top": "var(--space-4)",
            "padding-top": "var(--space-3)",
            "border-top": "0.5px solid var(--border)",
          }}
        >
          <ActionButton
            icon="ph-clock"
            label="稍后回复"
            onClick={props.onReplyLater}
          />
          <ActionButton
            icon="ph-push-pin"
            label="搁置"
            onClick={props.onSetAside}
          />
          <Show when={props.attachments.length > 0}>
            <span
              data-stream-attachments-count
              style={{
                display: "inline-flex",
                "align-items": "center",
                gap: "4px",
                padding: "4px 10px",
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
                background: "var(--paper-mid)",
                "border-radius": "var(--radius-pill)",
              }}
            >
              <Icon name="ph-paperclip" size={12} />
              {props.attachments.length} 个附件
            </span>
          </Show>
        </footer>
      </Show>
    </article>
  );
}

function ActionButton(props: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={props.onClick}
      title={props.label}
      aria-label={props.label}
      style={{
        display: "inline-flex",
        "align-items": "center",
        gap: "4px",
        padding: "8px 12px",
        background: "var(--paper-mid)",
        "border-radius": "var(--radius-pill)",
        border: "0",
        "font-size": "var(--text-caption)",
        "font-weight": 700,
        color: "var(--text-secondary)",
        cursor: "pointer",
      }}
    >
      <Icon name={props.icon} size={13} />
      {props.label}
    </button>
  );
}

function SectionHeader(props: { title: string; subtitle?: string }) {
  return (
    <PageHeader
      title={props.title}
      description={props.subtitle ? <p>{props.subtitle}</p> : undefined}
    />
  );
}

function SkeletonBlock() {
  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "var(--space-3)",
      }}
    >
      <For each={[0, 1, 2, 3]}>
        {() => (
          <div
            style={{
              padding: "var(--space-5) var(--space-4)",
              "border-radius": "var(--radius-lg)",
              border: "0.5px solid var(--border)",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "var(--space-3)",
                "align-items": "center",
                "margin-bottom": "var(--space-3)",
              }}
            >
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  "border-radius": "50%",
                  background: "var(--paper-mid)",
                }}
              />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    height: "12px",
                    width: "40%",
                    background: "var(--paper-mid)",
                    "border-radius": "4px",
                    "margin-bottom": "6px",
                  }}
                />
                <div
                  style={{
                    height: "10px",
                    width: "20%",
                    background: "var(--paper-mid)",
                    "border-radius": "4px",
                  }}
                />
              </div>
            </div>
            <div
              style={{
                height: "18px",
                width: "70%",
                background: "var(--paper-mid)",
                "border-radius": "4px",
                "margin-bottom": "var(--space-2)",
              }}
            />
            <div
              style={{
                height: "12px",
                width: "90%",
                background: "var(--paper-mid)",
                "border-radius": "4px",
                "margin-bottom": "4px",
              }}
            />
            <div
              style={{
                height: "12px",
                width: "60%",
                background: "var(--paper-mid)",
                "border-radius": "4px",
              }}
            />
          </div>
        )}
      </For>
    </div>
  );
}

function EmptyState() {
  return (
    <Empty
      icon="ph-newspaper"
      title="报刊是空的"
      description="订阅邮件和 newsletter 到了会出现在这里。"
    />
  );
}
