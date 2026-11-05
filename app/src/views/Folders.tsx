/** 文件夹视图 — folders ARE labels (Gmail proved they're the same thing;
 *  we reuse the existing label infrastructure with zero migration).
 *  A message "in" a folder = carries the label; "归档到文件夹" also moves
 *  it out of the Inbox (bucket → paperTrail) so 新邮件 only holds
 *  un-filed mail, exactly like Gmail's archive-with-label. */

import { For, Show, createResource, createSignal } from "solid-js";
import { listLabels, listMessagesByLabel, removeLabelFromMessage } from "../stores/data";
import type { ID, Label } from "../types";
import { PageHeader } from "../components/PageHeader";
import { Icon } from "../components/Icon";
import { Empty } from "../components/Empty";
import { emailPreviewText } from "../components/EmailBody";
import { appSettings, setView, showToast } from "../stores/ui";
import { formatMessageDate } from "../utils/message-dates";

export function Folders() {
  const [labels] = createResource(listLabels);
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
      <Show
        when={(labels() ?? []).length > 0}
        fallback={
          <Empty
            icon="ph-folder"
            title="还没有文件夹"
            description="到 设置 → 标签 新建一个，比如「发票」「客户」。"
            action={{ label: "去设置", onClick: () => setView("settings") }}
          />
        }
      >
        <For each={labels()}>
          {(label: Label) => (
            <FolderRow
              label={label}
              open={openId() === label.id}
              onToggle={() => open(label.id)}
            />
          )}
        </For>
      </Show>
    </div>
  );
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
        <Icon name="ph-caret-right" size={12} />
      </button>
      <Show when={props.open}>
        <div style={{ "border-top": "0.5px solid var(--border)" }}>
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
                    gap: "var(--space-3)",
                    "align-items": "center",
                    padding: "10px var(--space-3)",
                    "border-bottom": "0.5px solid var(--border)",
                  }}
                >
                  <div style={{ flex: 1, "min-width": 0 }}>
                    <div
                      style={{
                        "font-size": "var(--text-body-sm)",
                        "font-weight": 600,
                        color: "var(--text-primary)",
                        "white-space": "nowrap",
                        overflow: "hidden",
                        "text-overflow": "ellipsis",
                      }}
                    >
                      {m.subj || "(无主题)"}
                    </div>
                    <div
                      style={{
                        "font-size": "var(--text-caption)",
                        color: "var(--text-muted)",
                        "white-space": "nowrap",
                        overflow: "hidden",
                        "text-overflow": "ellipsis",
                      }}
                    >
                      {emailPreviewText(m).slice(0, 80)}
                    </div>
                  </div>
                  <span style={{ "font-size": "var(--text-micro)", color: "var(--text-muted)" }}>
                    {formatMessageDate(m, appSettings.profile.timezone, "list").primary.value}
                  </span>
                  <button
                    type="button"
                    title="移出文件夹"
                    aria-label="移出文件夹"
                    onClick={async () => {
                      await removeLabelFromMessage(m.id, props.label.id);
                      await refetch();
                      showToast({ message: "已移出文件夹", kind: "info", ttlMs: 1500 });
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
                    }}
                  >
                    <Icon name="ph-x" size={13} />
                  </button>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
}
