/** CompanyPanel — drill-down for a company.
 * Spec: prototype-v11 §3.4 company view.
 */

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import {
  listCompanyContacts,
  listCompanyMessages,
  listCompanyEvents,
  listCompanyFiles,
} from "../stores/data";
import {
  setDetailOpen,
  setSelectedCompanyName,
  setSelectedContactId,
  setSelectedMessageId,
  setSelectedFileId,
} from "../stores/ui";
import { Avatar } from "../components/Avatar";
import { Empty, ErrorState } from "../components/Empty";
import { Icon } from "../components/Icon";
import { SkeletonList } from "../components/Skeleton";
import { relativeTime, formatDate } from "../utils/date";
import type { Contact, Message, FileItem, CalendarEvent } from "../types";

const TABS = [
  "People",
  "Communications",
  "Files",
  "Meetings",
  "Insights",
] as const;

export function CompanyPanel(props: { companyName: string }) {
  const [contacts, { refetch: refetchContacts }] = createResource(
    () => props.companyName,
    listCompanyContacts,
  );

  const people = createMemo(() => contacts() ?? []);
  const contactIds = createMemo(() => people().map((c) => c.id));

  const [messages, { refetch: refetchMessages }] = createResource(
    contactIds,
    listCompanyMessages,
  );
  const [files, { refetch: refetchFiles }] = createResource(
    contactIds,
    listCompanyFiles,
  );
  const [events, { refetch: refetchEvents }] = createResource(
    contactIds,
    listCompanyEvents,
  );

  const [tab, setTab] = createSignal<(typeof TABS)[number]>("People");

  const msgs = createMemo(() => messages() ?? []);
  const evts = createMemo(() => events() ?? []);
  const fls = createMemo(() => files() ?? []);

  const anyPending = createMemo(
    () =>
      contacts.state === "pending" ||
      messages.state === "pending" ||
      files.state === "pending" ||
      events.state === "pending",
  );
  const anyError = createMemo(
    () =>
      contacts.state === "errored" ||
      messages.state === "errored" ||
      files.state === "errored" ||
      events.state === "errored",
  );
  const retryAll = () => {
    void refetchContacts();
    void refetchMessages();
    void refetchFiles();
    void refetchEvents();
  };

  const openContact = (id: string) => {
    setSelectedCompanyName(null);
    setSelectedContactId(id);
  };

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
            setSelectedCompanyName(null);
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
          Company
        </strong>
      </div>

      <div
        style={{
          padding: "var(--space-6) var(--space-5) var(--space-4)",
          "text-align": "center",
          "border-bottom": "0.5px solid var(--border)",
        }}
      >
        <div
          style={{
            width: "64px",
            height: "64px",
            "border-radius": "var(--radius-lg)",
            background: "var(--paper-mid)",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            margin: "0 auto var(--space-3)",
            color: "var(--palm)",
          }}
        >
          <Icon name="ph-buildings" size={28} />
        </div>
        <h2
          style={{
            "font-family": "var(--font-display)",
            "font-size": "var(--text-h4)",
            "font-weight": "800",
            margin: 0,
            "margin-bottom": "var(--space-2)",
          }}
        >
          {props.companyName}
        </h2>
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            "justify-content": "center",
            color: "var(--text-secondary)",
            "font-size": "var(--text-caption)",
          }}
        >
          <span>
            <Icon name="ph-users" size={11} /> {people().length} 人
          </span>
          <span>
            <Icon name="ph-envelope" size={11} /> {msgs().length} 消息
          </span>
          <span>
            <Icon name="ph-calendar-blank" size={11} /> {evts().length} 会议
          </span>
          <span>
            <Icon name="ph-paperclip" size={11} /> {fls().length} 文件
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "var(--space-1)",
          padding: "var(--space-2) var(--space-3)",
          "border-bottom": "0.5px solid var(--border)",
          background: "var(--paper-light)",
          overflow: "auto",
        }}
      >
        <For each={TABS}>
          {(t) => (
            <button
              onClick={() => setTab(t)}
              style={{
                padding: "6px 12px",
                "border-radius": "var(--radius-pill)",
                "font-size": "var(--text-caption)",
                "font-weight": "700",
                border: "none",
                background: tab() === t ? "var(--palm)" : "transparent",
                color: tab() === t ? "white" : "var(--text-secondary)",
                cursor: "pointer",
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
          overflow: "auto",
          padding: "var(--space-4) var(--space-5)",
        }}
      >
        <Show when={anyPending()}>
          <SkeletonList count={6} />
        </Show>
        <Show when={anyError()}>
          <ErrorState
            title="加载失败"
            message="无法读取公司数据，请重试。"
            retry={retryAll}
          />
        </Show>
        <Show when={!anyPending() && !anyError()}>
          <Show when={tab() === "People"}>
            <PeopleTab people={people()} onOpen={openContact} />
          </Show>
          <Show when={tab() === "Communications"}>
            <CommunicationsTab
              msgs={msgs()}
              people={people()}
              onOpen={(id) => {
                setSelectedMessageId(id);
              }}
            />
          </Show>
          <Show when={tab() === "Files"}>
            <FilesTab
              files={fls()}
              onOpen={(id) => {
                setSelectedFileId(id);
              }}
            />
          </Show>
          <Show when={tab() === "Meetings"}>
            <MeetingsTab events={evts()} people={people()} />
          </Show>
          <Show when={tab() === "Insights"}>
            <InsightsTab
              people={people()}
              msgs={msgs()}
              events={evts()}
              files={fls()}
            />
          </Show>
        </Show>
      </div>
    </div>
  );
}

