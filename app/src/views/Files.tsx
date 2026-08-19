/** Files view — grid with type filters + advanced filters.
 * Spec: prototype-v11 §3.6.
 */

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { listFiles, listContacts, listMessages } from "../stores/data";
import { Empty, ErrorState } from "../components/Empty";
import { Icon } from "../components/Icon";
import { setDetailOpen, setSelectedFileId } from "../stores/ui";
import { relativeTime } from "../utils/date";
import { useRefreshEffect } from "../utils/gestures";

export function Files() {
  const [files, { refetch: refetchFiles }] = createResource(listFiles);
  const [contacts, { refetch: refetchContacts }] = createResource(listContacts);
  const [messages, { refetch: refetchMessages }] = createResource(listMessages);

  useRefreshEffect(() => {
    void refetchFiles();
    void refetchContacts();
    void refetchMessages();
  });

  const [typeFilter, setTypeFilter] = createSignal<
    "all" | "pdf" | "image" | "doc" | "spreadsheet"
  >("all");
  const [search, setSearch] = createSignal("");

  const items = createMemo(() => {
    let out = (files() ?? []).slice();
    if (typeFilter() !== "all")
      out = out.filter((f) => f.type === typeFilter());
    const q = search().trim().toLowerCase();
    if (q) out = out.filter((f) => f.name.toLowerCase().includes(q));
    return out.sort(
      (a, b) => new Date(b.st).getTime() - new Date(a.st).getTime(),
    );
  });

  const contactById = (id: string) =>
    (contacts() ?? []).find((c) => c.id === id);
  const msgById = (id: string) => (messages() ?? []).find((m) => m.id === id);

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
          padding: "0 var(--space-5) var(--space-4)",
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
      </div>

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
                void msgById(f.id);
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
