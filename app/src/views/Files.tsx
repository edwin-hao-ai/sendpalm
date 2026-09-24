/** Files view — grid with type filters + advanced filters.
 * Spec: prototype-v11 §3.6.
 *
 * Filters: name/sender search, type, date range, sender, size. All apply
 * on the client to the listFiles() result; no extra IPC round-trips per
 * filter change. The advanced controls are collapsed by default to keep
 * the default state visually clean.
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
import { listFiles, listContacts } from "../stores/data";
import { Empty, ErrorState } from "../components/Empty";
import { Icon } from "../components/Icon";
import { ResourceGate } from "../components/ResourceGate";
import { SkeletonList } from "../components/Skeleton";
import {
  setDetailOpen,
  setSelectedFileId,
  setSelectedMessageId,
} from "../stores/ui";
import { formatBytes, relativeTime } from "../utils/date";
import { fileIconName } from "../utils/labels";
import { useRefreshEffect } from "../utils/gestures";
import { applyFileFilters, type FileFilterState } from "../utils/file-filters";
import { fileTypeLabel } from "../panels/FilePanel";
import { getAttachmentContent } from "../services/backend";
import { saveAttachment } from "../utils/save-attachment";
import type { FileItem } from "../types";

/** 文件名或发件人名的不区分大小写包含匹配。applyFileFilters 的 query
 * 只匹配文件名，这里补上发件人维度。 */
export function fileMatchesQuery(
  f: FileItem,
  query: string,
  senderName?: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    f.name.toLowerCase().includes(q) ||
    (senderName?.toLowerCase().includes(q) ?? false)
  );
}

function useMedia(query: string) {
  const [matches, setMatches] = createSignal(false);
  onMount(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", onChange);
    onCleanup(() => mq.removeEventListener("change", onChange));
  });
  return matches;
}

