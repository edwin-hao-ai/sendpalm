/** 文件夹视图 — folders ARE labels (Gmail proved they're the same thing;
 *  we reuse the existing label infrastructure with zero migration).
 *  A message "in" a folder = carries the label; "归档到文件夹" also moves
 *  it out of the Inbox (bucket → paperTrail) so 新邮件 only holds
 *  un-filed mail, exactly like Gmail's archive-with-label. */

import { For, Show, createResource, createSignal } from "solid-js";
import { listLabels, listMessagesByLabel, removeLabelFromMessage } from "../stores/data";
import type { ID, Label, Message } from "../types";
import { PageHeader } from "../components/PageHeader";
import { Icon } from "../components/Icon";
import { Empty, ErrorState } from "../components/Empty";
import { ResourceGate } from "../components/ResourceGate";
import { SkeletonList } from "../components/Skeleton";
import { emailPreviewText } from "../components/EmailBody";
import {
  appSettings,
  setDetailOpen,
  setSelectedMessageId,
  setView,
  showToast,
} from "../stores/ui";
import { formatMessageDate } from "../utils/message-dates";

export function Folders() {
  const [labels, { refetch: refetchLabels }] = createResource(listLabels);
  const [openId, setOpenId] = createSignal<ID | null>(null);

  const open = (id: ID) => setOpenId(openId() === id ? null : id);

  return (
    <div
      style={{
        "max-width": "720px",
        margin: "0 auto",
        padding: "0 var(--space-5) var(--space-5)",
        animation: "view-enter 0.3s var(--ease-out) both",
      }}
    >
      <PageHeader
        title="文件夹"
        description={
          <p>
            文件夹就是标签：把发票、项目、公司邮件各归其位。选中邮件 →
            标签 → 归档到文件夹。
          </p>
        }
      />
      {/* A failed label query used to render the "还没有文件夹" empty state,
          which reads as "you have none" when the truth is "we couldn't ask". */}
      <ResourceGate
        resource={labels}
        loading={<SkeletonList count={3} height={48} />}
        errorView={() => (
          <ErrorState
            title="文件夹加载失败"
            message="读取标签时出错，请重试。"
            retry={() => void refetchLabels()}
          />
        )}
        empty={
          <Empty
            icon="ph-folder"
            title="还没有文件夹"
            description="到 设置 → 标签 新建一个，比如「发票」「客户」。"
            action={{ label: "去设置", onClick: () => setView("settings") }}
          />
        }
      >
        {(list) => (
          <For each={list}>
            {(label) => (
              <FolderRow
                label={label}
                open={openId() === label.id}
                onToggle={() => open(label.id)}
              />
            )}
          </For>
        )}
      </ResourceGate>
    </div>
  );
}

/** Open a message from inside a folder in the shared detail panel. The
 *  panel is a global overlay, so this works without switching views. */
function openMessage(m: Message) {
  setSelectedMessageId(m.id);
  setDetailOpen(true);
}

