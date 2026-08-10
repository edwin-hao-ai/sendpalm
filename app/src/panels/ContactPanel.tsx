/** ContactPanel — right-side detail panel with tabs.
 * Tabs: Timeline · Notes · Files · Insights · Network · Calendar
 * Spec: prototype-v11 §3.3.
 */

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import {
  getContact,
  listMessages,
  listEvents,
  listFiles,
  listContactNotes,
  listContacts,
  upsertContact,
  upsertContactNote,
  deleteContactNote,
  listTasks,
  listFollowUps,
  listClips,
  upsertTask,
  upsertFollowUp,
  deleteTask,
  deleteFollowUp,
  deleteClip,
} from "../stores/data";
import {
  setDetailOpen,
  setSelectedContactId,
  contactTab,
  setContactTab,
  setSelectedMessageId,
  setSelectedFileId,
  showToast,
  setComposeOpen,
  setComposeContext,
  openCompanyDetail,
} from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { ContactEditModal } from "../components/ContactEditModal";
import { STAGE_COLOR, STAGE_LABEL, STAGE_SUGGEST } from "../utils/labels";
import { relativeTime } from "../utils/date";
import type {
  Contact,
  ContactNote,
  Task,
  FollowUp,
  Clip,
  Message,
} from "../types";
import { uid } from "../utils/id";
import { isoNow } from "../utils/date";
import { useRefreshEffect } from "../utils/gestures";

const TABS = [
  "Timeline",
  "Notes",
  "Files",
  "Tasks",
  "Follow-ups",
  "Clips",
  "Insights",
  "Network",
  "Calendar",
] as const;