export function Files() {
  const [files, { refetch: refetchFiles }] = createResource(listFiles);
  const [contacts, { refetch: refetchContacts }] = createResource(listContacts);

  useRefreshEffect(() => {
    void refetchFiles();
    void refetchContacts();
  });

  const isCoarse = useMedia("(pointer: coarse)");

  const [typeFilter, setTypeFilter] = createSignal<
    "all" | "pdf" | "image" | "doc" | "spreadsheet"
  >("all");
  const [search, setSearch] = createSignal("");
  // Advanced filters (PRD §3.6): date range, sender, size.
  const [showAdvanced, setShowAdvanced] = createSignal(false);
  const [dateFrom, setDateFrom] = createSignal(""); // YYYY-MM-DD
  const [dateTo, setDateTo] = createSignal("");
  const [senderId, setSenderId] = createSignal(""); // contact id or "" = any
  const [sizeMinKb, setSizeMinKb] = createSignal("");
  const [sizeMaxKb, setSizeMaxKb] = createSignal("");

  const senderOptions = createMemo(() => {
    const seen = new Set<string>();
    for (const f of files() ?? []) if (f.pid) seen.add(f.pid);
    return [...seen]
      .map((id) => contacts()?.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  const advancedActiveCount = () =>
    [dateFrom(), dateTo(), senderId(), sizeMinKb(), sizeMaxKb()].filter(
      Boolean,
    ).length;

  const dateRangeInvalid = () =>
    Boolean(dateFrom() && dateTo() && dateFrom() > dateTo());
  const sizeRangeInvalid = () => {
    const min = Number(sizeMinKb());
    const max = Number(sizeMaxKb());
    return Boolean(
      sizeMinKb() && sizeMaxKb() && !Number.isNaN(min) && !Number.isNaN(max) && min > max,
    );
  };

  const clearAdvanced = () => {
    setDateFrom("");
    setDateTo("");
    setSenderId("");
    setSizeMinKb("");
    setSizeMaxKb("");
  };

  const clearAll = () => {
    setSearch("");
    setTypeFilter("all");
    clearAdvanced();
  };

  const contactById = (id: string) =>
    (contacts() ?? []).find((c) => c.id === id);

  const items = createMemo(() => {
    const state: FileFilterState = {
      type: typeFilter(),
      // applyFileFilters 的 query 只匹配文件名；发件人匹配在下方自行处理。
      query: "",
      dateFrom: dateFrom(),
      dateTo: dateTo(),
      senderId: senderId(),
      sizeMinKb: sizeMinKb(),
      sizeMaxKb: sizeMaxKb(),
    };
    const base = applyFileFilters(files() ?? [], state);
    const q = search();
    if (!q.trim()) return base;
    return base.filter((f) =>
      fileMatchesQuery(f, q, f.pid ? contactById(f.pid)?.name : undefined),
    );
  });

  const anyFilterActive = () =>
    Boolean(search().trim() || typeFilter() !== "all" || advancedActiveCount());

  const FILTERS = [
    { id: "all", label: "全部", icon: "ph-files" },
    { id: "pdf", label: "PDF", icon: "ph-file-pdf" },
    { id: "image", label: "图片", icon: "ph-file-image" },
    { id: "doc", label: "文档", icon: "ph-file-text" },
    { id: "spreadsheet", label: "表格", icon: "ph-file-xls" },
  ] as const;

  return (
    <div style={{ animation: "view-enter 0.3s var(--ease-out) both" }}>
      <style>{FILES_CSS}</style>
      <div style={{ "max-width": "920px", margin: "0 auto" }}>
        <header style={{ padding: "var(--space-5)" }}>
          <h1
            style={{
              "font-family": "var(--font-display)",
              "font-size": "var(--text-h1)",
              "font-weight": "800",
              margin: 0,
            }}
          >
            文件
          </h1>
          <p
            style={{
              color: "var(--text-secondary)",
              "font-size": "var(--text-caption)",
              margin: "var(--space-1) 0 0",
            }}
          >
            附件管理 · {items().length} 项
          </p>
        </header>

        <div
          style={{
            padding: "0 var(--space-5) var(--space-3)",
            display: "flex",
            gap: "var(--space-2)",
            "flex-wrap": "wrap",
            "align-items": "center",
          }}
        >
          <div
            style={{
              flex: "1 1 200px",
              position: "relative",
              display: "flex",
              "align-items": "center",
            }}
          >
            <input
              value={search()}
              onInput={(e) => setSearch(e.currentTarget.value)}
              placeholder="搜索文件名或发件人…"
              aria-label="搜索文件"
              style={{
                width: "100%",
                padding: "8px 36px 8px 14px",
                background: "var(--paper-light)",
                border: "0.5px solid var(--border)",
                "border-radius": "var(--radius-pill)",
                "font-size": "var(--text-body-sm)",
              }}
            />
            <Show when={search()}>
              <button
                onClick={() => setSearch("")}
                aria-label="清空搜索"
                title="清空搜索"
                style={{
                  position: "absolute",
                  right: "8px",
                  color: "var(--text-muted)",
                  display: "flex",
                  padding: "4px",
                }}
              >
                <Icon name="ph-x" size={12} />
              </button>
            </Show>
          </div>
          <For each={FILTERS}>
            {(f) => (
              <button
                onClick={() => setTypeFilter(f.id)}
                style={{
                  padding: "4px 12px",
                  "min-height": isCoarse() ? "44px" : undefined,
                  "border-radius": "var(--radius-pill)",
                  background:
                    typeFilter() === f.id
                      ? "var(--palm-soft)"
                      : "var(--paper-mid)",
                  color:
                    typeFilter() === f.id
                      ? "var(--palm)"
                      : "var(--text-secondary)",
                  "font-size": "var(--text-caption)",
                  "font-weight": typeFilter() === f.id ? "700" : "500",
                  display: "flex",
                  "align-items": "center",
                  gap: "4px",
                }}
              >
                <Icon name={f.icon} size={11} />
                {f.label}
              </button>
            )}
          </For>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced()}
            title="高级筛选"
            style={{
              padding: "4px 12px",
              "min-height": isCoarse() ? "44px" : undefined,
              "border-radius": "var(--radius-pill)",
              background:
                showAdvanced() || advancedActiveCount()
                  ? "var(--palm-soft)"
                  : "var(--paper-mid)",
              color:
                showAdvanced() || advancedActiveCount()
                  ? "var(--palm)"
                  : "var(--text-secondary)",
              "font-size": "var(--text-caption)",
              "font-weight": advancedActiveCount() ? "700" : "500",
              display: "flex",
              "align-items": "center",
              gap: "4px",
              "margin-left": "auto",
            }}
          >
            <Icon name="ph-funnel" size={11} />
            高级
            <Show when={advancedActiveCount() > 0}>
              <span
                style={{
                  "font-size": "10px",
                  "font-weight": "800",
                  background: "var(--palm)",
                  color: "white",
                  "border-radius": "999px",
                  padding: "0 6px",
                  "min-width": "16px",
                  "text-align": "center",
                }}
              >
                {advancedActiveCount()}
              </span>
            </Show>
          </button>
        </div>

        <Show when={showAdvanced()}>
          <div
            data-testid="files-advanced"
            style={{
              display: "flex",
              gap: "var(--space-3)",
              "flex-wrap": "wrap",
              "align-items": "flex-end",
              background: "var(--paper-mid)",
              "border-radius": "var(--radius-md)",
              margin: "0 var(--space-5) var(--space-3)",
              padding: "var(--space-3)",
            }}
          >
            <label style={advancedLabel}>
              <span>从</span>
              <input
                type="date"
                value={dateFrom()}
                onInput={(e) => setDateFrom(e.currentTarget.value)}
                style={{
                  ...advancedInput,
                  border: dateRangeInvalid()
                    ? "1px solid var(--coral)"
                    : advancedInput.border,
                }}
              />
            </label>
            <label style={advancedLabel}>
              <span>到</span>
              <input
                type="date"
                value={dateTo()}
                onInput={(e) => setDateTo(e.currentTarget.value)}
                style={{
                  ...advancedInput,
                  border: dateRangeInvalid()
                    ? "1px solid var(--coral)"
                    : advancedInput.border,
                }}
              />
            </label>
            <label style={advancedLabel}>
              <span>发件人</span>
              <select
                value={senderId()}
                onChange={(e) => setSenderId(e.currentTarget.value)}
                style={advancedInput}
              >
                <option value="">全部</option>
                <For each={senderOptions()}>
                  {(c) => <option value={c.id}>{c.name}</option>}
                </For>
              </select>
            </label>
            <label style={advancedLabel}>
              <span>大小 ≥ KB</span>
              <input
                type="number"
                min="0"
                inputmode="numeric"
                value={sizeMinKb()}
                onInput={(e) => setSizeMinKb(e.currentTarget.value)}
                placeholder="0"
                style={{
                  ...advancedInput,
                  border: sizeRangeInvalid()
                    ? "1px solid var(--coral)"
                    : advancedInput.border,
                }}
              />
            </label>
            <label style={advancedLabel}>
              <span>大小 ≤ KB</span>
              <input
                type="number"
                min="0"
                inputmode="numeric"
                value={sizeMaxKb()}
                onInput={(e) => setSizeMaxKb(e.currentTarget.value)}
                placeholder="∞"
                style={{
                  ...advancedInput,
                  border: sizeRangeInvalid()
                    ? "1px solid var(--coral)"
                    : advancedInput.border,
                }}
              />
            </label>
            <Show when={dateRangeInvalid()}>
              <span
                style={{ "font-size": "var(--text-micro)", color: "var(--coral)" }}
              >
                结束日期不能早于开始日期
              </span>
            </Show>
            <Show when={sizeRangeInvalid()}>
              <span
                style={{ "font-size": "var(--text-micro)", color: "var(--coral)" }}
              >
                大小下限不能大于上限
              </span>
            </Show>
            <Show when={advancedActiveCount() > 0}>
              <button
                onClick={clearAdvanced}
                style={{
                  padding: "4px 12px",
                  "border-radius": "var(--radius-pill)",
                  background: "transparent",
                  color: "var(--text-muted)",
                  "font-size": "var(--text-caption)",
                  "font-weight": "600",
                  "margin-left": "auto",
                }}
              >
                清除
              </button>
            </Show>
          </div>
        </Show>

        <ResourceGate
          resource={files}
          isLoading={() => files.loading || contacts.loading}
          loading={
            <div style={{ padding: "0 var(--space-5) var(--space-5)" }}>
              <SkeletonList count={8} height={140} />
            </div>
          }
          errorView={() => (
            <ErrorState
              title="文件加载失败"
              message="请稍后重试；若反复失败，可到顶栏的错误日志里查看详情。"
              retry={() => void refetchFiles()}
            />
          )}
          empty={
            anyFilterActive() ? (
              <Empty
                icon="ph-funnel"
                title="没有符合条件的文件"
                description="试试调整搜索词或筛选条件。"
                action={{ label: "清除全部筛选", onClick: clearAll }}
              />
            ) : (
              <Empty
                icon="ph-paperclip"
                title="还没有文件"
                description="邮件里的附件会集中出现在这里。"
              />
            )
          }
          isEmpty={() => items().length === 0}
        >
          {() => (
            <div style={{ padding: "0 var(--space-5) var(--space-5)" }}>
              <div
                style={{
                  display: "grid",
                  "grid-template-columns":
                    "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: "var(--space-3)",
                }}
              >
                <For each={items()}>
                  {(f) => {
                    const c = contactById(f.pid);
                    return (
                      <div
                        class="file-card"
                        role="button"
                        tabIndex={0}
                        aria-label={`打开文件 ${f.name}`}
                        onClick={() => {
                          setSelectedFileId(f.id);
                          setDetailOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedFileId(f.id);
                            setDetailOpen(true);
                          }
                        }}
                        style={{
                          padding: "var(--space-3)",
                          background: "var(--paper-light)",
                          border: "0.5px solid var(--border)",
                          "border-radius": "var(--radius-md)",
                          "text-align": "left",
                          cursor: "pointer",
                          position: "relative",
                        }}
                      >
                        <FileThumb file={f} />
                        <strong class="file-card-name">{f.name}</strong>
                        <p
                          style={{
                            margin: "2px 0 0",
                            "font-size": "var(--text-micro)",
                            color: "var(--text-muted)",
                          }}
                        >
                          {formatBytes(f.size)} · {fileTypeLabel(f.type)} ·{" "}
                          {c?.name ?? "未知联系人"}
                        </p>
                        <p
                          style={{
                            margin: "2px 0 0",
                            "font-size": "var(--text-micro)",
                            color: "var(--text-muted)",
                          }}
                        >
                          {relativeTime(f.st)}
                        </p>
                        <div
                          class={
                            isCoarse()
                              ? "file-card-actions file-card-actions-always"
                              : "file-card-actions"
                          }
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFileId(f.id);
                              setDetailOpen(true);
                            }}
                            aria-label="预览"
                            title="预览"
                            style={cardActionBtn}
                          >
                            <Icon name="ph-eye" size={12} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void saveAttachment(f.id, f.name);
                            }}
                            aria-label="下载"
                            title="下载"
                            style={cardActionBtn}
                          >
                            <Icon name="ph-download-simple" size={12} />
                          </button>
                          <Show when={f.sourceMessageIds?.[0]}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const mid = f.sourceMessageIds?.[0];
                                if (!mid) return;
                                setSelectedMessageId(mid);
                                setDetailOpen(true);
                              }}
                              aria-label="定位来源邮件"
                              title="定位来源邮件"
                              style={cardActionBtn}
                            >
                              <Icon name="ph-envelope-simple" size={12} />
                            </button>
                          </Show>
                        </div>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          )}
        </ResourceGate>
      </div>
    </div>
  );
}

