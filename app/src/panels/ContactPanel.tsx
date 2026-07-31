/** ContactPanel — right-side detail panel with tabs.
 * Tabs: Timeline · Notes · Files · Insights · Network · Calendar
 */

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import {
  listMessages,
  getContact,
  listEvents,
  listFiles,
  listContactNotes,
} from "../stores/data";
import { setDetailOpen, setSelectedContactId, contactTab, setContactTab, setSelectedMessageId } from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { STAGE_COLOR, STAGE_LABEL, STAGE_SUGGEST } from "../utils/labels";
import { relativeTime } from "../utils/date";
import type { ContactNote } from "../types";

const TABS = ["Timeline", "Notes", "Files", "Insights", "Network", "Calendar"] as const;

export function ContactPanel(props: { contactId: string }) {
  const [contact, { refetch: refetchContact }] = createResource(
    () => props.contactId,
    getContact
  );
  const [messages] = createResource(listMessages);
  const [events] = createResource(listEvents);
  const [files] = createResource(listFiles);
  const [notes, { mutate: setNotes }] = createResource(
    () => props.contactId,
    (id) => listContactNotes(id)
  );

  const msgs = createMemo(() => (messages() ?? []).filter((m) => m.pid === props.contactId));
  const evts = createMemo(() => (events() ?? []).filter((e) => e.pids.includes(props.contactId)));
  const fls = createMemo(() => (files() ?? []).filter((f) => f.pid === props.contactId));

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        animation: "panel-slide 0.28s var(--ease-out) both",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "var(--space-4) var(--space-5)",
          "border-bottom": "0.5px solid var(--border)",
          display: "flex",
          "align-items": "center",
          gap: "var(--space-3)",
          background: "var(--surface-elevated)",
          position: "sticky",
          top: 0,
          "z-index": 2,
        }}
      >
        <button
          onClick={() => {
            setSelectedContactId(null);
            setDetailOpen(false);
          }}
          aria-label="Close"
          style={{ color: "var(--text-muted)" }}
        >
          <Icon name="ph-arrow-left" size={18} />
        </button>
        <strong style={{ "font-size": "var(--text-body-sm)", "font-weight": "700" }}>
          Contact
        </strong>
      </div>

      {/* Hero */}
      <Show when={contact()}>
        {(c) => (
          <div
            style={{
              padding: "var(--space-6) var(--space-5) var(--space-4)",
              "text-align": "center",
              "border-bottom": "0.5px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", "justify-content": "center", "margin-bottom": "var(--space-3)" }}>
              <Avatar name={c().name} src={c().avatar} size={72} />
            </div>
            <h2
              style={{
                "font-family": "var(--font-display)",
                "font-size": "var(--text-h4)",
                "font-weight": "800",
                margin: 0,
                "margin-bottom": "2px",
              }}
            >
              {c().name}
            </h2>
            <Show when={c().title || c().company}>
              <p
                style={{
                  "font-size": "var(--text-caption)",
                  color: "var(--text-secondary)",
                  margin: 0,
                }}
              >
                {c().title}{c().title && c().company ? " · " : ""}{c().company}
              </p>
            </Show>
            <div
              style={{
                display: "flex",
                gap: "var(--space-2)",
                "justify-content": "center",
                "margin-top": "var(--space-3)",
                "flex-wrap": "wrap",
              }}
            >
              <Tag color={STAGE_COLOR[c().stage]}>{STAGE_LABEL[c().stage]}</Tag>
              <Tag>{`健康度 ${c().health}`}</Tag>
              <Tag>{c().lc}</Tag>
            </div>
            <Show when={c().notes}>
              <p
                style={{
                  "margin-top": "var(--space-4)",
                  "font-size": "var(--text-body-sm)",
                  color: "var(--text-secondary)",
                  "line-height": 1.5,
                  "text-align": "left",
                  background: "var(--paper-mid)",
                  padding: "var(--space-3) var(--space-4)",
                  "border-radius": "var(--radius-md)",
                }}
              >
                {c().notes}
              </p>
            </Show>
            <p
              style={{
                "margin-top": "var(--space-3)",
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
              }}
            >
              {STAGE_SUGGEST[c().stage]}
            </p>
          </div>
        )}
      </Show>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: "var(--space-1)",
          padding: "var(--space-2) var(--space-5)",
          "border-bottom": "0.5px solid var(--border)",
          "overflow-x": "auto",
        }}
      >
        <For each={TABS}>
          {(t) => (
            <button
              onClick={() => setContactTab(t)}
              style={{
                padding: "6px 12px",
                "border-radius": "var(--radius-pill)",
                background: contactTab() === t ? "var(--palm-soft)" : "transparent",
                color: contactTab() === t ? "var(--palm)" : "var(--text-secondary)",
                "font-weight": contactTab() === t ? "700" : "500",
                "font-size": "var(--text-caption)",
                "white-space": "nowrap",
              }}
            >
              {t}
            </button>
          )}
        </For>
      </div>

      {/* Tab content */}
      <div
        style={{
          flex: 1,
          "overflow-y": "auto",
          padding: "var(--space-4) var(--space-5)",
        }}
      >
        <Show when={contactTab() === "Timeline"}>
          <TimelineTab messages={msgs()} onOpen={(id) => { setSelectedContactId(null); setSelectedMessageId(id); }} />
        </Show>
        <Show when={contactTab() === "Notes"}>
          <NotesTab
            notes={notes() ?? []}
            contactId={props.contactId}
            onAdd={(n) => setNotes((prev) => [n, ...(prev ?? [])])}
            onRemove={(id) => setNotes((prev) => (prev ?? []).filter((x) => x.id !== id))}
            onReload={refetchContact}
          />
        </Show>
        <Show when={contactTab() === "Files"}>
          <FilesTab files={fls()} />
        </Show>
        <Show when={contactTab() === "Insights"}>
          <InsightsTab contactId={props.contactId} />
        </Show>
        <Show when={contactTab() === "Network"}>
          <NetworkTab contactId={props.contactId} />
        </Show>
        <Show when={contactTab() === "Calendar"}>
          <CalendarTab events={evts()} />
        </Show>
      </div>
    </div>
  );
}

