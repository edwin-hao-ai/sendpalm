/** Command palette (⌘K) — fuzzy search across views/actions/contacts. */

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { listContacts } from "../stores/data";
import { setCommandPaletteOpen, setView, setSelectedContactId, setDetailOpen } from "../stores/ui";
import { Icon } from "../components/Icon";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  run: () => void;
}

const VIEW_COMMANDS: Command[] = [
  { id: "v.imbox", label: "Go to Imbox", icon: "ph-tray", run: () => setView("imbox") },
  { id: "v.gate", label: "Go to Gate (Screener)", icon: "ph-shield-check", run: () => setView("screener") },
  { id: "v.feed", label: "Go to Stream", icon: "ph-newspaper", run: () => setView("feed") },
  { id: "v.paperTrail", label: "Go to Records", icon: "ph-receipt", run: () => setView("paperTrail") },
  { id: "v.contacts", label: "Go to Contacts", icon: "ph-users", run: () => setView("contacts") },
  { id: "v.calendar", label: "Go to Calendar", icon: "ph-calendar", run: () => setView("calendar") },
  { id: "v.files", label: "Go to Files", icon: "ph-paperclip", run: () => setView("files") },
  { id: "v.drafts", label: "Go to Drafts", icon: "ph-pencil-line", run: () => setView("drafts") },
  { id: "v.settings", label: "Go to Settings", icon: "ph-gear", run: () => setView("settings") },
];

export function CommandPalette() {
  const [query, setQuery] = createSignal("");
  const [cursor, setCursor] = createSignal(0);
  const [contacts] = createResource(listContacts);

  const contactCommands = createMemo<Command[]>(() =>
    (contacts() ?? []).slice(0, 5).map((c) => ({
      id: `c.${c.id}`,
      label: c.name,
      hint: c.company,
      icon: "ph-user",
      run: () => {
        setView("contacts");
        setSelectedContactId(c.id);
        setDetailOpen(true);
      },
    }))
  );

  const results = createMemo(() => {
    const q = query().toLowerCase().trim();
    const all: Command[] = [...VIEW_COMMANDS, ...contactCommands()];
    if (!q) return all.slice(0, 8);
    return all.filter((c) => c.label.toLowerCase().includes(q) || c.hint?.toLowerCase().includes(q)).slice(0, 8);
  });

  const run = (c: Command) => {
    c.run();
    setCommandPaletteOpen(false);
    setQuery("");
    setCursor(0);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(35,28,51,0.4)",
        display: "flex",
        "align-items": "flex-start",
        "justify-content": "center",
        "padding-top": "12vh",
        "z-index": "var(--z-modal)",
        animation: "view-enter 0.2s var(--ease-out) both",
      }}
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        style={{
          width: "560px",
          "max-width": "92vw",
          background: "var(--paper-light)",
          "border-radius": "var(--radius-lg)",
          "box-shadow": "var(--shadow-xl)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "var(--space-3)",
            padding: "var(--space-3) var(--space-4)",
            "border-bottom": "0.5px solid var(--border)",
          }}
        >
          <Icon name="ph-magnifying-glass" size={18} />
          <input
            autofocus
            value={query()}
            onInput={(e) => { setQuery(e.currentTarget.value); setCursor(0); }}
            placeholder="Search views, actions, contacts…"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              "font-size": "var(--text-body)",
            }}
          />
          <kbd style={kbdStyle}>esc</kbd>
        </div>
        <ul style={{ "list-style": "none", margin: 0, padding: "var(--space-2)" }}>
          <For each={results()}>
            {(c, i) => (
              <li>
                <button
                  onClick={() => run(c)}
                  onMouseEnter={() => setCursor(i())}
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--space-3)",
                    width: "100%",
                    padding: "var(--space-2) var(--space-3)",
                    "border-radius": "var(--radius-md)",
                    background: i() === cursor() ? "var(--palm-soft)" : "transparent",
                    color: i() === cursor() ? "var(--palm)" : "var(--text-primary)",
                    "text-align": "left",
                  }}
                >
                  <Icon name={c.icon} size={16} />
                  <span style={{ flex: 1 }}>{c.label}</span>
                  <Show when={c.hint}>
                    <span style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)" }}>
                      {c.hint}
                    </span>
                  </Show>
                </button>
              </li>
            )}
          </For>
        </ul>
      </div>
    </div>
  );
}

const kbdStyle = {
  padding: "2px 6px",
  background: "var(--paper-mid)",
  "border-radius": "var(--radius-sm)",
  "font-size": "10px",
  "font-weight": "600",
  color: "var(--text-muted)",
};