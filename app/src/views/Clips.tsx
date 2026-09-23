/** Clips view — Today / Earlier groups.
 * Spec: prototype-v11 §3.13 + P4.
 */

import { For, Show, createEffect, createMemo, createResource } from "solid-js";
import {
  listClips,
  listContacts,
  listMessagesByIdsLight,
  deleteClip,
} from "../stores/data";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Empty, ErrorState } from "../components/Empty";
import { Avatar } from "../components/Avatar";
import { Icon } from "../components/Icon";
import { ResourceGate } from "../components/ResourceGate";
import { SkeletonList } from "../components/Skeleton";
import { setView, showToast } from "../stores/ui";
import { isToday, isYesterday, relativeTime } from "../utils/date";
import { useRefreshEffect } from "../utils/gestures";

export function Clips() {
  const [clips, { refetch: refetchClips }] = createResource(listClips);
  const [contacts, { refetch: refetchContacts }] = createResource(listContacts);

  // Only fetch the message rows referenced by visible clips. The
  // previous full-table `listMessages()` pulled every row with
  // body_html, which on a real 4000-row mailbox is ~360 MB of HTML
  // just to render the few clip previews that reference a message.
  // `listMessagesByIdsLight` is the same lightweight projection used
  // by FollowUps / Insights and skips body / body_html.
  const referencedMsgIds = createMemo<string[]>(() => {
    const set = new Set<string>();
    for (const c of clips() ?? []) if (c.msgId) set.add(c.msgId);
    return [...set];
  });
  const [messages, { refetch: refetchMessages }] = createResource(
    referencedMsgIds,
    listMessagesByIdsLight,
  );
  // The createResource fetcher re-runs only when the source signal
  // reference changes. The createResource(source, fetcher) signature
  // is reactive on the source — SolidJS compares the previous and
    // new source values for referential equality. Because the memo
    // returns a fresh array each time, the resource refetches on
    // every clips() change. We still want that behavior; the
    // createEffect below is a defensive guard in case the Solid
    // runtime ever changes how it compares memo results.
  createEffect(() => {
    void referencedMsgIds();
    void refetchMessages();
  });

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
          padding: "var(--space-6) var(--space-5) var(--space-3)",
          "text-align": "center",
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
          从邮件里摘下来的文字片段 · 一键复制粘贴
        </p>
      </header>

      <ResourceGate
        resource={clips}
        isLoading={() => clips.loading || contacts.loading || messages.loading}
        loading={
          <div
            style={{
              "max-width": "760px",
              margin: "0 auto",
              padding: "var(--space-4) var(--space-5)",
            }}
          >
            <SkeletonList count={4} height={120} />
          </div>
        }
        errorView={() => (
          <ErrorState
            title="剪辑加载失败"
            message="请稍后重试；若持续失败，请检查本地数据库状态。"
            retry={() => void refetchClips()}
          />
        )}
        empty={
          <Empty
            icon="ph-bookmarks"
            title="还没有 Clip"
            description="在邮件里选中文字后点「Clip」，金句、地址、代码片段都收在这里，一键复制。"
            action={{ label: "去 Imbox 选一段", onClick: () => setView("imbox") }}
          />
        }
      >
        {() => (
          <div
            style={{
              "max-width": "760px",
              margin: "0 auto",
              padding: "var(--space-4) var(--space-5)",
            }}
          >
            <Show when={grouped().today.length > 0}>
              <Group title="今天">
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
              <Group title="昨天">
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
              <Group title="更早">
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
        )}
      </ResourceGate>
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
            未知联系人
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
          <Icon name="ph-copy" size={11} /> 复制
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
          删除
        </button>
      </div>
    </div>
  );
}
