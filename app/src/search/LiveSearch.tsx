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
          onInput={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search…"
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
            {(c) => (
              <Result
                icon="ph-user"
                title={c.name}
                hint={c.company}
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
            {(m) => (
              <Result
                icon="ph-envelope"
                title={m.subj}
                hint={m.prev}
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
            {(f) => (
              <Result
                icon="ph-paperclip"
                title={f.name}
                hint={f.type}
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

function Result(props: { icon: string; title: string; hint?: string; onClick: () => void }) {
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
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper-mid)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <Icon name={props.icon} size={16} />
      <span style={{ flex: 1, "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>
        {props.title}
      </span>
      <Show when={props.hint}>
        <span style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)", "white-space": "nowrap" }}>
          {props.hint}
        </span>
      </Show>
    </button>
  );
}