function PeopleTab(props: { people: Contact[]; onOpen: (id: string) => void }) {
  return (
    <Show
      when={props.people.length > 0}
      fallback={<Empty icon="ph-users" title="没有联系人" />}
    >
      <div
        style={{
          display: "grid",
          gap: "var(--space-3)",
          "grid-template-columns": "repeat(auto-fill, minmax(220px, 1fr))",
        }}
      >
        <For each={props.people}>
          {(c) => (
            <button
              onClick={() => props.onOpen(c.id)}
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--space-3)",
                padding: "var(--space-3)",
                background: "var(--paper-light)",
                border: "0.5px solid var(--border)",
                "border-radius": "var(--radius-lg)",
                cursor: "pointer",
                "text-align": "left",
              }}
            >
              <Avatar name={c.name} src={c.avatar} size={40} />
              <div style={{ "min-width": 0 }}>
                <div
                  style={{
                    "font-weight": "700",
                    "font-size": "var(--text-body-sm)",
                  }}
                >
                  {c.name}
                </div>
                <Show when={c.title}>
                  <div
                    style={{
                      "font-size": "var(--text-caption)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {c.title}
                  </div>
                </Show>
                <Show when={c.emails[0]}>
                  {(email) => (
                    <div
                      style={{
                        "font-size": "var(--text-micro)",
                        color: "var(--text-muted)",
                        overflow: "hidden",
                        "text-overflow": "ellipsis",
                        "white-space": "nowrap",
                      }}
                    >
                      {email().value}
                    </div>
                  )}
                </Show>
              </div>
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}

function CommunicationsTab(props: {
  msgs: Message[];
  people: Contact[];
  onOpen: (id: string) => void;
}) {
  const byDate = () =>
    [...props.msgs].sort(
      (a, b) => new Date(b.st).getTime() - new Date(a.st).getTime(),
    );
  const nameOf = (pid: string) =>
    props.people.find((c) => c.id === pid)?.name ?? "";

  return (
    <Show
      when={props.msgs.length > 0}
      fallback={<Empty icon="ph-envelope" title="没有邮件" />}
    >
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "var(--space-2)",
        }}
      >
        <For each={byDate()}>
          {(m) => (
            <button
              onClick={() => props.onOpen(m.id)}
              style={{
                padding: "var(--space-3) var(--space-4)",
                background: m.unread
                  ? "var(--palm-soft)"
                  : "var(--paper-light)",
                border: "0.5px solid var(--border)",
                "border-radius": "var(--radius-lg)",
                cursor: "pointer",
                "text-align": "left",
              }}
            >
              <div
                style={{
                  display: "flex",
                  "justify-content": "space-between",
                  "margin-bottom": "2px",
                }}
              >
                <span
                  style={{
                    "font-weight": m.unread ? "700" : "600",
                    "font-size": "var(--text-body-sm)",
                  }}
                >
                  {m.subj || "(无主题)"}
                </span>
                <span
                  style={{
                    "font-size": "var(--text-micro)",
                    color: "var(--text-muted)",
                  }}
                >
                  {relativeTime(m.st)}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  "align-items": "center",
                  gap: "var(--space-2)",
                  "font-size": "var(--text-caption)",
                  color: "var(--text-secondary)",
                }}
              >
                <span
                  style={{
                    "font-size": "var(--text-micro)",
                    "font-weight": "700",
                    color:
                      m.direction === "out"
                        ? "var(--palm)"
                        : "var(--text-muted)",
                    "text-transform": "uppercase",
                    "letter-spacing": "0.02em",
                  }}
                >
                  {m.direction === "out" ? "To" : "From"}
                </span>
                <span>{nameOf(m.pid)}</span>
              </div>
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}

function FilesTab(props: { files: FileItem[]; onOpen: (id: string) => void }) {
  const iconForType = (type: string) => {
    if (type === "pdf") return "ph-file-pdf";
    if (type === "image") return "ph-file-image";
    return "ph-file-text";
  };

  return (
    <Show
      when={props.files.length > 0}
      fallback={
        <Empty icon="ph-files" title="暂无附件" description="该公司没有附件。" />
      }
    >
      <div
        style={{
          display: "grid",
          gap: "var(--space-3)",
          "grid-template-columns": "repeat(auto-fill, minmax(160px, 1fr))",
        }}
      >
        <For each={props.files}>
          {(f) => (
            <button
              onClick={() => props.onOpen(f.id)}
              style={{
                display: "flex",
                "flex-direction": "column",
                "align-items": "center",
                gap: "var(--space-3)",
                width: "100%",
                padding: "var(--space-3)",
                background: "var(--paper-mid)",
                "border-radius": "var(--radius-md)",
                "text-align": "center",
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
              <Icon name={iconForType(f.type)} size={40} />
              <div style={{ width: "100%", "min-width": 0 }}>
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
                    "margin-top": "var(--space-1)",
                  }}
                >
                  {(f.size / 1024).toFixed(0)} KB · {f.type}
                </div>
              </div>
            </button>
          )}
        </For>
      </div>
    </Show>
  );
}

function MeetingsTab(props: { events: CalendarEvent[]; people: Contact[] }) {
  const byDate = (): CalendarEvent[] =>
    [...props.events].sort(
      (a, b) => new Date(a.dt).getTime() - new Date(b.dt).getTime(),
    );
  const nameOf = (pid: string) =>
    props.people.find((c) => c.id === pid)?.name ?? "";

  return (
    <Show
      when={props.events.length > 0}
      fallback={<Empty icon="ph-calendar-blank" title="没有会议" />}
    >
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "var(--space-2)",
        }}
      >
        <For each={byDate()}>
          {(ev: CalendarEvent) => (
            <div
              style={{
                padding: "var(--space-3) var(--space-4)",
                background: "var(--paper-light)",
                border: "0.5px solid var(--border)",
                "border-left": `3px solid ${ev.color}`,
                "border-radius": "var(--radius-lg)",
              }}
            >
              <div
                style={{
                  "font-weight": "700",
                  "font-size": "var(--text-body-sm)",
                  "margin-bottom": "2px",
                }}
              >
                {ev.title}
              </div>
              <div
                style={{
                  "font-size": "var(--text-caption)",
                  color: "var(--text-secondary)",
                }}
              >
                {formatDate(ev.dt)} · {ev.tm}
                {ev.location ? ` · ${ev.location}` : ""}
              </div>
              <Show when={ev.pids.length > 0}>
                <div
                  style={{
                    "margin-top": "var(--space-2)",
                    "font-size": "var(--text-micro)",
                    color: "var(--text-muted)",
                  }}
                >
                  {ev.pids.length} 位参与者
                  {ev.pids
                    .map((p: string) => nameOf(p))
                    .filter(Boolean)
                    .join(", ")
                    ? ` · ${ev.pids
                        .map((p: string) => nameOf(p))
                        .filter(Boolean)
                        .join(", ")}`
                    : ""}
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

function InsightsTab(props: {
  people: Contact[];
  msgs: Message[];
  events: CalendarEvent[];
  files: FileItem[];
}) {
  const unread = () => props.msgs.filter((m) => m.unread).length;
  const healthAverage = () => {
    if (props.people.length === 0) return 0;
    const sum = props.people.reduce((acc, c) => acc + (c.health ?? 0), 0);
    return Math.round(sum / props.people.length);
  };

  return (
    <div
      style={{
        display: "grid",
        gap: "var(--space-3)",
        "grid-template-columns": "repeat(auto-fill, minmax(180px, 1fr))",
      }}
    >
      <InsightCard
        label="联系人"
        value={props.people.length.toString()}
        icon="ph-users"
      />
      <InsightCard
        label="邮件"
        value={props.msgs.length.toString()}
        icon="ph-envelope"
      />
      <InsightCard
        label="未读"
        value={unread().toString()}
        icon="ph-envelope-open"
      />
      <InsightCard
        label="会议"
        value={props.events.length.toString()}
        icon="ph-calendar-blank"
      />
      <InsightCard
        label="文件"
        value={props.files.length.toString()}
        icon="ph-paperclip"
      />
      <InsightCard
        label="平均健康度"
        value={`${healthAverage()}%`}
        icon="ph-heart"
      />
    </div>
  );
}

function InsightCard(props: { label: string; value: string; icon: string }) {
  return (
    <div
      style={{
        padding: "var(--space-4)",
        background: "var(--paper-light)",
        border: "0.5px solid var(--border)",
        "border-radius": "var(--radius-lg)",
      }}
    >
      <Icon name={props.icon} size={20} style={{ color: "var(--palm)" }} />
      <div
        style={{
          "margin-top": "var(--space-2)",
          "font-size": "var(--text-h4)",
          "font-weight": "800",
        }}
      >
        {props.value}
      </div>
      <div
        style={{
          "font-size": "var(--text-caption)",
          color: "var(--text-secondary)",
        }}
      >
        {props.label}
      </div>
    </div>
  );
}
