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
  createEffect,
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
import { Avatar } from "../components/Avatar";
import { Empty } from "../components/Empty";
import { ErrorState } from "../components/Empty";
import { Icon } from "../components/Icon";
import { htmlEmailSrcdoc } from "../utils/html";
import { setView, showToast } from "../stores/ui";
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

  const paged = usePaginatedMessages({ bucket: "feed" });
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

  const toggle = (id: string) => {
    const next = new Set(expanded());
    if (next.has(id)) next.delete(id);
    else next.add(id);
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
        message: "已搁置，仍保留在 Stream 中",
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
        message: "已加入稍后回复，仍保留在 Stream 中",
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
            title="Stream 加载失败"
            message="请检查网络后重试。"
            retry={() => void paged.refresh()}
          />
        }
      >
        <SectionHeader
          title="The Stream"
          subtitle={`订阅邮件、长文慢慢看。点击卡片展开全文，可同时展开多篇。${
            paged.hasMore() ? ` 已加载 ${items().length}/${paged.total()}` : ""
          }`}
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
                padding: "0 var(--space-5) var(--space-7)",
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
  const paragraphs = createMemo(() => splitParagraphs(props.m.body || ""));
  const hasHtml = () => !!props.m.bodyHtml;
  // Text paragraphs are the fallback rendering for plain-text mail and
  // the collapsed preview for HTML mail. When an HTML body is expanded,
  // the iframe is the single rendering path — showing the paragraphs too
  // would print the same content twice.
  const showParagraphs = createMemo(
    () => !(hasHtml() && props.expanded) && paragraphs().length > 0,
  );
  const visibleParagraphs = createMemo(() =>
    props.expanded
      ? paragraphs()
      : paragraphs().slice(0, PREVIEW_PARAGRAPHS),
  );

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
            {props.m.tm}
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
        <StreamHtmlBody html={props.m.bodyHtml!} title={props.m.subj} />
      </Show>

      <Show when={showParagraphs()}>
        <div
          style={{
            color: "var(--text-secondary)",
            "font-size": "var(--text-body-sm)",
            "line-height": 1.6,
          }}
        >
          <For each={visibleParagraphs()}>
            {(p) => <p style={{ margin: "0 0 var(--space-2)" }}>{p}</p>}
          </For>
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

/** HTML body renderer for an expanded Stream card.
 *  Follows the §11.6 defer pattern: DOMPurify runs in a `setTimeout(0)`
 *  effect so expanding a card never blocks the main thread, and the
 *  iframe auto-sizes to its content on load. */
function StreamHtmlBody(props: { html: string; title: string }) {
  const [srcdoc, setSrcdoc] = createSignal("");
  let stale = 0;

  createEffect(() => {
    const html = props.html;
    const myId = ++stale;
    setTimeout(() => {
      if (myId !== stale) return;
      setSrcdoc(htmlEmailSrcdoc(html));
    }, 0);
  });

  return (
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
      <iframe
        srcdoc={srcdoc()}
        sandbox=""
        title={props.title}
        onLoad={(e) => {
          const el = e.currentTarget;
          try {
            const doc = el.contentDocument;
            if (doc?.body) {
              el.style.height = `${doc.body.scrollHeight + 24}px`;
            }
          } catch {
            /* sandboxed — keep default height */
          }
        }}
        style={{
          width: "100%",
          border: "0",
          "min-height": "200px",
          height: "480px",
          display: "block",
        }}
      />
    </div>
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
    <header
      style={{
        padding: "var(--space-6) var(--space-5) var(--space-3)",
        "text-align": "center",
      }}
    >
      <h1
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-h1)",
          "font-weight": 800,
          margin: 0,
          "margin-bottom": "var(--space-1)",
        }}
      >
        {props.title}
      </h1>
      <Show when={props.subtitle}>
        <p
          style={{
            color: "var(--text-secondary)",
            margin: 0,
            "font-size": "var(--text-caption)",
          }}
        >
          {props.subtitle}
        </p>
      </Show>
    </header>
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
      title="Stream 是空的"
      description="订阅邮件和 newsletter 到了会出现在这里。"
    />
  );
}
