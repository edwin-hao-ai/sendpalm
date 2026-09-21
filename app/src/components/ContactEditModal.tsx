/** ContactEditModal — reusable contact create/edit form.
 * Extracted from Contacts.tsx so the detail panel can edit too.
 */

import {
  For,
  Show,
  createMemo,
  createResource,
  createSignal,
  type JSX,
} from "solid-js";
import { listContacts, upsertContact } from "../stores/data";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { ConfirmDialog } from "./ConfirmDialog";
import { healthToGroup } from "../utils/labels";
import { showToast } from "../stores/ui";
import type { Contact } from "../types";

interface ContactEditModalProps {
  contact: Contact;
  isNew: boolean;
  onClose: () => void;
  onSave?: (c: Contact) => void | Promise<void>;
  onDelete?: () => void;
}

/** Deep-compare the editable draft against the original contact.
 *  Exported for tests; used to gate the "discard changes?" confirm. */
export function isContactDraftDirty(original: Contact, draft: Contact): boolean {
  return JSON.stringify(original) !== JSON.stringify(draft);
}

const EMAIL_LABELS: { value: string; label: string }[] = [
  { value: "work", label: "工作" },
  { value: "personal", label: "个人" },
  { value: "other", label: "其他" },
];

const PHONE_LABELS: { value: string; label: string }[] = [
  { value: "work", label: "工作" },
  { value: "mobile", label: "手机" },
  { value: "home", label: "家庭" },
  { value: "other", label: "其他" },
];

const GROUP_LABEL: Record<string, string> = {
  active: "活跃",
  risk: "需跟进",
  cold: "冷淡",
};

