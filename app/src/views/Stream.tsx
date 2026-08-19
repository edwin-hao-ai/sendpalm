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
import {
  listFiles,
  upsertMessage,
} from "../stores/data";
import { usePaginatedMessages } from "../utils/paginated-messages";
import { Avatar } from "../components/Avatar";
import { Empty } from "../components/Empty";
import { ErrorState } from "../components/Empty";
import { Icon } from "../components/Icon";
import { htmlEmailSrcdoc } from "../utils/html";
import { showToast } from "../stores/ui";
import { useViewport } from "../utils/gestures";
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
  const { isMobile } = useViewport();
  const [expanded, setExpanded] = createSignal<Set<string>>(new Set());

  const paged = usePaginatedMessages({ bucket: "feed" });
  const items = paged.items;
  const refresh = paged.refresh;

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

  const setAside = async (m: Message) => {
    paged.removeByIds([m.id]);
    try {
      await upsertMessage({ ...m, setAside: true });
      showToast({ message: "已 Set Aside", kind: "success" });
    } catch (err) {
      await refresh();
      showToast({ message: `Set Aside 失败：${String(err)}`, kind: "error" });
    }
  };

  const replyLater = async (m: Message) => {
    paged.removeByIds([m.id]);
    try {
      await upsertMessage({ ...m, replyLater: true });
      showToast({ message: "已 Reply Later", kind: "success" });
    } catch (err) {
      await refresh();
      showToast({ message: `Reply Later 失败：${String(err)}`, kind: "error" });
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
            message={String(paged.resource.error ?? "")}
            retry={() => void paged.refresh()}
          />
        }
      >
        <SectionHeader
        title="The Stream"
        subtitle={`订阅邮件、长文慢慢看。点击展开全文，多篇可同时展开。无 DetailPanel，光滑滚动。${
          paged.hasMore() ? ` · 已加载 ${items().length}/${paged.total()}` : ""
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
              ref={(h) => (listRef = (h ?? undefined) as VListHandle | undefined)}
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
                  isMobile={isMobile()}
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
  isMobile: boolean;
}

function StreamCard(props: StreamCardProps) {
  const paragraphs = createMemo(() => splitParagraphs(props.m.body || ""));
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
        "border-bottom": "0.5px solid var(--border)",
        padding: "var(--space-5) var(--space-4)",
        background: props.expanded ? "var(--paper-light)" : "transparent",
        cursor: "pointer",
        transition:
          "background var(--duration-fast) var(--ease-out)",
        "margin-bottom": "var(--space-2)",
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
          name={props.contact?.name ?? "Newsletter"}
          src={props.contact?.avatar}
          size={40}
        />
        <div style={{ flex: 1, "min-width": 0 }}>
          <strong style={{ "font-weight": 700 }}>
            {props.contact?.name ?? "Newsletter"}
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
          title={props.expanded ? "收起" : "展开"}
          aria-label={props.expanded ? "收起" : "展开"}
          style={{
            background: "transparent",
            border: "0",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: "6px",
            "border-radius": "var(--radius-pill)",
            display: "inline-flex",
            "align-items": "center",
            "justify-content": "center",
          }}
        >
          <Icon name={props.expanded ? "ph-caret-up" : "ph-caret-down"} size={14} />
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

      <Show when={props.m.bodyHtml && props.expanded}>
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
            srcdoc={htmlEmailSrcdoc(props.m.bodyHtml!)}
            sandbox=""
            title={props.m.subj}
            style={{
              width: "100%",
              border: "0",
              "min-height": "200px",
              height: "480px",
              display: "block",
            }}
          />
        </div>
      </Show>

      <Show when={visibleParagraphs().length > 0}>
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

      <Show when={!props.expanded && paragraphs().length > PREVIEW_PARAGRAPHS}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            props.onToggle();
          }}
          style={{
            background: "transparent",
            border: "0",
            color: "var(--palm)",
            "font-weight": 700,
            "font-size": "var(--text-caption)",
            padding: "var(--space-2) 0",
            cursor: "pointer",
          }}
        >
          展开全文 ({paragraphs().length - PREVIEW_PARAGRAPHS} 段更多) ↓
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
            label={props.isMobile ? "" : "Reply Later"}
            onClick={props.onReplyLater}
          />
          <ActionButton
            icon="ph-push-pin"
            label={props.isMobile ? "" : "Set Aside"}
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
      style={{
        display: "inline-flex",
        "align-items": "center",
        gap: "4px",
        padding: "6px 10px",
        background: "var(--paper-mid)",
        "border-radius": "var(--radius-pill)",
        border: "0",
        "font-size": "var(--text-micro)",
        "font-weight": 700,
        color: "var(--text-secondary)",
        cursor: "pointer",
      }}
    >
      <Icon name={props.icon} size={12} />
      {props.label || <span style={{ width: "12px" }} />}
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
      <h2
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-h3)",
          "font-weight": 800,
          margin: 0,
          "margin-bottom": "var(--space-1)",
        }}
      >
        {props.title}
      </h2>
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
              "border-bottom": "0.5px solid var(--border)",
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
      description="还没有订阅类邮件。等你的下一次签到。"
    />
  );
}