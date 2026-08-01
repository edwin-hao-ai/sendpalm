/** Contacts view — list with filter pills, group toggle, by-company.
 * Spec: prototype-v11 §3.4.
 */

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { listContacts, upsertContact, deleteContact } from "../stores/data";
import { Avatar } from "../components/Avatar";
import { Empty } from "../components/Empty";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { uid } from "../utils/id";
import { isoNow } from "../utils/date";
import { STAGE_COLOR, STAGE_LABEL } from "../utils/labels";
import { setDetailOpen, setSelectedContactId, showToast } from "../stores/ui";
import type { Contact } from "../types";

const FILTERS = [
  { id: "all", label: "全部" },
  { id: "active", label: "活跃" },
  { id: "followup", label: "需跟进" },
  { id: "cold", label: "冷淡" },
] as const;

export function Contacts() {
  const [contacts, { refetch }] = createResource(listContacts);
  const [filter, setFilter] = createSignal<(typeof FILTERS)[number]["id"]>("all");
  const [groupBy, setGroupBy] = createSignal<"all" | "company">("all");
  const [search, setSearch] = createSignal("");
  const [editing, setEditing] = createSignal<Contact | null>(null);
  const [creating, setCreating] = createSignal(false);

  const filtered = createMemo<Contact[]>(() => {
    const list = contacts() ?? [];
    let out = list;
    const f = filter();
    if (f === "active") out = out.filter((c) => c.grp === "active");
    else if (f === "followup") out = out.filter((c) => c.grp === "risk");
    else if (f === "cold") out = out.filter((c) => c.grp === "cold");
    const q = search().trim().toLowerCase();
    if (q) {
      out = out.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.emails.some((e) => e.value.toLowerCase().includes(q))
      );
    }
    return out;
  });

  const grouped = createMemo<[string, Contact[]][]>(() => {
    if (groupBy() === "all") return [["", filtered()]];
    const map = new Map<string, Contact[]>();
    for (const c of filtered()) {
      const key = c.company || "(未分类)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  });

  const open = (id: string) => {
    setSelectedContactId(id);
    setDetailOpen(true);
  };

  const newContact = (): Contact => ({
    id: uid("c"),
    firstName: "",
    lastName: "",
    nickname: "",
    name: "",
    company: "",
    title: "",
    emails: [],
    phones: [],
    stage: "explore",
    labels: [],
    topics: [],
    notes: "",
    avatar: "",
    photo: "",
    health: 50,
    sc: 50,
    scC: "#a09aae",
    scL: "",
    lc: "刚刚",
    grp: "",
    trd: "stable",
    pattern: "",
    accounts: [],
    stageHistory: [],
    firstContact: isoNow().slice(0, 10),
    milestones: [],
    merged: false,
    blocked: false,
    notify: true,
    firstSeen: false,
    screened: true,
    defaultBucket: "imbox",
    autoLabel: [],
    recycling: false,
    ch: [],
  });

  const onSave = async (c: Contact) => {
    await upsertContact(c);
    await refetch();
    setEditing(null);
    setCreating(false);
    showToast({ message: "已保存", kind: "success" });
  };

  const onRemove = async (id: string) => {
    if (!confirm("删除此联系人？")) return;
    await deleteContact(id);
    await refetch();
    showToast({ message: "已删除", kind: "info" });
  };

  return (
    <div style={{ animation: "view-enter 0.3s var(--ease-out) both" }}>
      <header style={{ padding: "var(--space-5)", display: "flex", "align-items": "center", gap: "var(--space-4)", "flex-wrap": "wrap" }}>
        <h2 style={{ "font-family": "var(--font-display)", "font-size": "var(--text-h3)", "font-weight": "800", margin: 0, flex: 1 }}>
          Contacts
        </h2>
        <button onClick={() => setCreating(true)} style={{
          padding: "8px 16px",
          background: "var(--palm)",
          color: "white",
          "border-radius": "var(--radius-pill)",
          "font-size": "var(--text-caption)",
          "font-weight": "700",
          display: "flex",
          "align-items": "center",
          gap: "4px",
        }}>
          <Icon name="ph-plus" size={12} /> Add
        </button>
      </header>

      <div style={{ padding: "0 var(--space-5) var(--space-4)", display: "flex", gap: "var(--space-3)", "flex-wrap": "wrap", "align-items": "center" }}>
        <input
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
          placeholder="搜索联系人…"
          style={{
            flex: "1 1 200px",
            padding: "8px 14px",
            background: "var(--paper-light)",
            border: "0.5px solid var(--border)",
            "border-radius": "var(--radius-pill)",
            "font-size": "var(--text-body-sm)",
          }}
        />
        <div style={{ display: "flex", gap: "4px" }}>
          <For each={FILTERS}>
            {(f) => (
              <button
                onClick={() => setFilter(f.id)}
                style={{
                  padding: "4px 12px",
                  "border-radius": "var(--radius-pill)",
                  background: filter() === f.id ? "var(--palm-soft)" : "var(--paper-mid)",
                  color: filter() === f.id ? "var(--palm)" : "var(--text-secondary)",
                  "font-size": "var(--text-caption)",
                  "font-weight": filter() === f.id ? "700" : "500",
                }}
              >
                {f.label}
              </button>
            )}
          </For>
        </div>
        <button
          onClick={() => setGroupBy(groupBy() === "all" ? "company" : "all")}
          style={{
            padding: "4px 12px",
            "border-radius": "var(--radius-pill)",
            background: "var(--paper-mid)",
            color: "var(--text-secondary)",
            "font-size": "var(--text-caption)",
            display: "flex",
            "align-items": "center",
            gap: "4px",
          }}
        >
          <Icon name={groupBy() === "all" ? "ph-list" : "ph-buildings"} size={12} />
          {groupBy() === "all" ? "按公司分组" : "全部"}
        </button>
      </div>

      <Show when={filtered().length > 0} fallback={
        <Empty icon="ph-users" title="没有联系人" description="添加第一位联系人开始。" />
      }>
        <div style={{ "max-width": "840px", margin: "0 auto", padding: "0 var(--space-5) var(--space-5)" }}>
          <For each={grouped()}>
            {([group, list]) => (
              <section style={{ "margin-bottom": "var(--space-5)" }}>
                <Show when={group}>
                  <h3 style={{ "font-family": "var(--font-display)", "font-size": "var(--text-h4)", "font-weight": "800", margin: "0 0 var(--space-3)" }}>
                    {group}
                    <span style={{ "font-size": "var(--text-caption)", color: "var(--text-muted)", "font-weight": "500", "margin-left": "8px" }}>
                      {list.length}
                    </span>
                  </h3>
                </Show>
                <div style={{ display: "grid", "grid-template-columns": "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--space-3)" }}>
                  <For each={list}>
                    {(c) => (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => open(c.id)}
                        onKeyDown={(e) => { if (e.key === "Enter") open(c.id); }}
                        style={{
                          display: "flex",
                          gap: "var(--space-3)",
                          padding: "var(--space-3)",
                          background: "var(--paper-light)",
                          border: "0.5px solid var(--border)",
                          "border-radius": "var(--radius-md)",
                          "text-align": "left",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper-mid)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--paper-light)")}
                      >
                        <Avatar name={c.name} src={c.avatar} size={40} />
                        <div style={{ flex: 1, "min-width": 0 }}>
                          <strong style={{ "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis", display: "block" }}>
                            {c.name}
                          </strong>
                          <p style={{ margin: "2px 0 0", "font-size": "var(--text-caption)", color: "var(--text-secondary)", "white-space": "nowrap", overflow: "hidden", "text-overflow": "ellipsis" }}>
                            {c.title}{c.title && c.company ? " · " : ""}{c.company}
                          </p>
                          <div style={{ display: "flex", gap: "4px", "margin-top": "4px" }}>
                            <span style={{
                              padding: "1px 6px",
                              background: `${STAGE_COLOR[c.stage]}20`,
                              color: STAGE_COLOR[c.stage],
                              "border-radius": "var(--radius-pill)",
                              "font-size": "10px",
                              "font-weight": "700",
                            }}>
                              {STAGE_LABEL[c.stage]}
                            </span>
                            <span style={{ "font-size": "10px", color: "var(--text-muted)", "align-self": "center" }}>
                              健康度 {c.health}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditing(c); }}
                          aria-label="Edit"
                          style={{ color: "var(--text-muted)", "align-self": "center", padding: "4px" }}
                        >
                          <Icon name="ph-pencil-simple" size={14} />
                        </button>
                      </div>
                    )}
                  </For>
                </div>
              </section>
            )}
          </For>
        </div>
      </Show>

      <Show when={creating()}>
        <ContactEditModal contact={newContact()} isNew onClose={() => setCreating(false)} onSave={onSave} onDelete={() => onRemove(editing()?.id ?? "")} />
      </Show>
      <Show when={editing() && !creating()}>
        <ContactEditModal contact={editing()!} isNew={false} onClose={() => setEditing(null)} onSave={onSave} onDelete={() => onRemove(editing()!.id)} />
      </Show>
    </div>
  );
}

