/** Command palette (⌘K) — fuzzy search across views/actions/contacts/messages/files.
 * Spec: prototype-v11 §3.15.
 */

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import Fuse from "fuse.js";
import {
  listContacts, listMessages, listFiles, listDrafts, listEvents,
} from "../stores/data";
import {
  setCommandPaletteOpen,
  setView,
  setSelectedContactId,
  setDetailOpen,
  setSelectedMessageId,
  setSelectedFileId,
  setSelectedMeetingId,
  setComposeOpen,
  setSelectedDraftId,
} from "../stores/ui";
import { Icon } from "../components/Icon";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: string;
  group: "Views" | "Actions" | "People" | "Messages" | "Files" | "Drafts" | "Meetings";
  run: () => void;
}

const VIEW_COMMANDS: Command[] = [
  { id: "v.gate", label: "Go to Gate (Screener)", icon: "ph-shield-check", group: "Views", run: () => setView("screener") },
  { id: "v.imbox", label: "Go to Imbox", icon: "ph-tray", group: "Views", run: () => setView("imbox") },
  { id: "v.feed", label: "Go to Stream", icon: "ph-newspaper", group: "Views", run: () => setView("feed") },
  { id: "v.paperTrail", label: "Go to Records", icon: "ph-receipt", group: "Views", run: () => setView("paperTrail") },
  { id: "v.contacts", label: "Go to Contacts", icon: "ph-users", group: "Views", run: () => setView("contacts") },
  { id: "v.companies", label: "Go to Companies", icon: "ph-buildings", group: "Views", run: () => setView("companies") },
  { id: "v.calendar", label: "Go to Calendar", icon: "ph-calendar", group: "Views", run: () => setView("calendar") },
  { id: "v.files", label: "Go to Files", icon: "ph-paperclip", group: "Views", run: () => setView("files") },
  { id: "v.drafts", label: "Go to Drafts", icon: "ph-pencil-line", group: "Views", run: () => setView("drafts") },
  { id: "v.followUps", label: "Go to Follow-ups", icon: "ph-bell-ringing", group: "Views", run: () => setView("followUps") },
  { id: "v.clips", label: "Go to Clips", icon: "ph-bookmarks", group: "Views", run: () => setView("clips") },
  { id: "v.insights", label: "Go to Insights", icon: "ph-chart-line-up", group: "Views", run: () => setView("insights") },
  { id: "v.settings", label: "Go to Settings", icon: "ph-gear", group: "Views", run: () => setView("settings") },
];

const ACTION_COMMANDS: Command[] = [
  { id: "a.compose", label: "Compose new message", icon: "ph-pencil-line", group: "Actions", run: () => setComposeOpen(true) },
  { id: "a.contact", label: "Add new contact", icon: "ph-user-plus", group: "Actions", run: () => { setView("contacts"); } },
  { id: "a.task", label: "Add new task", icon: "ph-check-square", group: "Actions", run: () => { setView("contacts"); } },
  { id: "a.event", label: "Create new event", icon: "ph-calendar-plus", group: "Actions", run: () => { setView("calendar"); } },
];

