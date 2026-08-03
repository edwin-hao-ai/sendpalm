/** LiveSearch — topbar dropdown, debounced. */

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { listContacts, listMessages, listFiles } from "../stores/data";
import { Icon } from "../components/Icon";
import {
  setSearchOpen,
  setView,
  setSelectedContactId,
  setSelectedMessageId,
  setSelectedFileId,
  setDetailOpen,
} from "../stores/ui";

export function LiveSearch() {
  const [query, setQuery] = createSignal("");
  const [cursor, setCursor] = createSignal(0);
  const [contacts] = createResource(listContacts);
  const [messages] = createResource(listMessages);
  const [files] = createResource(listFiles);

  const matches = createMemo(() => {
    const q = query().toLowerCase().trim();
    if (!q) {
      return {
        contacts: (contacts() ?? []).slice(0, 3),
        messages: (messages() ?? []).slice(0, 3),
        files: (files() ?? []).slice(0, 3),
      };
    }
    return {
      contacts: (contacts() ?? []).filter((c) => c.name.toLowerCase().includes(q) || c.company.toLowerCase().includes(q)).slice(0, 5),
      messages: (messages() ?? []).filter((m) => m.subj.toLowerCase().includes(q) || m.prev.toLowerCase().includes(q)).slice(0, 5),
      files: (files() ?? []).filter((f) => f.name.toLowerCase().includes(q)).slice(0, 5),
    };
  });

  // Flatten all results into a single list with their callbacks so keyboard
  // navigation can move through them in order.
  const flatResults = createMemo<
    Array<{ kind: "contact" | "message" | "file"; run: () => void; label: string }>
  >(() => {
    const out: Array<{ kind: "contact" | "message" | "file"; run: () => void; label: string }> = [];
    for (const c of matches().contacts) {
      out.push({
        kind: "contact",
        label: c.name,
        run: () => {
          setView("contacts");
          setSelectedContactId(c.id);
          setDetailOpen(true);
        },
      });
    }
    for (const m of matches().messages) {
      out.push({
        kind: "message",
        label: m.subj,
        run: () => {
          setSelectedMessageId(m.id);
          setDetailOpen(true);
        },
      });
    }
    for (const f of matches().files) {
      out.push({
        kind: "file",
        label: f.name,
        run: () => {
          setSelectedFileId(f.id);
          setDetailOpen(true);
        },
      });
    }
    return out;
  });

  const resetCursor = () => setCursor(0);
  const onKey = (e: KeyboardEvent) => {
    const total = flatResults().length;
    if (total === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => (c + 1) % total);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => (c - 1 + total) % total);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = flatResults()[cursor()];
      if (r) {
        r.run();
        setSearchOpen(false);
        setQuery("");
      }
    } else if (e.key === "Escape") {
      setSearchOpen(false);
      setQuery("");
    }
  };

  return (
    <div
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
        <input
          autofocus
          value={query()}
          onInput={(e) => {
            setQuery(e.currentTarget.value);
            resetCursor();
          }}
          onKeyDown={onKey}
          placeholder="Search…  ⏎ 选择  ↑↓ 导航"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            "font-size": "var(--text-body)",
          }}
        />
        <button
          onClick={() => { setSearchOpen(false); setQuery(""); }}
          aria-label="Close search"
          style={{ color: "var(--text-muted)" }}
        >
          <Icon name="ph-x" size={16} />
        </button>
      </div>

      <Show when={matches().contacts.length > 0}>
        <Group title="People">
          <For each={matches().contacts}>
            {(c, i) => (
              <Result
                icon="ph-user"
                title={c.name}
                hint={c.company}
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

      <Show when={matches().messages.length > 0}>
        <Group title="Messages">
          <For each={matches().messages}>
            {(m, i) => (
              <Result
                icon="ph-envelope"
                title={m.subj}
                hint={m.prev}
                active={cursor() === matches().contacts.length + i()}
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

      <Show when={matches().files.length > 0}>
        <Group title="Files">
          <For each={matches().files}>
            {(f, i) => (
              <Result
                icon="ph-paperclip"
                title={f.name}
                hint={f.type}
                active={
                  cursor() ===
                  matches().contacts.length + matches().messages.length + i()
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

      <Show
        when={
          matches().contacts.length +
            matches().messages.length +
            matches().files.length >
          0
        }
      >
        <div />
      </Show>
      <Show
        when={
          matches().contacts.length +
            matches().messages.length +
            matches().files.length ===
            0 &&
          query().length > 0
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
          没有匹配 “{query()}” 的结果
        </div>
      </Show>

      <Show
        when={
          query().length === 0 &&
          matches().contacts.length === 0 &&
          matches().messages.length === 0 &&
          matches().files.length === 0
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
        "border-left": props.active ? "2px solid var(--palm)" : "2px solid transparent",
        transition:
          "background var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)",
      }}
      onMouseEnter={(e) => {
        if (!props.active) e.currentTarget.style.background = "var(--paper-mid)";
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