/** 卡片缩略图：图片型附件优先显示真实缩略图（thumbUrl / url /
 * 附件内容 data URL），加载失败或不可用时回退到类型图标。 */
function FileThumb(props: { file: FileItem }) {
  const isImage = () => props.file.type === "image";
  const [failed, setFailed] = createSignal(false);
  // Only fetch the (base64) content once the card is near the viewport.
  // Without this, a 2,700-file mailbox fires thousands of IPC reads and
  // buffers every image in memory at mount.
  const [visible, setVisible] = createSignal(false);
  let el: HTMLDivElement | undefined;

  /** A `url` that the webview can load directly. Synced attachments store
   *  a filesystem-relative path (`attachments/<id>/<name>`) which is NOT a
   *  web URL — using it as `<img src>` 404s, which is why previews were
   *  blank. Those are inlined from `get_attachment_content` instead. */
  const isWebUrl = (u?: string | null) =>
    !!u && /^(https?:|data:|blob:|asset:|tauri:)/.test(u);

  onMount(() => {
    if (!isImage() || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    onCleanup(() => io.disconnect());
  });

  const [inlineUrl] = createResource(
    () =>
      isImage() && visible() && !isWebUrl(props.file.thumbUrl) && !isWebUrl(props.file.url)
        ? props.file.id
        : null,
    async (id) => (id ? await getAttachmentContent(id) : null),
  );
  const src = () => {
    if (isWebUrl(props.file.thumbUrl)) return props.file.thumbUrl;
    if (isWebUrl(props.file.url)) return props.file.url;
    return inlineUrl() ?? null;
  };

  return (
    <div
      ref={(node) => (el = node)}
      style={{
        width: "100%",
        "aspect-ratio": "1",
        background: "var(--paper-mid)",
        "border-radius": "var(--radius-sm)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "margin-bottom": "var(--space-2)",
        color: "var(--text-secondary)",
        overflow: "hidden",
      }}
    >
      <Show
        when={isImage() && src() && !failed()}
        fallback={
          <Icon name={fileIconName(props.file.type)} size={40} />
        }
      >
        <img
          src={src()!}
          alt={props.file.name}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            "object-fit": "cover",
            display: "block",
          }}
        />
      </Show>
    </div>
  );
}