export function CommandPalette() {
  const [query, setQuery] = createSignal("");
  const [cursor, setCursor] = createSignal(0);

  const [contacts] = createResource(listContacts);
  const [messages] = createResource(listMessages);
  const [files] = createResource(listFiles);
  const [drafts] = createResource(listDrafts);
  const [events] = createResource(listEvents);

  const contactCmds = createMemo<Command[]>(() =>
    (contacts() ?? []).slice(0, 30).map((c) => ({
      id: `c.${c.id}`,
      label: c.name,
      hint: c.company || c.emails[0]?.value,
      icon: "ph-user",
      group: "People",
      run: () => {
        setView("contacts");
        setSelectedContactId(c.id);
        setDetailOpen(true);
      },
    }))
  );

  const messageCmds = createMemo<Command[]>(() =>
    (messages() ?? []).slice(0, 30).map((m) => ({
      id: `m.${m.id}`,
      label: m.subj,
      hint: m.prev,
      icon: "ph-envelope",
      group: "Messages",
      run: () => {
        setSelectedMessageId(m.id);
        setDetailOpen(true);
      },
    }))
  );

  const fileCmds = createMemo<Command[]>(() =>
    (files() ?? []).slice(0, 20).map((f) => ({
      id: `f.${f.id}`,
      label: f.name,
      hint: `${f.type} · ${(f.size / 1024).toFixed(0)} KB`,
      icon: f.type === "pdf" ? "ph-file-pdf" : f.type === "image" ? "ph-file-image" : "ph-file-text",
      group: "Files",
      run: () => {
        setSelectedFileId(f.id);
        setDetailOpen(true);
      },
    }))
  );

  const draftCmds = createMemo<Command[]>(() =>
    (drafts() ?? []).slice(0, 15).map((d) => ({
      id: `d.${d.id}`,
      label: d.subject || "(无主题)",
      hint: `${d.status} · to ${d.recipient}`,
      icon: "ph-file-text",
      group: "Drafts",
      run: () => {
        setSelectedDraftId(d.id);
        setDetailOpen(true);
      },
    }))
  );

  const eventCmds = createMemo<Command[]>(() =>
    (events() ?? []).slice(0, 15).map((e) => ({
      id: `e.${e.id}`,
      label: e.title,
      hint: `${new Date(e.dt).toLocaleDateString()} · ${e.tm}`,
      icon: "ph-calendar-blank",
      group: "Meetings",
      run: () => {
        setSelectedMeetingId(e.id);
        setDetailOpen(true);
      },
    }))
  );

  const allCommands = createMemo<Command[]>(() => [
    ...VIEW_COMMANDS,
    ...ACTION_COMMANDS,
    ...contactCmds(),
    ...messageCmds(),
    ...fileCmds(),
    ...draftCmds(),
    ...eventCmds(),
  ]);

  const fuse = createMemo(() => new Fuse(allCommands(), {
    keys: ["label", "hint", "group"],
    threshold: 0.3,
    ignoreLocation: true,
  }));

  const results = createMemo<Command[]>(() => {
    const q = query().trim();
    if (!q) return allCommands().slice(0, 12);
    return fuse().search(q).slice(0, 20).map((r) => r.item);
  });

  const grouped = createMemo(() => {
    const groups: Record<string, Command[]> = {};
    for (const c of results()) {
      (groups[c.group] ||= []).push(c);
    }
    return groups;
  });

  const flatResults = createMemo(() => results());
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
          width: "600px",
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
            placeholder="Search views, actions, contacts, messages…"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", "font-size": "var(--text-body)" }}
          />
          <kbd style={kbdStyle}>esc</kbd>
        </div>
        <ul style={{ "list-style": "none", margin: 0, padding: "var(--space-2)", "max-height": "60vh", "overflow-y": "auto" }}>
          <Show when={flatResults().length > 0} fallback={
            <li style={{ padding: "var(--space-4)", color: "var(--text-muted)", "font-size": "var(--text-caption)", "text-align": "center" }}>
              无结果
            </li>
          }>
            <For each={Object.keys(grouped())}>
              {(group) => (
                <>
                  <li
                    style={{
                      "font-size": "var(--text-micro)",
                      color: "var(--text-muted)",
                      "font-weight": "700",
                      padding: "var(--space-1) var(--space-3)",
                      "letter-spacing": "0.04em",
                      "text-transform": "uppercase",
                    }}
                  >
                    {group}
                  </li>
                  <For each={grouped()[group]}>
                    {(c) => {
                      const idx = flatResults().indexOf(c);
                      return (
                        <li>
                          <button
                            onClick={() => run(c)}
                            onMouseEnter={() => setCursor(idx)}
                            style={{
                              display: "flex",
                              "align-items": "center",
                              gap: "var(--space-3)",
                              width: "100%",
                              padding: "var(--space-2) var(--space-3)",
                              "border-radius": "var(--radius-md)",
                              background: idx === cursor() ? "var(--palm-soft)" : "transparent",
                              color: idx === cursor() ? "var(--palm)" : "var(--text-primary)",
                              "text-align": "left",
                            }}
                          >
                            <Icon name={c.icon} size={16} />
                            <span style={{ flex: 1, "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>
                              {c.label}
                            </span>
                            <Show when={c.hint}>
                              <span style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)", "white-space": "nowrap" }}>
                                {c.hint}
                              </span>
                            </Show>
                          </button>
                        </li>
                      );
                    }}
                  </For>
                </>
              )}
            </For>
          </Show>
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