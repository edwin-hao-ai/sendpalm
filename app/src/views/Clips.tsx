/** Clips view — Today / Earlier groups.
 * Spec: prototype-v11 §3.13 + P4.
 */

import { For, Show, createMemo, createResource } from "solid-js";
import {
  listClips,
  listContacts,
  listMessages,
  deleteClip,
} from "../stores/data";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Empty } from "../components/Empty";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { showToast } from "../stores/ui";
import { isToday, isYesterday, relativeTime } from "../utils/date";
import { useRefreshEffect } from "../utils/gestures";

export function Clips() {
  const [clips, { refetch: refetchClips }] = createResource(listClips);
  const [contacts, { refetch: refetchContacts }] = createResource(listContacts);
  const [messages, { refetch: refetchMessages }] = createResource(listMessages);

  useRefreshEffect(() => {
    void refetchClips();
    void refetchContacts();
    void refetchMessages();
  });

  const grouped = createMemo(() => {
    const all = clips() ?? [];
    const today: typeof all = [];
    const yesterday: typeof all = [];
    const earlier: typeof all = [];
    for (const c of all) {
      if (isToday(c.createdAt)) today.push(c);
      else if (isYesterday(c.createdAt)) yesterday.push(c);
      else earlier.push(c);
    }
    return { today, yesterday, earlier };
  });

  const contactById = (id?: string) =>
    id ? contacts()?.find((c) => c.id === id) : undefined;
  const msgById = (id?: string) =>
    id ? messages()?.find((m) => m.id === id) : undefined;

  const copy = async (text: string) => {
    try {
      await writeText(text);
      showToast({ message: "已复制到剪贴板", kind: "success" });
    } catch {
      showToast({ message: "复制失败", kind: "error" });
    }
  };

  const remove = async (id: string) => {
    await deleteClip(id);
    await refetchClips();
    showToast({ message: "已删除", kind: "info" });
  };

  return (
    <div
      style={{
        padding: "0",
        animation: "view-enter 0.3s var(--ease-out) both",
      }}
    >
      <header
        style={{
          padding: "var(--space-5)",
          "border-bottom": "0.5px solid var(--border)",
        }}
      >
        <h2
          style={{
            "font-family": "var(--font-display)",
            "font-size": "var(--text-h3)",
            "font-weight": "800",
            margin: 0,
          }}
        >
          Clips
        </h2>
        <p
          style={{
            color: "var(--text-secondary)",
            "font-size": "var(--text-caption)",
            margin: "var(--space-1) 0 0",
          }}
        >
          从消息里摘下来的文字片段 · 复制可粘贴
        </p>
      </header>

      <Show
        when={(clips() ?? []).length > 0}
        fallback={
          <Empty
            icon="ph-bookmarks"
            title="还没有 Clip"
            description="在消息面板点 'Clip' 即可保存文字片段。"
          />
        }
      >
        <div
          style={{
            "max-width": "760px",
            margin: "0 auto",
            padding: "var(--space-4) var(--space-5)",
          }}
        >
          <Show when={grouped().today.length > 0}>
            <Group title="Today">
              <For each={grouped().today}>
                {(c) => (
                  <Row
                    c={c}
                    contact={contactById(c.contactId)}
                    msg={msgById(c.msgId)?.subj}
                    onCopy={copy}
                    onRemove={remove}
                  />
                )}
              </For>
            </Group>
          </Show>
          <Show when={grouped().yesterday.length > 0}>
            <Group title="Yesterday">
              <For each={grouped().yesterday}>
                {(c) => (
                  <Row
                    c={c}
                    contact={contactById(c.contactId)}
                    msg={msgById(c.msgId)?.subj}
                    onCopy={copy}
                    onRemove={remove}
                  />
                )}
              </For>
            </Group>
          </Show>
          <Show when={grouped().earlier.length > 0}>
            <Group title="Earlier">
              <For each={grouped().earlier}>
                {(c) => (
                  <Row
                    c={c}
                    contact={contactById(c.contactId)}
                    msg={msgById(c.msgId)?.subj}
                    onCopy={copy}
                    onRemove={remove}
                  />
                )}
              </For>
            </Group>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function Group(props: { title: string; children: unknown }) {
  return (
    <section style={{ "margin-bottom": "var(--space-5)" }}>
      <h3
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-h4)",
          "font-weight": "800",
          margin: "0 0 var(--space-3)",
        }}
      >
        {props.title}
      </h3>
      {props.children as never}
    </section>
  );
}

function Row(props: {
  c: {
    id: string;
    text: string;
    createdAt: string;
    contactId?: string;
    msgId?: string;
  };
  contact?: { name: string; avatar: string };
  msg?: string;
  onCopy: (t: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div
      style={{
        padding: "var(--space-4)",
        background: "var(--paper-light)",
        border: "0.5px solid var(--border)",
        "border-radius": "var(--radius-md)",
        "margin-bottom": "var(--space-2)",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
          "margin-bottom": "var(--space-2)",
        }}
      >
        <Show when={props.contact}>
          <Avatar
            name={props.contact!.name}
            src={props.contact!.avatar}
            size={24}
          />
          <strong style={{ "font-size": "var(--text-body-sm)" }}>
            {props.contact!.name}
          </strong>
        </Show>
        <Show when={!props.contact}>
          <strong
            style={{
              "font-size": "var(--text-body-sm)",
              color: "var(--text-muted)",
            }}
          >
            Unknown
          </strong>
        </Show>
        <Show when={props.msg}>
          <span
            style={{
              color: "var(--text-muted)",
              "font-size": "var(--text-micro)",
            }}
          >
            · {props.msg}
          </span>
        </Show>
        <span
          style={{
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
            "margin-left": "auto",
          }}
        >
          {relativeTime(props.c.createdAt)}
        </span>
      </div>
      <blockquote
        style={{
          margin: 0,
          padding: "var(--space-3)",
          background: "var(--paper-mid)",
          "border-left": "3px solid var(--blurple)",
          "border-radius": "var(--radius-sm)",
          "font-size": "var(--text-body-sm)",
          "white-space": "pre-wrap",
          "line-height": 1.5,
        }}
      >
        {props.c.text}
      </blockquote>
      <div
        style={{
          display: "flex",
          gap: "var(--space-2)",
          "margin-top": "var(--space-2)",
        }}
      >
        <button
          onClick={() => props.onCopy(props.c.text)}
          style={{
            padding: "4px 10px",
            background: "var(--paper-mid)",
            "border-radius": "var(--radius-pill)",
            "font-size": "var(--text-micro)",
            "font-weight": "600",
            color: "var(--text-secondary)",
            display: "flex",
            "align-items": "center",
            gap: "4px",
          }}
        >
          <Icon name="ph-copy" size={11} /> Copy
        </button>
        <button
          onClick={() => props.onRemove(props.c.id)}
          style={{
            padding: "4px 10px",
            background: "transparent",
            "border-radius": "var(--radius-pill)",
            "font-size": "var(--text-micro)",
            color: "var(--text-muted)",
          }}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