const FILES_CSS = `
.file-card:hover,
.file-card:focus-visible {
  background: var(--paper-mid) !important;
}
.file-card-name {
  font-size: var(--text-body-sm);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  /* Break at natural boundaries (hyphens/dots) first so the extension
     stays intact ("…-0913.pdf" rather than "…0913.p / df"); fall back
     to breaking anywhere only when a segment is too long. */
  overflow-wrap: anywhere;
  word-break: normal;
}
.file-card-actions {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  display: none;
  gap: 4px;
}
.file-card:hover .file-card-actions,
.file-card:focus-within .file-card-actions,
.file-card-actions-always {
  display: flex;
}
`;

const cardActionBtn: JSX.CSSProperties = {
  width: "28px",
  height: "28px",
  "border-radius": "var(--radius-pill)",
  background: "var(--surface-elevated)",
  border: "0.5px solid var(--border)",
  color: "var(--text-secondary)",
  display: "flex",
  "align-items": "center",
  "justify-content": "center",
  cursor: "pointer",
};

const advancedLabel: JSX.CSSProperties = {
  display: "flex",
  "flex-direction": "column",
  gap: "2px",
  "font-size": "var(--text-micro)",
  color: "var(--text-muted)",
  "font-weight": "600",
};

const advancedInput: JSX.CSSProperties = {
  padding: "6px 10px",
  background: "var(--paper-light)",
  border: "0.5px solid var(--border)",
  "border-radius": "var(--radius-sm)",
  "font-size": "var(--text-body-sm)",
  color: "var(--text-primary)",
  "min-width": "120px",
};