function Tag(props: { color?: string; children: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        background: props.color ? `${props.color}20` : "var(--paper-mid)",
        color: props.color ?? "var(--text-secondary)",
        "border-radius": "var(--radius-pill)",
        "font-size": "var(--text-micro)",
        "font-weight": "600",
      }}
    >
      {props.children}
    </span>
  );
}

function TimelineTab(props: { messages: ReturnType<typeof listMessages> extends Promise<infer T> ? T : never[]; onOpen: (id: string) => void }) {
  return (
    <div>
      <For each={props.messages}>
        {(m) => (
          <div
            onClick={() => props.onOpen(m.id)}
            style={{
              padding: "var(--space-3) 0",
              "border-bottom": "0.5px solid var(--border)",
              cursor: "pointer",
            }}
          >
            <strong style={{ "font-weight": "700", "font-size": "var(--text-body-sm)" }}>
              {m.subj}
            </strong>
            <p
              style={{
                margin: 0,
                "margin-top": "2px",
                color: "var(--text-secondary)",
                "font-size": "var(--text-caption)",
              }}
            >
              {m.prev}
            </p>
            <span
              style={{
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
                "margin-top": "4px",
                display: "block",
              }}
            >
              {m.tm}
            </span>
          </div>
        )}
      </For>
    </div>
  );
}