export function ContactPanel(props: { contactId: string }) {
  const [contact, { refetch: refetchContact }] = createResource(
    () => props.contactId,
    getContact,
  );
  const [messages, { refetch: refetchMessages }] = createResource(listMessages);
  const [events, { refetch: refetchEvents }] = createResource(listEvents);
  const [files, { refetch: refetchFiles }] = createResource(listFiles);
  const [notes, { mutate: setNotes, refetch: refetchNotes }] = createResource(
    () => props.contactId,
    (id) => listContactNotes(id),
  );
  const [tasks, { refetch: refetchTasks }] = createResource(listTasks);
  const [followUps, { refetch: refetchFU }] = createResource(listFollowUps);
  const [clips, { refetch: refetchClips }] = createResource(listClips);
  const [editing, setEditing] = createSignal(false);

  useRefreshEffect(() => {
    void refetchContact();
    void refetchMessages();
    void refetchEvents();
    void refetchFiles();
    void refetchNotes();
    void refetchTasks();
    void refetchFU();
    void refetchClips();
  });

  const msgs = createMemo(() =>
    (messages() ?? []).filter((m) => m.pid === props.contactId),
  );
  const evts = createMemo(() =>
    (events() ?? []).filter((e) => e.pids.includes(props.contactId)),
  );
  const fls = createMemo(() =>
    (files() ?? []).filter((f) => f.pid === props.contactId),
  );
  const tks = createMemo(() =>
    (tasks() ?? []).filter((t) => t.relatedContactId === props.contactId),
  );
  const fus = createMemo(() => {
    const contactMsgs = new Set(
      (messages() ?? [])
        .filter((m) => m.pid === props.contactId)
        .map((m) => m.id),
    );
    return (followUps() ?? []).filter((f) => contactMsgs.has(f.msgId));
  });
  const cls = createMemo(() =>
    (clips() ?? []).filter((c) => c.contactId === props.contactId),
  );

  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        animation: "panel-slide 0.28s var(--ease-out) both",
      }}
    >
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
        <strong
          style={{ "font-size": "var(--text-body-sm)", "font-weight": "700" }}
        >
          Contact
        </strong>
        <button
          onClick={() => setEditing(true)}
          style={{
            "margin-left": "auto",
            display: "inline-flex",
            "align-items": "center",
            gap: "4px",
            padding: "6px 12px",
            background: "var(--paper-mid)",
            color: "var(--text-secondary)",
            "border-radius": "var(--radius-pill)",
            "font-size": "var(--text-caption)",
            "font-weight": "700",
          }}
        >
          <Icon name="ph-pencil-simple" size={14} />
          编辑
        </button>
        <button
          onClick={() => {
            const c = contact();
            if (!c) return;
            const email = c.emails[0]?.value ?? "";
            setComposeContext({ mode: "new", to: email });
            setComposeOpen(true);
          }}
          style={{
            display: "inline-flex",
            "align-items": "center",
            gap: "4px",
            padding: "6px 12px",
            background: "var(--palm-soft)",
            color: "var(--palm)",
            "border-radius": "var(--radius-pill)",
            "font-size": "var(--text-caption)",
            "font-weight": "700",
          }}
        >
          <Icon name="ph-paper-plane-tilt" size={14} />
          写邮件
        </button>
      </div>

      <Show when={contact()}>
        {(c) => (
          <div
            style={{
              padding: "var(--space-6) var(--space-5) var(--space-4)",
              "text-align": "center",
              "border-bottom": "0.5px solid var(--border)",
            }}
          >
            <div
              style={{
                display: "flex",
                "justify-content": "center",
                "margin-bottom": "var(--space-3)",
              }}
            >
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
            <Show when={c().emails[0]}>
              {(email) => (
                <p
                  style={{
                    "font-size": "var(--text-caption)",
                    color: "var(--text-secondary)",
                    margin: 0,
                  }}
                >
                  {email().value}
                </p>
              )}
            </Show>
            <Show when={c().title || c().company}>
              <p
                style={{
                  "font-size": "var(--text-caption)",
                  color: "var(--text-secondary)",
                  margin: "2px 0 0",
                }}
              >
                {c().title}
                {c().title && c().company ? " · " : ""}
                <Show when={c().company} fallback={c().title ? null : "—"}>
                  <button
                    onClick={() => openCompanyDetail(c().company)}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: "var(--palm)",
                      "font-weight": "600",
                    }}
                  >
                    {c().company}
                  </button>
                </Show>
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
            <div
              style={{
                display: "flex",
                gap: "var(--space-2)",
                "justify-content": "center",
                "margin-top": "var(--space-3)",
              }}
            >
              <button
                onClick={async () => {
                  await upsertContact({ ...c(), notify: !c().notify });
                  await refetchContact();
                }}
                title={c().notify ? "通知已开启" : "通知已关闭"}
                style={{
                  display: "inline-flex",
                  "align-items": "center",
                  gap: "4px",
                  padding: "4px 10px",
                  "border-radius": "var(--radius-pill)",
                  "font-size": "var(--text-micro)",
                  "font-weight": "600",
                  background: c().notify
                    ? "var(--palm-soft)"
                    : "var(--paper-mid)",
                  color: c().notify ? "var(--palm)" : "var(--text-muted)",
                }}
              >
                <Icon
                  name={c().notify ? "ph-bell" : "ph-bell-slash"}
                  size={12}
                />
                {c().notify ? "Notify on" : "Notify off"}
              </button>
              <button
                onClick={async () => {
                  const buckets: Contact["defaultBucket"][] = [
                    "imbox",
                    "feed",
                    "paperTrail",
                  ];
                  const idx = buckets.indexOf(c().defaultBucket);
                  const next = buckets[(idx + 1) % buckets.length] ?? "imbox";
                  await upsertContact({ ...c(), defaultBucket: next });
                  await refetchContact();
                }}
                title="Default bucket"
                style={{
                  display: "inline-flex",
                  "align-items": "center",
                  gap: "4px",
                  padding: "4px 10px",
                  "border-radius": "var(--radius-pill)",
                  "font-size": "var(--text-micro)",
                  "font-weight": "600",
                  background: "var(--paper-mid)",
                  color: "var(--text-secondary)",
                }}
              >
                <Icon name="ph-tray" size={12} />
                {c().defaultBucket === "imbox"
                  ? "Imbox"
                  : c().defaultBucket === "feed"
                    ? "Stream"
                    : "Records"}
              </button>
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
              data-testid={`contact-tab-${t.toLowerCase()}`}
              onClick={() => setContactTab(t)}
              style={{
                padding: "6px 12px",
                "border-radius": "var(--radius-pill)",
                background:
                  contactTab() === t ? "var(--palm-soft)" : "transparent",
                color:
                  contactTab() === t ? "var(--palm)" : "var(--text-secondary)",
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

      <div
        style={{
          flex: 1,
          "overflow-y": "auto",
          padding: "var(--space-4) var(--space-5)",
        }}
      >
        <Show when={contactTab() === "Timeline"}>
          <TimelineTab
            messages={msgs()}
            onOpen={(id) => {
              setSelectedContactId(null);
              setSelectedMessageId(id);
            }}
          />
        </Show>
        <Show when={contactTab() === "Notes"}>
          <NotesTab
            notes={notes() ?? []}
            contactId={props.contactId}
            onAdd={(n) => setNotes((prev) => [n, ...(prev ?? [])])}
            onRemove={(id) =>
              setNotes((prev) => (prev ?? []).filter((x) => x.id !== id))
            }
            onPinChange={(n) =>
              setNotes((prev) =>
                (prev ?? []).map((x) => (x.id === n.id ? n : x)),
              )
            }
          />
        </Show>
        <Show when={contactTab() === "Files"}>
          <FilesTab
            files={fls()}
            onOpen={(id) => {
              setSelectedContactId(null);
              setSelectedFileId(id);
            }}
          />
        </Show>
        <Show when={contactTab() === "Insights"}>
          <InsightsTab messages={msgs()} contact={contact() ?? null} />
        </Show>
        <Show when={contactTab() === "Network"}>
          <NetworkTab contactId={props.contactId} />
        </Show>
        <Show when={contactTab() === "Calendar"}>
          <CalendarTab events={evts()} />
        </Show>
        <Show when={contactTab() === "Tasks"}>
          <TasksTab
            tasks={tks()}
            contactId={props.contactId}
            onChange={refetchTasks}
          />
        </Show>
        <Show when={contactTab() === "Follow-ups"}>
          <FollowUpsTab
            followUps={fus()}
            messages={msgs()}
            onChange={refetchFU}
          />
        </Show>
        <Show when={contactTab() === "Clips"}>
          <ClipsTab clips={cls()} onChange={refetchClips} />
        </Show>
      </div>
      <Show when={editing() && contact()}>
        <ContactEditModal
          contact={contact()!}
          isNew={false}
          onClose={() => setEditing(false)}
          onSave={async (c) => {
            await upsertContact(c);
            setEditing(false);
            showToast({ message: "联系人已保存", kind: "success" });
          }}
        />
      </Show>
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

function TimelineTab(props: {
  messages: ReturnType<typeof listMessages> extends Promise<infer T>
    ? T
    : never[];
  onOpen: (id: string) => void;
}) {
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
            <div
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--space-2)",
              }}
            >
              <span
                style={{
                  "font-size": "var(--text-micro)",
                  "font-weight": "700",
                  color:
                    m.direction === "out" ? "var(--palm)" : "var(--text-muted)",
                  "text-transform": "uppercase",
                  "letter-spacing": "0.02em",
                }}
              >
                {m.direction === "out" ? "To" : "From"}
              </span>
              <strong
                style={{
                  "font-weight": "700",
                  "font-size": "var(--text-body-sm)",
                }}
              >
                {m.subj}
              </strong>
            </div>
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
  onPinChange: (n: ContactNote) => void;
}) {
  const [draft, setDraft] = createSignal("");
  const add = async () => {
    const body = draft().trim();
    if (!body) return;
    const n: ContactNote = {
      id: uid("cn"),
      contactId: props.contactId,
      body,
      pinned: false,
      createdAt: isoNow(),
    };
    await upsertContactNote(n);
    props.onAdd(n);
    setDraft("");
  };

  const sortedNotes = createMemo(() =>
    [...props.notes].sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    ),
  );
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
        <div
          style={{
            display: "flex",
            "justify-content": "flex-end",
            "margin-top": "var(--space-2)",
          }}
        >
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
      <For each={sortedNotes()}>
        {(n) => (
          <div
            style={{
              padding: "var(--space-3)",
              background: n.pinned ? "var(--canary)" : "var(--paper-mid)",
              "border-radius": "var(--radius-md)",
              "margin-bottom": "var(--space-2)",
            }}
          >
            <p
              style={{
                margin: 0,
                "font-size": "var(--text-body-sm)",
                "white-space": "pre-wrap",
              }}
            >
              {n.body}
            </p>
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
              <Show when={n.pinned}>
                <Icon name="ph-push-pin" size={11} />
              </Show>
              <button
                onClick={async () => {
                  const updated = { ...n, pinned: !n.pinned };
                  await upsertContactNote(updated);
                  props.onPinChange(updated);
                }}
                style={{ color: "var(--text-muted)", "margin-left": "auto" }}
                title={n.pinned ? "Unpin" : "Pin"}
              >
                <Icon
                  name={n.pinned ? "ph-push-pin-slash" : "ph-push-pin"}
                  size={12}
                />
              </button>
              <button
                onClick={async () => {
                  await deleteContactNote(n.id);
                  props.onRemove(n.id);
                }}
                style={{ color: "var(--text-muted)" }}
                title="Delete"
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

function FilesTab(props: {
  files: ReturnType<typeof listFiles> extends Promise<infer T> ? T : never[];
  onOpen: (id: string) => void;
}) {
  return (
    <div>
      <For
        each={props.files}
        fallback={
          <p
            style={{
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            暂无附件
          </p>
        }
      >
        {(f) => (
          <button
            onClick={() => props.onOpen(f.id)}
            style={{
              display: "flex",
              "align-items": "center",
              gap: "var(--space-3)",
              width: "100%",
              padding: "var(--space-3)",
              background: "var(--paper-mid)",
              "border-radius": "var(--radius-md)",
              "margin-bottom": "var(--space-2)",
              "text-align": "left",
              cursor: "pointer",
              border: "none",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--paper-dark)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "var(--paper-mid)")
            }
          >
            <Icon
              name={
                f.type === "pdf"
                  ? "ph-file-pdf"
                  : f.type === "image"
                    ? "ph-file-image"
                    : "ph-file-text"
              }
              size={20}
            />
            <div style={{ flex: 1, "min-width": 0 }}>
              <div
                style={{
                  "font-weight": "600",
                  "white-space": "nowrap",
                  overflow: "hidden",
                  "text-overflow": "ellipsis",
                }}
              >
                {f.name}
              </div>
              <div
                style={{
                  "font-size": "var(--text-micro)",
                  color: "var(--text-muted)",
                }}
              >
                {(f.size / 1024).toFixed(0)} KB · {f.type}
              </div>
            </div>
            <Icon name="ph-arrow-right" size={14} />
          </button>
        )}
      </For>
    </div>
  );
}

function InsightsTab(props: {
  messages: ReturnType<typeof listMessages> extends Promise<infer T>
    ? T
    : never[];
  contact: ReturnType<typeof getContact> extends Promise<infer T> ? T : never;
}) {
  const msgCount = () => props.messages.length;
  const last30d = createMemo(() => {
    const cutoff = Date.now() - 30 * 86400_000;
    return props.messages.filter((m) => new Date(m.st).getTime() >= cutoff)
      .length;
  });
  const channels = createMemo(() => {
    const set = new Set<string>();
    const ch = props.contact?.ch;
    if (Array.isArray(ch)) for (const c of ch) set.add(c);
    return [...set];
  });
  return (
    <div style={{ display: "grid", gap: "var(--space-3)" }}>
      <Insight label="总消息数" value={String(msgCount())} icon="ph-envelope" />
      <Insight
        label="最近 30 天"
        value={String(last30d())}
        icon="ph-calendar-blank"
      />
      <Insight
        label="沟通渠道"
        value={channels().join(", ") || "—"}
        icon="ph-share-network"
      />
      <Insight
        label="回复周期"
        value={props.contact?.pattern ?? "—"}
        icon="ph-clock"
      />
    </div>
  );
}

function Insight(props: { label: string; value: string; icon: string }) {
  return (
    <div
      style={{
        padding: "var(--space-3)",
        background: "var(--paper-mid)",
        "border-radius": "var(--radius-md)",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
          "margin-bottom": "var(--space-1)",
        }}
      >
        <Icon name={props.icon} size={14} />
        <span
          style={{
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
            "font-weight": "700",
            "text-transform": "uppercase",
            "letter-spacing": "0.06em",
          }}
        >
          {props.label}
        </span>
      </div>
      <div
        style={{
          "font-size": "var(--text-body-sm)",
          color: "var(--text-primary)",
        }}
      >
        {props.value}
      </div>
    </div>
  );
}

function NetworkTab(props: { contactId: string }) {
  const [contacts] = createResource(() => listContacts());
  const [events] = createResource(() => listEvents());

  const connections = createMemo(() => {
    const list = contacts();
    const c = list?.find((x: { id: string }) => x.id === props.contactId);
    if (!c) return [];
    return (list ?? []).filter(
      (x: { id: string; company: string }) =>
        x.id !== props.contactId && x.company === c.company && c.company,
    );
  });

  const sharedMeetings = createMemo(() => {
    return (events() ?? []).filter(
      (e) => e.pids.includes(props.contactId) && e.pids.length > 1,
    );
  });

  return (
    <div>
      <h4
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-h4)",
          "font-weight": "800",
          margin: "0 0 var(--space-2)",
        }}
      >
        同公司
      </h4>
      <For
        each={connections()}
        fallback={
          <p
            style={{
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            暂无
          </p>
        }
      >
        {(c) => (
          <div
            style={{
              padding: "var(--space-2) 0",
              "border-bottom": "0.5px solid var(--border)",
            }}
          >
            <strong>{c.name}</strong>
            <div
              style={{
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
              }}
            >
              {c.title}
            </div>
          </div>
        )}
      </For>

      <h4
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-h4)",
          "font-weight": "800",
          margin: "var(--space-5) 0 var(--space-2)",
        }}
      >
        共同会议
      </h4>
      <For
        each={sharedMeetings()}
        fallback={
          <p
            style={{
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            暂无
          </p>
        }
      >
        {(e) => (
          <div
            style={{
              padding: "var(--space-2) 0",
              "border-bottom": "0.5px solid var(--border)",
            }}
          >
            <strong>{e.title}</strong>
            <div
              style={{
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
              }}
            >
              {new Date(e.dt).toLocaleDateString()} · {e.pids.length} 位参会人
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function CalendarTab(props: {
  events: ReturnType<typeof listEvents> extends Promise<infer T> ? T : never[];
}) {
  return (
    <div>
      <For
        each={props.events}
        fallback={
          <p
            style={{
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            暂无会议
          </p>
        }
      >
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
            <strong style={{ "font-size": "var(--text-body-sm)" }}>
              {e.title}
            </strong>
            <div
              style={{
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
              }}
            >
              {new Date(e.dt).toLocaleDateString()} · {e.tm}
            </div>
          </div>
        )}
      </For>
    </div>
  );
}

function TasksTab(props: {
  tasks: Task[];
  contactId: string;
  onChange: () => void;
}) {
  const [title, setTitle] = createSignal("");

  const add = async () => {
    const t = title().trim();
    if (!t) return;
    await upsertTask({
      id: uid("tk"),
      title: t,
      status: "todo",
      priority: "normal",
      relatedContactId: props.contactId,
      notes: "",
      createdAt: isoNow(),
    });
    setTitle("");
    props.onChange();
  };

  const toggle = async (task: Task) => {
    await upsertTask({
      ...task,
      status: task.status === "done" ? "todo" : "done",
    });
    props.onChange();
  };

  const remove = async (id: string) => {
    await deleteTask(id);
    props.onChange();
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          "margin-bottom": "var(--space-3)",
        }}
      >
        <input
          value={title()}
          onInput={(e) => setTitle(e.currentTarget.value)}
          placeholder="添加任务…"
          style={{
            flex: 1,
            padding: "8px 12px",
            "border-radius": "var(--radius-md)",
            border: "0.5px solid var(--border)",
            "font-size": "var(--text-body-sm)",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void add();
          }}
        />
        <button
          onClick={() => void add()}
          style={{
            padding: "8px 14px",
            background: "var(--palm)",
            color: "white",
            "border-radius": "var(--radius-pill)",
            "font-weight": "700",
            "font-size": "var(--text-caption)",
          }}
        >
          添加
        </button>
      </div>
      <For
        each={props.tasks}
        fallback={
          <p
            style={{
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            暂无任务
          </p>
        }
      >
        {(t) => (
          <div
            style={{
              display: "flex",
              "align-items": "center",
              gap: "var(--space-2)",
              padding: "var(--space-2) 0",
              "border-bottom": "0.5px solid var(--border)",
            }}
          >
            <input
              type="checkbox"
              checked={t.status === "done"}
              onChange={() => void toggle(t)}
              style={{ "accent-color": "var(--palm)" }}
            />
            <span
              style={{
                flex: 1,
                "font-size": "var(--text-body-sm)",
                "text-decoration":
                  t.status === "done" ? "line-through" : "none",
                color:
                  t.status === "done"
                    ? "var(--text-muted)"
                    : "var(--text-primary)",
              }}
            >
              {t.title}
            </span>
            <button
              onClick={() => void remove(t.id)}
              style={{ color: "var(--text-muted)" }}
              aria-label="删除"
            >
              <Icon name="ph-trash" size={14} />
            </button>
          </div>
        )}
      </For>
    </div>
  );
}

function FollowUpsTab(props: {
  followUps: FollowUp[];
  messages: Message[];
  onChange: () => void;
}) {
  const msgMap = createMemo(() => {
    const map = new Map<string, Message>();
    for (const m of props.messages) map.set(m.id, m);
    return map;
  });

  const markDone = async (f: FollowUp) => {
    await upsertFollowUp({ ...f, status: "done" });
    props.onChange();
  };

  const remove = async (id: string) => {
    await deleteFollowUp(id);
    props.onChange();
  };

  return (
    <div>
      <For
        each={props.followUps}
        fallback={
          <p
            style={{
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            暂无跟进
          </p>
        }
      >
        {(f) => {
          const m = msgMap().get(f.msgId);
          return (
            <div
              style={{
                padding: "var(--space-3) 0",
                "border-bottom": "0.5px solid var(--border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--space-2)",
                }}
              >
                <span
                  style={{
                    "font-size": "var(--text-micro)",
                    "font-weight": "700",
                    color:
                      f.status === "done"
                        ? "var(--text-muted)"
                        : new Date(f.dueAt) <= new Date()
                          ? "var(--danger)"
                          : "var(--palm)",
                  }}
                >
                  {f.status === "done" ? "已完成" : relativeTime(f.dueAt)}
                </span>
                {f.note && (
                  <span
                    style={{
                      "font-size": "var(--text-micro)",
                      color: "var(--text-muted)",
                    }}
                  >
                    · {f.note}
                  </span>
                )}
              </div>
              <div
                style={{
                  "font-size": "var(--text-body-sm)",
                  "font-weight": "600",
                  "margin-top": "2px",
                }}
              >
                {m?.subj || "(无主题)"}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-2)",
                  "margin-top": "var(--space-2)",
                }}
              >
                <Show when={f.status !== "done"}>
                  <button
                    onClick={() => void markDone(f)}
                    style={{
                      "font-size": "var(--text-micro)",
                      color: "var(--palm)",
                      "font-weight": "700",
                    }}
                  >
                    标记完成
                  </button>
                </Show>
                <button
                  onClick={() => void remove(f.id)}
                  style={{
                    "font-size": "var(--text-micro)",
                    color: "var(--text-muted)",
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          );
        }}
      </For>
    </div>
  );
}

function ClipsTab(props: { clips: Clip[]; onChange: () => void }) {
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    showToast({ message: "已复制", kind: "success" });
  };

  const remove = async (id: string) => {
    await deleteClip(id);
    props.onChange();
  };

  return (
    <div>
      <For
        each={props.clips}
        fallback={
          <p
            style={{
              color: "var(--text-muted)",
              "font-size": "var(--text-caption)",
            }}
          >
            暂无剪藏
          </p>
        }
      >
        {(c) => (
          <div
            style={{
              padding: "var(--space-3) 0",
              "border-bottom": "0.5px solid var(--border)",
            }}
          >
            <p
              style={{
                margin: 0,
                "font-size": "var(--text-body-sm)",
                color: "var(--text-secondary)",
                "line-height": 1.5,
              }}
            >
              “{c.text}”
            </p>
            <div
              style={{
                display: "flex",
                gap: "var(--space-2)",
                "margin-top": "var(--space-2)",
              }}
            >
              <button
                onClick={() => void copy(c.text)}
                style={{
                  "font-size": "var(--text-micro)",
                  color: "var(--palm)",
                  "font-weight": "700",
                }}
              >
                复制
              </button>
              <button
                onClick={() => void remove(c.id)}
                style={{
                  "font-size": "var(--text-micro)",
                  color: "var(--text-muted)",
                }}
              >
                删除
              </button>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
