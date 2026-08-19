/** Files view — grid with type filters + advanced filters.
 * Spec: prototype-v11 §3.6.
 *
 * Filters: name search, type, date range, sender, size. All apply on the
 * client to the listFiles() result; no extra IPC round-trips per filter
 * change. The advanced controls are collapsed by default to keep the
 * default state visually clean.
 */

import { For, Show, createMemo, createResource, createSignal, type JSX } from "solid-js";
import { listFiles, listContacts } from "../stores/data";
import { Empty, ErrorState } from "../components/Empty";
import { Icon } from "../components/Icon";
import { setDetailOpen, setSelectedFileId } from "../stores/ui";
import { relativeTime } from "../utils/date";
import { useRefreshEffect } from "../utils/gestures";
import { applyFileFilters, type FileFilterState } from "../utils/file-filters";

export function Files() {
  const [files, { refetch: refetchFiles }] = createResource(listFiles);
  const [contacts, { refetch: refetchContacts }] = createResource(listContacts);

  useRefreshEffect(() => {
    void refetchFiles();
    void refetchContacts();
  });

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

  const advancedActive = () =>
    Boolean(dateFrom() || dateTo() || senderId() || sizeMinKb() || sizeMaxKb());

  const clearAdvanced = () => {
    setDateFrom("");
    setDateTo("");
    setSenderId("");
    setSizeMinKb("");
    setSizeMaxKb("");
  };

  const items = createMemo(() => {
    const state: FileFilterState = {
      type: typeFilter(),
      query: search(),
      dateFrom: dateFrom(),
      dateTo: dateTo(),
      senderId: senderId(),
      sizeMinKb: sizeMinKb(),
      sizeMaxKb: sizeMaxKb(),
    };
    return applyFileFilters(files() ?? [], state);
  });

  const contactById = (id: string) =>
    (contacts() ?? []).find((c) => c.id === id);

  const FILTERS = [
    { id: "all", label: "全部", icon: "ph-files" },
    { id: "pdf", label: "PDF", icon: "ph-file-pdf" },
    { id: "image", label: "图片", icon: "ph-file-image" },
    { id: "doc", label: "Doc", icon: "ph-file-text" },
    { id: "spreadsheet", label: "表格", icon: "ph-file-xls" },
  ] as const;

  return (
    <div style={{ animation: "view-enter 0.3s var(--ease-out) both" }}>
      <header style={{ padding: "var(--space-5)" }}>
        <h2
          style={{
            "font-family": "var(--font-display)",
            "font-size": "var(--text-h3)",
            "font-weight": "800",
            margin: 0,
          }}
        >
          Files
        </h2>
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
        <input
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          placeholder="搜索文件名…"
          style={{
            flex: "1 1 200px",
            padding: "8px 14px",
            background: "var(--paper-light)",
            border: "0.5px solid var(--border)",
            "border-radius": "var(--radius-pill)",
            "font-size": "var(--text-body-sm)",
          }}
        />
        <For each={FILTERS}>
          {(f) => (
            <button
              onClick={() => setTypeFilter(f.id)}
              style={{
                padding: "4px 12px",
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
            "border-radius": "var(--radius-pill)",
            background: showAdvanced() || advancedActive()
              ? "var(--palm-soft)"
              : "var(--paper-mid)",
            color: showAdvanced() || advancedActive()
              ? "var(--palm)"
              : "var(--text-secondary)",
            "font-size": "var(--text-caption)",
            "font-weight": advancedActive() ? "700" : "500",
            display: "flex",
            "align-items": "center",
            gap: "4px",
            "margin-left": "auto",
          }}
        >
          <Icon name="ph-funnel" size={11} />
          高级
          <Show when={advancedActive()}>
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
              ·
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
            "align-items": "center",
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
              style={advancedInput}
            />
          </label>
          <label style={advancedLabel}>
            <span>到</span>
            <input
              type="date"
              value={dateTo()}
              onInput={(e) => setDateTo(e.currentTarget.value)}
              style={advancedInput}
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
              style={advancedInput}
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
              style={advancedInput}
            />
          </label>
          <Show when={advancedActive()}>
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

      <Show
        when={!files.error}
        fallback={
          <ErrorState
            title="文件加载失败"
            message={String(files.error ?? "")}
            retry={() => void refetchFiles()}
          />
        }
      >
        <></>
      </Show>
      <Show
        when={items().length > 0}
        fallback={<Empty icon="ph-paperclip" title="没有文件" />}
      >
        <div
          style={{
            "max-width": "920px",
            margin: "0 auto",
            padding: "0 var(--space-5) var(--space-5)",
          }}
        >
          <div
            style={{
              display: "grid",
              "grid-template-columns": "repeat(auto-fill, minmax(180px, 1fr))",
              gap: "var(--space-3)",
            }}
          >
            <For each={items()}>
              {(f) => {
                const c = contactById(f.pid);
                return (
                  <button
                    onClick={() => {
                      setSelectedFileId(f.id);
                      setDetailOpen(true);
                    }}
                    style={{
                      padding: "var(--space-3)",
                      background: "var(--paper-light)",
                      border: "0.5px solid var(--border)",
                      "border-radius": "var(--radius-md)",
                      "text-align": "left",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "var(--paper-mid)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "var(--paper-light)")
                    }
                  >
                    <div
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
                      }}
                    >
                      <Icon
                        name={
                          f.type === "pdf"
                            ? "ph-file-pdf"
                            : f.type === "image"
                              ? "ph-file-image"
                              : "ph-file-text"
                        }
                        size={40}
                      />
                    </div>
                    <strong
                      style={{
                        "font-size": "var(--text-body-sm)",
                        "white-space": "nowrap",
                        overflow: "hidden",
                        "text-overflow": "ellipsis",
                        display: "block",
                      }}
                    >
                      {f.name}
                    </strong>
                    <p
                      style={{
                        margin: "2px 0 0",
                        "font-size": "var(--text-micro)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {(f.size / 1024).toFixed(0)} KB · {c?.name ?? "—"}
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
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}

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