export function ContactEditModal(props: ContactEditModalProps) {
  const [draft, setDraft] = createSignal<Contact>(
    JSON.parse(JSON.stringify(props.contact)),
  );
  const [contacts] = createResource(listContacts);
  const [saving, setSaving] = createSignal(false);
  const [confirmDiscard, setConfirmDiscard] = createSignal(false);

  const companies = createMemo(() => {
    const seen = new Set<string>();
    for (const c of contacts() ?? []) {
      if (c.company) seen.add(c.company);
    }
    return [...seen].sort();
  });

  const displayName = createMemo(() => {
    const d = draft();
    // Chinese name order: family name first.
    return (
      `${d.lastName}${d.firstName}`.trim() ||
      d.nickname ||
      d.emails[0]?.value ||
      "未命名"
    );
  });

  const updateEmail = (
    idx: number,
    field: "value" | "label",
    value: string,
  ) => {
    setDraft((d) => {
      const next = [...d.emails];
      next[idx] = { ...next[idx], [field]: value } as Contact["emails"][number];
      return { ...d, emails: next };
    });
  };

  const addEmail = () =>
    setDraft((d) => ({
      ...d,
      emails: [...d.emails, { value: "", label: "work" }],
    }));

  const removeEmail = (idx: number) =>
    setDraft((d) => ({
      ...d,
      emails: d.emails.filter((_, i) => i !== idx),
    }));

  const updatePhone = (
    idx: number,
    field: "value" | "label",
    value: string,
  ) => {
    setDraft((d) => {
      const next = [...d.phones];
      next[idx] = { ...next[idx], [field]: value } as Contact["phones"][number];
      return { ...d, phones: next };
    });
  };

  const addPhone = () =>
    setDraft((d) => ({
      ...d,
      phones: [...d.phones, { value: "", label: "work" }],
    }));

  const removePhone = (idx: number) =>
    setDraft((d) => ({
      ...d,
      phones: d.phones.filter((_, i) => i !== idx),
    }));

  const commaList = (s: string) =>
    s
      .split(/[,，]/)
      .map((x) => x.trim())
      .filter(Boolean);

  const commit = async () => {
    if (saving()) return;
    const d = draft();
    const saved: Contact = {
      ...d,
      name: displayName(),
      emails: d.emails.filter((e) => e.value.trim()),
      phones: d.phones.filter((p) => p.value.trim()),
      grp: healthToGroup(d.health),
    };
    setSaving(true);
    try {
      if (props.onSave) {
        await props.onSave(saved);
      } else {
        await upsertContact(saved);
      }
      props.onClose();
    } catch (err) {
      // Keep the modal open — the draft is still here, nothing was lost.
      showToast({
        message: "保存失败，请重试",
        kind: "error",
        source: "contacts",
        detail: String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  /** Close request from Esc / backdrop / cancel: confirm when dirty. */
  const requestClose = () => {
    if (isContactDraftDirty(props.contact, draft())) {
      setConfirmDiscard(true);
    } else {
      props.onClose();
    }
  };

  return (
    <>
      <Modal
        open
        onClose={requestClose}
        title={props.isNew ? "新建联系人" : "编辑联系人"}
        width="640px"
        footer={
          <>
            <Show when={!props.isNew && props.onDelete}>
              <button
                onClick={props.onDelete}
                style={{
                  padding: "8px 16px",
                  "border-radius": "var(--radius-pill)",
                  border: "1px solid var(--status-danger)",
                  background: "transparent",
                  color: "var(--status-danger)",
                  "font-size": "var(--text-caption)",
                  "font-weight": "600",
                  cursor: "pointer",
                  "margin-right": "auto",
                }}
              >
                删除
              </button>
            </Show>
            <button
              onClick={requestClose}
              style={{
                padding: "8px 16px",
                color: "var(--text-secondary)",
                "font-size": "var(--text-caption)",
                cursor: "pointer",
              }}
            >
              取消
            </button>
            <button
              onClick={() => void commit()}
              disabled={saving()}
              style={{
                padding: "10px 20px",
                background: "var(--palm)",
                color: "white",
                "border-radius": "var(--radius-pill)",
                "font-weight": "700",
                "font-size": "var(--text-caption)",
                border: "none",
                cursor: saving() ? "default" : "pointer",
                opacity: saving() ? 0.6 : 1,
              }}
            >
              {saving() ? "保存中…" : "保存"}
            </button>
          </>
        }
      >
        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <Field label="姓" style={{ flex: 1 }}>
            <input
              value={draft().lastName}
              onInput={(e) =>
                setDraft({ ...draft(), lastName: e.currentTarget.value })
              }
              style={inputStyle}
            />
          </Field>
          <Field label="名" style={{ flex: 1 }}>
            <input
              value={draft().firstName}
              onInput={(e) =>
                setDraft({ ...draft(), firstName: e.currentTarget.value })
              }
              style={inputStyle}
            />
          </Field>
        </div>
        <Field label="昵称">
          <input
            value={draft().nickname}
            onInput={(e) =>
              setDraft({ ...draft(), nickname: e.currentTarget.value })
            }
            style={inputStyle}
          />
        </Field>
        <Field label="显示名预览">
          <input
            value={displayName()}
            readonly
            aria-label="显示名预览"
            style={{ ...inputStyle, color: "var(--text-muted)" }}
          />
        </Field>
        <Field label="头像链接">
          <input
            value={draft().avatar}
            onInput={(e) =>
              setDraft({ ...draft(), avatar: e.currentTarget.value })
            }
            placeholder="https://…"
            style={inputStyle}
          />
        </Field>
        <Field label="职务">
          <input
            value={draft().title}
            onInput={(e) =>
              setDraft({ ...draft(), title: e.currentTarget.value })
            }
            style={inputStyle}
          />
        </Field>
        <Field label="公司">
          <input
            list="contact-company-list"
            value={draft().company}
            onInput={(e) =>
              setDraft({ ...draft(), company: e.currentTarget.value })
            }
            style={inputStyle}
          />
          <datalist id="contact-company-list">
            <For each={companies()}>{(c) => <option value={c} />}</For>
          </datalist>
        </Field>

        {/* Emails */}
        <Field label="邮箱">
          <For each={draft().emails}>
            {(_, i) => {
              const e = draft().emails[i()];
              if (!e) return null;
              return (
                <div
                  style={{
                    display: "flex",
                    gap: "var(--space-2)",
                    "margin-bottom": "var(--space-2)",
                  }}
                >
                  <input
                    value={e.value}
                    onInput={(ev) =>
                      updateEmail(i(), "value", ev.currentTarget.value)
                    }
                    placeholder="email@example.com"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <select
                    value={e.label}
                    onChange={(ev) =>
                      updateEmail(i(), "label", ev.currentTarget.value)
                    }
                    aria-label="邮箱类型"
                    style={{ ...inputStyle, width: "100px" }}
                  >
                    <For each={EMAIL_LABELS}>
                      {(o) => <option value={o.value}>{o.label}</option>}
                    </For>
                  </select>
                  <button
                    onClick={() => removeEmail(i())}
                    style={{
                      color: "var(--text-muted)",
                      padding: "8px",
                      cursor: "pointer",
                    }}
                    aria-label="删除这个邮箱"
                    title="删除这个邮箱"
                  >
                    <Icon name="ph-x" size={14} />
                  </button>
                </div>
              );
            }}
          </For>
          <button onClick={addEmail} style={miniBtnStyle}>
            <Icon name="ph-plus" size={12} /> 添加邮箱
          </button>
        </Field>

        {/* Phones */}
        <Field label="电话">
          <For each={draft().phones}>
            {(_, i) => {
              const p = draft().phones[i()];
              if (!p) return null;
              return (
                <div
                  style={{
                    display: "flex",
                    gap: "var(--space-2)",
                    "margin-bottom": "var(--space-2)",
                  }}
                >
                  <input
                    value={p.value}
                    onInput={(ev) =>
                      updatePhone(i(), "value", ev.currentTarget.value)
                    }
                    placeholder="+86 138 0000 0000"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <select
                    value={p.label}
                    onChange={(ev) =>
                      updatePhone(i(), "label", ev.currentTarget.value)
                    }
                    aria-label="电话类型"
                    style={{ ...inputStyle, width: "100px" }}
                  >
                    <For each={PHONE_LABELS}>
                      {(o) => <option value={o.value}>{o.label}</option>}
                    </For>
                  </select>
                  <button
                    onClick={() => removePhone(i())}
                    style={{
                      color: "var(--text-muted)",
                      padding: "8px",
                      cursor: "pointer",
                    }}
                    aria-label="删除这个电话"
                    title="删除这个电话"
                  >
                    <Icon name="ph-x" size={14} />
                  </button>
                </div>
              );
            }}
          </For>
          <button onClick={addPhone} style={miniBtnStyle}>
            <Icon name="ph-plus" size={12} /> 添加电话
          </button>
        </Field>

        <div style={{ display: "flex", gap: "var(--space-3)" }}>
          <Field label="关系阶段" style={{ flex: 1 }}>
            <select
              value={draft().stage}
              onChange={(e) =>
                setDraft({
                  ...draft(),
                  stage: e.currentTarget.value as Contact["stage"],
                })
              }
              style={inputStyle}
            >
              <option value="explore">探索</option>
              <option value="build">建立</option>
              <option value="active">活跃</option>
              <option value="maintain">维护</option>
              <option value="cold">冷淡</option>
              <option value="rekindle">重新激活</option>
            </select>
          </Field>
          <Field label="默认投递到" style={{ flex: 1 }}>
            <select
              value={draft().defaultBucket}
              onChange={(e) =>
                setDraft({
                  ...draft(),
                  defaultBucket: e.currentTarget
                    .value as Contact["defaultBucket"],
                })
              }
              aria-describedby="default-bucket-hint"
              style={inputStyle}
            >
              <option value="imbox">Imbox（重要邮件）</option>
              <option value="feed">Stream（资讯与 newsletter）</option>
              <option value="paperTrail">Records（收据与账单）</option>
            </select>
            <span
              id="default-bucket-hint"
              style={{
                display: "block",
                "margin-top": "4px",
                "font-size": "var(--text-micro)",
                color: "var(--text-muted)",
              }}
            >
              此发件人的新邮件默认投递到这里。
            </span>
          </Field>
        </div>

        <Field label="关系健康度">
          <div style={{ display: "flex", "align-items": "center", gap: "var(--space-3)" }}>
            <input
              type="range"
              min={0}
              max={100}
              value={draft().health}
              onInput={(e) =>
                setDraft({
                  ...draft(),
                  health: Math.min(
                    100,
                    Math.max(0, parseInt(e.currentTarget.value) || 0),
                  ),
                })
              }
              aria-label="关系健康度"
              style={{ flex: 1, "accent-color": "var(--palm)" }}
            />
            <span
              style={{
                "font-size": "var(--text-caption)",
                color: "var(--text-secondary)",
                "min-width": "64px",
                "text-align": "right",
              }}
            >
              {draft().health} · {GROUP_LABEL[healthToGroup(draft().health)]}
            </span>
          </div>
          <span
            style={{
              display: "block",
              "margin-top": "4px",
              "font-size": "var(--text-micro)",
              color: "var(--text-muted)",
            }}
          >
            根据互动频率自动估算，也可以手动调整。
          </span>
        </Field>

        <Field label="标签（逗号分隔）">
          <input
            value={draft().labels.join(", ")}
            onInput={(e) =>
              setDraft({ ...draft(), labels: commaList(e.currentTarget.value) })
            }
            placeholder="例如：投资人, 合作伙伴"
            style={inputStyle}
          />
        </Field>
        <Field label="话题（逗号分隔）">
          <input
            value={draft().topics.join(", ")}
            onInput={(e) =>
              setDraft({ ...draft(), topics: commaList(e.currentTarget.value) })
            }
            placeholder="例如：AI, 设计, 融资"
            style={inputStyle}
          />
        </Field>
        <Field label="备注">
          <textarea
            value={draft().notes}
            onInput={(e) =>
              setDraft({ ...draft(), notes: e.currentTarget.value })
            }
            rows={3}
            style={{
              ...inputStyle,
              "min-height": "80px",
              "font-family": "var(--font-body)",
              resize: "vertical",
            }}
          />
        </Field>

        <div
          style={{
            display: "grid",
            "grid-template-columns": "repeat(2, 1fr)",
            gap: "var(--space-2)",
            padding: "var(--space-3)",
            background: "var(--paper-mid)",
            "border-radius": "var(--radius-md)",
          }}
        >
          <Flag
            label="屏蔽此发件人"
            checked={draft().blocked}
            onChange={(v) => setDraft({ ...draft(), blocked: v })}
          />
          <Flag
            label="新邮件时通知我"
            checked={draft().notify}
            onChange={(v) => setDraft({ ...draft(), notify: v })}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDiscard()}
        title="放弃未保存的修改？"
        body="你已经改了内容，关闭后这些修改会丢失。"
        confirmLabel="放弃修改"
        onConfirm={() => props.onClose()}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  );
}

const miniBtnStyle = {
  display: "inline-flex",
  "align-items": "center",
  gap: "var(--space-1)",
  padding: "6px 12px",
  "min-height": "32px",
  background: "var(--paper-mid)",
  "border-radius": "var(--radius-pill)",
  border: "none",
  "font-size": "var(--text-caption)",
  color: "var(--text-secondary)",
  "font-weight": "600",
  cursor: "pointer",
} as const;

function Field(props: {
  label: string;
  children: unknown;
  style?: JSX.CSSProperties;
}) {
  return (
    <label
      style={{
        display: "block",
        "margin-bottom": "var(--space-3)",
        ...(props.style ?? {}),
      }}
    >
      <span
        style={{
          display: "block",
          "font-size": "var(--text-micro)",
          color: "var(--text-muted)",
          "font-weight": "700",
          "margin-bottom": "4px",
        }}
      >
        {props.label}
      </span>
      {props.children as never}
    </label>
  );
}

function Flag(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        "align-items": "center",
        gap: "var(--space-2)",
        "font-size": "var(--text-body-sm)",
        color: "var(--text-primary)",
        cursor: "pointer",
        "min-height": "36px",
      }}
    >
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(e) => props.onChange(e.currentTarget.checked)}
        style={{ "accent-color": "var(--palm)" }}
      />
      {props.label}
    </label>
  );
}

const inputStyle = {
  width: "100%",
  padding: "8px 12px",
  border: "0.5px solid var(--border)",
  "border-radius": "var(--radius-md)",
  background: "var(--paper-light)",
  "font-size": "var(--text-body-sm)",
  color: "var(--text-primary)",
  outline: "none",
  "font-family": "var(--font-body)",
};