function NotesTab(props: {
  notes: ContactNote[];
  contactId: string;
  onAdd: (n: ContactNote) => void;
  onRemove: (id: string) => void;
  onReload: () => void;
}) {
  const [draft, setDraft] = createSignal("");
  const add = async () => {
    const body = draft().trim();
    if (!body) return;
    const n: ContactNote = {
      id: `cn_${Math.random().toString(36).slice(2, 10)}`,
      contactId: props.contactId,
      body,
      pinned: false,
      createdAt: new Date().toISOString(),
    };
    const { upsertContactNote } = await import("../stores/data");
    await upsertContactNote(n);
    props.onAdd(n);
    setDraft("");
  };
  return (
    <div>
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          background: "var(--canary)",
          "border-radius": "var(--radius-md)",
          "margin-bottom": "var(--space-4)",
        }}
      >
        <textarea
          value={draft()}
          onInput={(e) => setDraft(e.currentTarget.value)}
          placeholder="Add a note about this contact…"
          rows={3}
          style={{
            width: "100%",
            background: "transparent",
            border: "none",
            outline: "none",
            resize: "vertical",
            "font-family": "var(--font-body)",
            "font-size": "var(--text-body-sm)",
            color: "var(--text-primary)",
          }}
        />
        <div style={{ display: "flex", "justify-content": "flex-end", "margin-top": "var(--space-2)" }}>
          <button
            onClick={add}
            disabled={!draft().trim()}
            style={{
              padding: "6px 16px",
              background: "var(--ink)",
              color: "white",
              "border-radius": "var(--radius-pill)",
              "font-size": "var(--text-caption)",
              "font-weight": "700",
              opacity: draft().trim() ? 1 : 0.4,
            }}
          >
            Save
          </button>
        </div>
      </div>
      <For each={props.notes}>
        {(n) => (
          <div
            style={{
              padding: "var(--space-3)",
              background: "var(--paper-mid)",
              "border-radius": "var(--radius-md)",
              "margin-bottom": "var(--space-2)",
            }}
          >
            <p style={{ margin: 0, "font-size": "var(--text-body-sm)", "white-space": "pre-wrap" }}>{n.body}</p>
            <div
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--space-2)",
                "margin-top": "var(--space-2)",
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
              }}
            >
              <span>{relativeTime(n.createdAt)}</span>
              <button
                onClick={async () => {
                  const { deleteContactNote } = await import("../stores/data");
                  await deleteContactNote(n.id);
                  props.onRemove(n.id);
                }}
                style={{ color: "var(--text-muted)", "margin-left": "auto" }}
              >
                <Icon name="ph-trash" size={12} />
              </button>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function FilesTab(props: { files: ReturnType<typeof listFiles> extends Promise<infer T> ? T : never[] }) {
  return (
    <div>
      <For each={props.files} fallback={<p style={{ color: "var(--text-muted)", "font-size": "var(--text-caption)" }}>暂无附件</p>}>
        {(f) => (
          <div
            style={{
              padding: "var(--space-3)",
              background: "var(--paper-mid)",
              "border-radius": "var(--radius-md)",
              "margin-bottom": "var(--space-2)",
              display: "flex",
              "align-items": "center",
              gap: "var(--space-3)",
            }}
          >
            <Icon name={f.type === "pdf" ? "ph-file-pdf" : f.type === "image" ? "ph-file-image" : "ph-file-text"} size={20} />
            <div style={{ flex: 1, "min-width": 0 }}>
              <div style={{ "font-weight": "600", "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>
                {f.name}
              </div>
              <div style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)" }}>
                {(f.size / 1024).toFixed(0)} KB · {f.type}
              </div>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function InsightsTab(props: { contactId: string }) {
  // placeholder — fill in M5
  return (
    <div>
      <p style={{ color: "var(--text-muted)", "font-size": "var(--text-caption)" }}>
        Insights for {props.contactId} — M5 实装
      </p>
    </div>
  );
}

function NetworkTab(props: { contactId: string }) {
  return (
    <div>
      <p style={{ color: "var(--text-muted)", "font-size": "var(--text-caption)" }}>
        Network for {props.contactId} — M5 实装
      </p>
    </div>
  );
}

function CalendarTab(props: { events: ReturnType<typeof listEvents> extends Promise<infer T> ? T : never[] }) {
  return (
    <div>
      <For each={props.events} fallback={<p style={{ color: "var(--text-muted)", "font-size": "var(--text-caption)" }}>暂无会议</p>}>
        {(e) => (
          <div
            style={{
              padding: "var(--space-3)",
              "border-left": `3px solid ${e.color}`,
              background: "var(--paper-mid)",
              "border-radius": "var(--radius-md)",
              "margin-bottom": "var(--space-2)",
            }}
          >
            <strong style={{ "font-size": "var(--text-body-sm)" }}>{e.title}</strong>
            <div style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)" }}>
              {new Date(e.dt).toLocaleDateString()} · {e.tm}
            </div>
          </div>
        )}
      </For>
    </div>
  );
}