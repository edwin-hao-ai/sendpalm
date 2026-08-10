/** LiveSearch — topbar dropdown, debounced. */

import {
  For,
  Show,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import { searchIndex, type SearchResult } from "../stores/data";
import { Icon } from "../components/Icon";
import {
  searchQuery,
  setSearchQuery,
  setSearchOpen,
  setView,
  setSelectedContactId,
  setSelectedMessageId,
  setSelectedFileId,
  setDetailOpen,
  setCalendarJumpTo,
} from "../stores/ui";

export function LiveSearch() {
  const [debouncedQuery, setDebouncedQuery] = createSignal("");
  const [cursor, setCursor] = createSignal(0);
  const [results] = createResource(debouncedQuery, searchIndex);

  createEffect(() => {
    const q = searchQuery();
    const id = window.setTimeout(() => setDebouncedQuery(q), 200);
    onCleanup(() => window.clearTimeout(id));
  });

  // Reset cursor whenever the query changes.
  createEffect(() => {
    searchQuery();
    setCursor(0);
  });

  const grouped = createMemo<{
    contacts: SearchResult[];
    messages: SearchResult[];
    files: SearchResult[];
    events: SearchResult[];
  }>(() => {
    const out = { contacts: [], messages: [], files: [], events: [] } as {
      contacts: SearchResult[];
      messages: SearchResult[];
      files: SearchResult[];
      events: SearchResult[];
    };
    for (const r of results() ?? []) {
      const key =
        r.kind === "message"
          ? "messages"
          : r.kind === "event"
            ? "events"
            : (`${r.kind}s` as "contacts" | "files");
      if (out[key].length < 5) out[key].push(r);
    }
    return out;
  });

  // Flatten all results into a single list with their callbacks so keyboard
  // navigation can move through them in order.
  const flatResults = createMemo<
    Array<{
      kind: "message" | "contact" | "file" | "event";
      run: () => void;
      label: string;
    }>
  >(() => {
    const out: Array<{
      kind: "message" | "contact" | "file" | "event";
      run: () => void;
      label: string;
    }> = [];
    for (const c of grouped().contacts) {
      out.push({
        kind: "contact",
        label: c.title,
        run: () => {
          setView("contacts");
          setSelectedContactId(c.id);
          setDetailOpen(true);
        },
      });
    }
    for (const m of grouped().messages) {
      out.push({
        kind: "message",
        label: m.title,
        run: () => {
          setSelectedMessageId(m.id);
          setDetailOpen(true);
        },
      });
    }
    for (const f of grouped().files) {
      out.push({
        kind: "file",
        label: f.title,
        run: () => {
          setSelectedFileId(f.id);
          setDetailOpen(true);
        },
      });
    }
    for (const e of grouped().events) {
      out.push({
        kind: "event",
        label: e.title,
        run: () => {
          const startAt = e.body.split("\n")[0];
          const ts = startAt ? Date.parse(startAt) : NaN;
          if (!Number.isNaN(ts)) setCalendarJumpTo(ts);
          setView("calendar");
          setSearchOpen(false);
          setSearchQuery("");
        },
      });
    }
    return out;
  });

  const close = () => {
    setSearchOpen(false);
    setSearchQuery("");
  };

  const onKey = (e: KeyboardEvent) => {
    const total = flatResults().length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (total > 0) setCursor((c) => (c + 1) % total);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (total > 0) setCursor((c) => (c - 1 + total) % total);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = flatResults()[cursor()];
      if (r) {
        r.run();
        close();
      } else if (searchQuery().trim()) {
        setView("search");
        close();
      }
    } else if (e.key === "Escape") {
      close();
    }
  };

  // Listen for navigation keys globally while the dropdown is open. The
  // topbar input holds focus, so keydown events bubble up to the document.
  createEffect(() => {
    if (typeof document === "undefined") return;
    document.addEventListener("keydown", onKey);
    onCleanup(() => document.removeEventListener("keydown", onKey));
  });

  return (
    <div
      data-testid="live-search-dropdown"
      style={{
        position: "fixed",
        top: "calc(var(--titlebar-height) + var(--topbar-height) + 4px)",
        left: "50%",
        transform: "translateX(-50%)",
        width: "560px",
        "max-width": "92vw",
        background: "var(--paper-light)",
        "border-radius": "var(--radius-lg)",
        "box-shadow": "var(--shadow-xl)",
        "z-index": "var(--z-modal)",
        padding: "var(--space-3)",
        animation: "view-enter 0.2s var(--ease-out) both",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
          padding: "var(--space-2) var(--space-3)",
          "border-bottom": "0.5px solid var(--border)",
          "margin-bottom": "var(--space-2)",
        }}
      >
        <Icon name="ph-magnifying-glass" size={16} />
        <span
          style={{
            flex: 1,
            color: "var(--text-muted)",
            "font-size": "var(--text-caption)",
          }}
        >
          {searchQuery().trim()
            ? `Results for “${searchQuery()}”`
            : "Type to search… ⏎ select · ↑↓ navigate · Esc close"}
        </span>
        <button
          onClick={close}
          aria-label="Close search"
          style={{ color: "var(--text-muted)" }}
        >
          <Icon name="ph-x" size={16} />
        </button>
      </div>

      <Show when={grouped().contacts.length > 0}>
        <Group title="People">
          <For each={grouped().contacts}>
            {(c, i) => (
              <Result
                icon="ph-user"
                title={c.title}
                hint={c.body.slice(0, 60)}
                active={cursor() === i()}
                onClick={() => {
                  setView("contacts");
                  setSelectedContactId(c.id);
                  setDetailOpen(true);
                  setSearchOpen(false);
                }}
              />
            )}
          </For>
        </Group>
      </Show>

      <Show when={grouped().messages.length > 0}>
        <Group title="Messages">
          <For each={grouped().messages}>
            {(m, i) => (
              <Result
                icon="ph-envelope"
                title={m.title}
                hint={m.body.slice(0, 80).replace(/\n/g, " ")}
                active={cursor() === grouped().contacts.length + i()}
                onClick={() => {
                  setSelectedMessageId(m.id);
                  setDetailOpen(true);
                  setSearchOpen(false);
                }}
              />
            )}
          </For>
        </Group>
      </Show>

      <Show when={grouped().files.length > 0}>
        <Group title="Files">
          <For each={grouped().files}>
            {(f, i) => (
              <Result
                icon="ph-paperclip"
                title={f.title}
                hint={f.body}
                active={
                  cursor() ===
                  grouped().contacts.length + grouped().messages.length + i()
                }
                onClick={() => {
                  setSelectedFileId(f.id);
                  setDetailOpen(true);
                  setSearchOpen(false);
                }}
              />
            )}
          </For>
        </Group>
      </Show>

      <Show when={grouped().events.length > 0}>
        <Group title="Events">
          <For each={grouped().events}>
            {(e, i) => {
              const startAt = e.body.split("\n")[0];
              const dateHint =
                startAt && !Number.isNaN(Date.parse(startAt))
                  ? new Date(startAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : undefined;
              return (
                <Result
                  icon="ph-calendar-blank"
                  title={e.title}
                  hint={dateHint}
                  active={
                    cursor() ===
                    grouped().contacts.length +
                      grouped().messages.length +
                      grouped().files.length +
                      i()
                  }
                  onClick={() => {
                    const ts = startAt ? Date.parse(startAt) : NaN;
                    if (!Number.isNaN(ts)) setCalendarJumpTo(ts);
                    setView("calendar");
                    setSearchOpen(false);
                    setSearchQuery("");
                  }}
                />
              );
            }}
          </For>
        </Group>
      </Show>

      <Show
        when={
          grouped().contacts.length +
            grouped().messages.length +
            grouped().files.length +
            grouped().events.length >
          0
        }
      >
        <div />
      </Show>
      <Show
        when={
          grouped().contacts.length +
            grouped().messages.length +
            grouped().files.length +
            grouped().events.length ===
            0 && searchQuery().length > 0
        }
      >
        <div
          style={{
            padding: "var(--space-6) var(--space-5)",
            "text-align": "center",
            color: "var(--text-muted)",
            "font-size": "var(--text-caption)",
          }}
        >
          没有匹配 “{searchQuery()}” 的结果
        </div>
      </Show>

      <Show
        when={
          searchQuery().length === 0 &&
          grouped().contacts.length === 0 &&
          grouped().messages.length === 0 &&
          grouped().files.length === 0 &&
          grouped().events.length === 0
        }
      >
        <div
          style={{
            padding: "var(--space-6) var(--space-5)",
            "text-align": "center",
            color: "var(--text-muted)",
            "font-size": "var(--text-caption)",
          }}
        >
          输入联系人、邮件主题或文件名搜索
        </div>
      </Show>
    </div>
  );
}

function Group(props: { title: string; children: unknown }) {
  return (
    <div style={{ "margin-bottom": "var(--space-2)" }}>
      <div
        style={{
          "font-size": "var(--text-micro)",
          color: "var(--text-muted)",
          "font-weight": "700",
          padding: "var(--space-1) var(--space-3)",
          "letter-spacing": "0.04em",
          "text-transform": "uppercase",
        }}
      >
        {props.title}
      </div>
      {props.children as never}
    </div>
  );
}

function Result(props: {
  icon: string;
  title: string;
  hint?: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={props.onClick}
      style={{
        display: "flex",
        "align-items": "center",
        gap: "var(--space-3)",
        width: "100%",
        padding: "var(--space-2) var(--space-3)",
        "border-radius": "var(--radius-md)",
        "text-align": "left",
        background: props.active ? "var(--palm-soft)" : "transparent",
        "border-left": props.active
          ? "2px solid var(--palm)"
          : "2px solid transparent",
        transition:
          "background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)",
      }}
      onMouseEnter={(e) => {
        if (!props.active)
          e.currentTarget.style.background = "var(--paper-mid)";
      }}
      onMouseLeave={(e) => {
        if (!props.active) e.currentTarget.style.background = "transparent";
      }}
    >
      <Icon
        name={props.icon}
        size={16}
        style={{
          color: props.active ? "var(--palm)" : "var(--text-secondary)",
          "flex-shrink": 0,
        }}
      />
      <span
        style={{
          flex: 1,
          "white-space": "nowrap",
          overflow: "hidden",
          "text-overflow": "ellipsis",
          "font-weight": props.active ? "700" : "600",
          color: props.active ? "var(--text-primary)" : "var(--text-primary)",
        }}
      >
        {props.title}
      </span>
      <Show when={props.hint}>
        <span
          style={{
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
            "white-space": "nowrap",
            "max-width": "180px",
            overflow: "hidden",
            "text-overflow": "ellipsis",
          }}
        >
          {props.hint}
        </span>
      </Show>
    </button>
  );
}
