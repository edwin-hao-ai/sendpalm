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
import { healthToGroup } from "../utils/labels";
import type { Contact } from "../types";

interface ContactEditModalProps {
  contact: Contact;
  isNew: boolean;
  onClose: () => void;
  onSave?: (c: Contact) => void;
  onDelete?: () => void;
}

export function ContactEditModal(props: ContactEditModalProps) {
  const [draft, setDraft] = createSignal<Contact>(
    JSON.parse(JSON.stringify(props.contact)),
  );
  const [contacts] = createResource(listContacts);

  const companies = createMemo(() => {
    const seen = new Set<string>();
    for (const c of contacts() ?? []) {
      if (c.company) seen.add(c.company);
    }
    return [...seen].sort();
  });

  const displayName = createMemo(() => {
    const d = draft();
    return (
      `${d.firstName} ${d.lastName}`.trim() ||
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
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  const commit = async () => {
    const d = draft();
    const saved: Contact = {
      ...d,
      name: displayName(),
      emails: d.emails.filter((e) => e.value.trim()),
      phones: d.phones.filter((p) => p.value.trim()),
      grp: healthToGroup(d.health),
    };
    if (props.onSave) {
      props.onSave(saved);
    } else {
      await upsertContact(saved);
    }
    props.onClose();
  };

  return (
    <Modal
      open
      onClose={props.onClose}
      title={props.isNew ? "New contact" : "Edit contact"}
      width="640px"
      footer={
        <>
          <Show when={!props.isNew && props.onDelete}>
            <button
              onClick={props.onDelete}
              style={{
                padding: "8px 16px",
                color: "var(--coral)",
                "font-size": "var(--text-caption)",
              }}
            >
              Delete
            </button>
          </Show>
          <button
            onClick={props.onClose}
            style={{
              padding: "8px 16px",
              color: "var(--text-secondary)",
              "font-size": "var(--text-caption)",
            }}
          >
            取消
          </button>
          <button
            onClick={commit}
            style={{
              padding: "10px 20px",
              background: "var(--palm)",
              color: "white",
              "border-radius": "var(--radius-pill)",
              "font-weight": "700",
              "font-size": "var(--text-caption)",
            }}
          >
            保存
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <Field label="First name" style={{ flex: 1 }}>
          <input
            value={draft().firstName}
            onInput={(e) =>
              setDraft({ ...draft(), firstName: e.currentTarget.value })
            }
            style={inputStyle}
          />
        </Field>
        <Field label="Last name" style={{ flex: 1 }}>
          <input
            value={draft().lastName}
            onInput={(e) =>
              setDraft({ ...draft(), lastName: e.currentTarget.value })
            }
            style={inputStyle}
          />
        </Field>
      </div>
      <Field label="Nickname">
        <input
          value={draft().nickname}
          onInput={(e) =>
            setDraft({ ...draft(), nickname: e.currentTarget.value })
          }
          style={inputStyle}
        />
      </Field>
      <Field label="Name preview">
        <input
          value={displayName()}
          readonly
          style={{ ...inputStyle, color: "var(--text-muted)" }}
        />
      </Field>
      <Field label="Avatar URL">
        <input
          value={draft().avatar}
          onInput={(e) =>
            setDraft({ ...draft(), avatar: e.currentTarget.value })
          }
          placeholder="https://…"
          style={inputStyle}
        />
      </Field>
      <Field label="Title">
        <input
          value={draft().title}
          onInput={(e) =>
            setDraft({ ...draft(), title: e.currentTarget.value })
          }
          style={inputStyle}
        />
      </Field>
      <Field label="Company">
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
      <Field label="Emails">
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
                  style={{ ...inputStyle, width: "100px" }}
                >
                  <option value="work">work</option>
                  <option value="personal">personal</option>
                  <option value="other">other</option>
                </select>
                <button
                  onClick={() => removeEmail(i())}
                  style={{ color: "var(--text-muted)", padding: "4px" }}
                  aria-label="Remove email"
                >
                  <Icon name="ph-x" size={14} />
                </button>
              </div>
            );
          }}
        </For>
        <button onClick={addEmail} style={miniBtnStyle}>
          <Icon name="ph-plus" size={12} /> Add email
        </button>
      </Field>

      {/* Phones */}
      <Field label="Phones">
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
                  placeholder="+1 555 000 0000"
                  style={{ ...inputStyle, flex: 1 }}
                />
                <select
                  value={p.label}
                  onChange={(ev) =>
                    updatePhone(i(), "label", ev.currentTarget.value)
                  }
                  style={{ ...inputStyle, width: "100px" }}
                >
                  <option value="work">work</option>
                  <option value="mobile">mobile</option>
                  <option value="home">home</option>
                  <option value="other">other</option>
                </select>
                <button
                  onClick={() => removePhone(i())}
                  style={{ color: "var(--text-muted)", padding: "4px" }}
                  aria-label="Remove phone"
                >
                  <Icon name="ph-x" size={14} />
                </button>
              </div>
            );
          }}
        </For>
        <button onClick={addPhone} style={miniBtnStyle}>
          <Icon name="ph-plus" size={12} /> Add phone
        </button>
      </Field>

      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <Field label="Stage" style={{ flex: 1 }}>
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
        <Field label="Default bucket" style={{ flex: 1 }}>
          <select
            value={draft().defaultBucket}
            onChange={(e) =>
              setDraft({
                ...draft(),
                defaultBucket: e.currentTarget
                  .value as Contact["defaultBucket"],
              })
            }
            style={inputStyle}
          >
            <option value="imbox">Imbox</option>
            <option value="feed">Stream</option>
            <option value="paperTrail">Records</option>
            <option value="trash">Trash</option>
            <option value="spam">Spam</option>
          </select>
        </Field>
      </div>

      <div style={{ display: "flex", gap: "var(--space-3)" }}>
        <Field label="Health (0–100)" style={{ flex: 1 }}>
          <input
            type="number"
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
            style={inputStyle}
          />
        </Field>
        <Field label="Group preview" style={{ flex: 1 }}>
          <input
            value={healthToGroup(draft().health)}
            readonly
            style={{ ...inputStyle, color: "var(--text-muted)" }}
          />
        </Field>
      </div>

      <Field label="Labels (comma separated)">
        <input
          value={draft().labels.join(", ")}
          onInput={(e) =>
            setDraft({ ...draft(), labels: commaList(e.currentTarget.value) })
          }
          placeholder="vip, partner, investor"
          style={inputStyle}
        />
      </Field>
      <Field label="Topics (comma separated)">
        <input
          value={draft().topics.join(", ")}
          onInput={(e) =>
            setDraft({ ...draft(), topics: commaList(e.currentTarget.value) })
          }
          placeholder="AI, design, fundraising"
          style={inputStyle}
        />
      </Field>
      <Field label="Notes">
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
          label="Blocked"
          checked={draft().blocked}
          onChange={(v) => setDraft({ ...draft(), blocked: v })}
        />
        <Flag
          label="Notify"
          checked={draft().notify}
          onChange={(v) => setDraft({ ...draft(), notify: v })}
        />
        <Flag
          label="First seen"
          checked={draft().firstSeen}
          onChange={(v) => setDraft({ ...draft(), firstSeen: v })}
        />
        <Flag
          label="Screened"
          checked={draft().screened}
          onChange={(v) => setDraft({ ...draft(), screened: v })}
        />
      </div>
    </Modal>
  );
}

const miniBtnStyle = {
  display: "inline-flex",
  "align-items": "center",
  gap: "var(--space-1)",
  padding: "6px 12px",
  background: "var(--paper-mid)",
  "border-radius": "var(--radius-pill)",
  "font-size": "var(--text-caption)",
  color: "var(--text-secondary)",
  "font-weight": "600",
};

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