function ContactEditModal(props: {
  contact: Contact;
  isNew: boolean;
  onClose: () => void;
  onSave: (c: Contact) => void;
  onDelete: () => void;
}) {
  const [draft, setDraft] = createSignal<Contact>(JSON.parse(JSON.stringify(props.contact)));

  return (
    <Modal
      open
      onClose={props.onClose}
      title={props.isNew ? "New contact" : "Edit contact"}
      width="640px"
      footer={
        <>
          <Show when={!props.isNew}>
            <button onClick={props.onDelete} style={{ padding: "8px 16px", color: "var(--coral)", "font-size": "var(--text-caption)" }}>
              Delete
            </button>
          </Show>
          <button onClick={props.onClose} style={{ padding: "8px 16px", color: "var(--text-secondary)", "font-size": "var(--text-caption)" }}>
            取消
          </button>
          <button onClick={() => props.onSave(draft())} style={{
            padding: "10px 20px",
            background: "var(--palm)",
            color: "white",
            "border-radius": "var(--radius-pill)",
            "font-weight": "700",
            "font-size": "var(--text-caption)",
          }}>
            保存
          </button>
        </>
      }
    >
      <Field label="Name">
        <input value={draft().name} onInput={(e) => setDraft({ ...draft(), name: e.currentTarget.value })} style={inputStyle} />
      </Field>
      <Field label="Title">
        <input value={draft().title} onInput={(e) => setDraft({ ...draft(), title: e.currentTarget.value })} style={inputStyle} />
      </Field>
      <Field label="Company">
        <input value={draft().company} onInput={(e) => setDraft({ ...draft(), company: e.currentTarget.value })} style={inputStyle} />
      </Field>
      <Field label="Email">
        <input value={draft().emails[0]?.value ?? ""} onInput={(e) => setDraft({ ...draft(), emails: e.currentTarget.value ? [{ value: e.currentTarget.value, label: "work" }] : [] })} style={inputStyle} />
      </Field>
      <Field label="Phone">
        <input value={draft().phones[0]?.value ?? ""} onInput={(e) => setDraft({ ...draft(), phones: e.currentTarget.value ? [{ value: e.currentTarget.value, label: "work" }] : [] })} style={inputStyle} />
      </Field>
      <Field label="Stage">
        <select value={draft().stage} onChange={(e) => setDraft({ ...draft(), stage: e.currentTarget.value as Contact["stage"] })} style={inputStyle}>
          <option value="explore">探索</option>
          <option value="build">建立</option>
          <option value="active">活跃</option>
          <option value="maintain">维护</option>
          <option value="cold">冷淡</option>
          <option value="rekindle">重新激活</option>
        </select>
      </Field>
      <Field label="Default bucket">
        <select value={draft().defaultBucket} onChange={(e) => setDraft({ ...draft(), defaultBucket: e.currentTarget.value as Contact["defaultBucket"] })} style={inputStyle}>
          <option value="imbox">Imbox</option>
          <option value="feed">Stream</option>
          <option value="paperTrail">Records</option>
          <option value="trash">Trash</option>
          <option value="spam">Spam</option>
        </select>
      </Field>
      <Field label="Notes">
        <textarea value={draft().notes} onInput={(e) => setDraft({ ...draft(), notes: e.currentTarget.value })} rows={3} style={{ ...inputStyle, "min-height": "80px", "font-family": "var(--font-body)", resize: "vertical" }} />
      </Field>
    </Modal>
  );
}

function Field(props: { label: string; children: unknown }) {
  return (
    <label style={{ display: "block", "margin-bottom": "var(--space-3)" }}>
      <span style={{ display: "block", "font-size": "var(--text-micro)", color: "var(--text-muted)", "font-weight": "700", "margin-bottom": "4px" }}>{props.label}</span>
      {props.children as never}
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
};