function FolderRow(props: {
  label: Label;
  open: boolean;
  onToggle: () => void;
}) {
  const [items, { refetch }] = createResource(
    () => (props.open ? props.label.id : null),
    (id) => listMessagesByLabel(id!, 50),
  );

  return (
    <div
      data-folder={props.label.id}
      style={{
        "border-radius": "var(--radius-md)",
        border: "0.5px solid var(--border)",
        background: "var(--paper-light)",
        "margin-bottom": "var(--space-2)",
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={props.onToggle}
        aria-expanded={props.open}
        style={{
          display: "flex",
          "align-items": "center",
          gap: "var(--space-3)",
          width: "100%",
          padding: "var(--space-3)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          "min-height": "44px",
          "text-align": "left",
        }}
      >
        <span
          style={{
            width: "10px",
            height: "10px",
            "border-radius": "3px",
            background: props.label.color || "var(--palm)",
            "flex-shrink": 0,
          }}
        />
        <span style={{ "font-weight": 600, color: "var(--text-primary)", flex: 1 }}>
          {props.label.name}
        </span>
        <Icon name={props.open ? "ph-caret-down" : "ph-caret-right"} size={12} />
      </button>
      <Show when={props.open}>
        <div style={{ "border-top": "0.5px solid var(--border)" }}>
          <Show when={!items.error} fallback={<FolderRowError onRetry={() => void refetch()} />}>
            <Show when={!items.loading} fallback={<FolderRowsSkeleton />}>
              <Show
                when={(items() ?? []).length > 0}
                fallback={
                  <p
                    style={{
                      margin: 0,
                      padding: "var(--space-3)",
                      "font-size": "var(--text-caption)",
                      color: "var(--text-muted)",
                    }}
                  >
                    这个文件夹是空的。
                  </p>
                }
              >
                <For each={items()}>
                  {(m) => (
                    <div
                      data-folder-row={m.id}
                      style={{
                        display: "flex",
                        gap: "var(--space-2)",
                        "align-items": "center",
                        "border-bottom": "0.5px solid var(--border)",
                      }}
                    >
                      {/* The row itself is the open affordance. It used to be
                          a plain <div>: the message was listed and could only
                          be un-filed, never read. */}
                      <button
                        type="button"
                        data-folder-open={m.id}
                        title="打开这封邮件"
                        onClick={() => openMessage(m)}
                        style={{
                          flex: 1,
                          "min-width": 0,
                          display: "flex",
                          gap: "var(--space-3)",
                          "align-items": "center",
                          padding: "10px var(--space-3)",
                          background: "transparent",
                          border: "none",
                          cursor: "pointer",
                          "text-align": "left",
                          "min-height": "44px",
                        }}
                      >
                        <span style={{ flex: 1, "min-width": 0 }}>
                          <span
                            style={{
                              display: "block",
                              "font-size": "var(--text-body-sm)",
                              "font-weight": 600,
                              color: "var(--text-primary)",
                              "white-space": "nowrap",
                              overflow: "hidden",
                              "text-overflow": "ellipsis",
                            }}
                          >
                            {m.subj || "(无主题)"}
                          </span>
                          <span
                            style={{
                              display: "block",
                              "font-size": "var(--text-caption)",
                              color: "var(--text-muted)",
                              "white-space": "nowrap",
                              overflow: "hidden",
                              "text-overflow": "ellipsis",
                            }}
                          >
                            {emailPreviewText(m).slice(0, 80)}
                          </span>
                        </span>
                        <span
                          style={{
                            "font-size": "var(--text-micro)",
                            color: "var(--text-muted)",
                            "flex-shrink": 0,
                          }}
                        >
                          {
                            formatMessageDate(
                              m,
                              appSettings.profile.timezone,
                              "list",
                            ).primary.value
                          }
                        </span>
                      </button>
                      <button
                        type="button"
                        title="移出文件夹"
                        aria-label="移出文件夹"
                        onClick={async () => {
                          await removeLabelFromMessage(m.id, props.label.id);
                          await refetch();
                          showToast({
                            message: "已移出文件夹",
                            kind: "info",
                            ttlMs: 1500,
                          });
                        }}
                        style={{
                          width: "32px",
                          height: "32px",
                          "border-radius": "var(--radius-pill)",
                          border: "none",
                          background: "var(--paper-mid)",
                          color: "var(--text-secondary)",
                          cursor: "pointer",
                          "flex-shrink": 0,
                          "margin-right": "var(--space-3)",
                        }}
                      >
                        <Icon name="ph-x" size={13} />
                      </button>
                    </div>
                  )}
                </For>
              </Show>
            </Show>
          </Show>
        </div>
      </Show>
    </div>
  );
}

function FolderRowsSkeleton() {
  return (
    <div style={{ padding: "var(--space-2) var(--space-3)" }}>
      <SkeletonList count={2} height={40} />
    </div>
  );
}

function FolderRowError(props: { onRetry: () => void }) {
  return (
    <p
      style={{
        margin: 0,
        padding: "var(--space-3)",
        "font-size": "var(--text-caption)",
        color: "var(--status-danger)",
        display: "flex",
        gap: "var(--space-2)",
        "align-items": "center",
      }}
    >
      <Icon name="ph-warning-circle" size={13} />
      <span style={{ flex: 1 }}>这个文件夹里的邮件读取失败。</span>
      <button
        type="button"
        onClick={props.onRetry}
        style={{
          color: "var(--palm)",
          "font-weight": 700,
          "font-size": "var(--text-caption)",
        }}
      >
        重试
      </button>
    </p>
  );
}
