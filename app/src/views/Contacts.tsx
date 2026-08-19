/** Contacts view — list with filter pills, group toggle, by-company.
 * Spec: prototype-v11 §3.4.
 */

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { listContacts, upsertContact, deleteContact } from "../stores/data";
import { Avatar } from "../components/Avatar";
import { Empty, ErrorState } from "../components/Empty";
import { Icon } from "../components/Icon";
import { SkeletonList } from "../components/Skeleton";
import { ContactEditModal } from "../components/ContactEditModal";
import { uid } from "../utils/id";
import { isoNow } from "../utils/date";
import { STAGE_COLOR, STAGE_LABEL, healthToGroup } from "../utils/labels";
import {
  setDetailOpen,
  setSelectedContactId,
  showToast,
  openCompanyDetail,
} from "../stores/ui";
import { useRefreshEffect } from "../utils/gestures";
import type { Contact } from "../types";

const FILTERS = [
  { id: "all", label: "全部" },
  { id: "active", label: "活跃" },
  { id: "risk", label: "需跟进" },
  { id: "cold", label: "冷淡" },
] as const;

export function Contacts() {
  const [contacts, { refetch }] = createResource(listContacts);

  useRefreshEffect(() => {
    void refetch();
  });

  const [filter, setFilter] =
    createSignal<(typeof FILTERS)[number]["id"]>("all");
  const [groupBy, setGroupBy] = createSignal<"all" | "company">("all");
  const [search, setSearch] = createSignal("");
  const [editing, setEditing] = createSignal<Contact | null>(null);
  const [creating, setCreating] = createSignal(false);

  const filtered = createMemo<Contact[]>(() => {
    const list = contacts() ?? [];
    let out = list;
    const f = filter();
    if (f === "active") out = out.filter((c) => c.grp === "active");
    else if (f === "risk") out = out.filter((c) => c.grp === "risk");
    else if (f === "cold") out = out.filter((c) => c.grp === "cold");
    const q = search().trim().toLowerCase();
    if (q) {
      out = out.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.company.toLowerCase().includes(q) ||
          c.emails.some((e) => e.value.toLowerCase().includes(q)),
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
    health: 75,
    sc: 50,
    scC: "#a09aae",
    scL: "",
    lc: "刚刚",
    grp: "active",
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
    await upsertContact({ ...c, grp: healthToGroup(c.health) });
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
      <header
        style={{
          padding: "var(--space-5)",
          display: "flex",
          "align-items": "center",
          gap: "var(--space-4)",
          "flex-wrap": "wrap",
        }}
      >
        <h2
          style={{
            "font-family": "var(--font-display)",
            "font-size": "var(--text-h3)",
            "font-weight": "800",
            margin: 0,
            flex: 1,
          }}
        >
          Contacts
        </h2>
        <button
          onClick={() => setCreating(true)}
          style={{
            padding: "8px 16px",
            background: "var(--palm)",
            color: "white",
            "border-radius": "var(--radius-pill)",
            "font-size": "var(--text-caption)",
            "font-weight": "700",
            display: "flex",
            "align-items": "center",
            gap: "4px",
          }}
        >
          <Icon name="ph-plus" size={12} /> Add
        </button>
      </header>

      <div
        style={{
          padding: "0 var(--space-5) var(--space-4)",
          display: "flex",
          gap: "var(--space-3)",
          "flex-wrap": "wrap",
          "align-items": "center",
        }}
      >
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
                  background:
                    filter() === f.id ? "var(--palm-soft)" : "var(--paper-mid)",
                  color:
                    filter() === f.id ? "var(--palm)" : "var(--text-secondary)",
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
          <Icon
            name={groupBy() === "all" ? "ph-list" : "ph-buildings"}
            size={12}
          />
          {groupBy() === "all" ? "按公司分组" : "全部"}
        </button>
      </div>

      <Show
        when={!contacts.error}
        fallback={
          <ErrorState
            title="联系人加载失败"
            message={String(contacts.error ?? "")}
            retry={() => void refetch()}
          />
        }
      >
        <></>
      </Show>
      <Show
        when={contacts.state !== "pending"}
        fallback={
          <div
            style={{
              "max-width": "840px",
              margin: "var(--space-4) auto",
              padding: "0 var(--space-5)",
            }}
          >
            <SkeletonList count={8} />
          </div>
        }
      >
        <Show
          when={filtered().length > 0}
          fallback={
            <Empty
              icon="ph-users"
              title="没有联系人"
              description="添加第一位联系人开始。"
            />
          }
        >
          <div
            style={{
              "max-width": "840px",
              margin: "0 auto",
              padding: "0 var(--space-5) var(--space-5)",
            }}
          >
            <For each={grouped()}>
              {([group, list]) => (
                <section style={{ "margin-bottom": "var(--space-5)" }}>
                  <Show when={group}>
                    <button
                      data-testid="company-group-header"
                      aria-label={`Open company ${group}`}
                      onClick={() => openCompanyDetail(group)}
                      style={{
                        "font-family": "var(--font-display)",
                        "font-size": "var(--text-h4)",
                        "font-weight": "800",
                        margin: "0 0 var(--space-3)",
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        color: "var(--text-primary)",
                        "text-align": "left",
                      }}
                    >
                      {group}
                      <span
                        style={{
                          "font-size": "var(--text-caption)",
                          color: "var(--text-muted)",
                          "font-weight": "500",
                          "margin-left": "8px",
                        }}
                      >
                        {list.length}
                      </span>
                    </button>
                  </Show>
                  <div
                    style={{
                      display: "grid",
                      "grid-template-columns":
                        "repeat(auto-fill, minmax(220px, 1fr))",
                      gap: "var(--space-3)",
                    }}
                  >
                    <For each={list}>
                      {(c) => (
                        <div
                          data-testid="contact-card"
                          data-contact-id={c.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => open(c.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") open(c.id);
                          }}
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
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "var(--paper-mid)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background =
                              "var(--paper-light)")
                          }
                        >
                          <Avatar name={c.name} src={c.avatar} size={40} />
                          <div style={{ flex: 1, "min-width": 0 }}>
                            <strong
                              style={{
                                "white-space": "nowrap",
                                overflow: "hidden",
                                "text-overflow": "ellipsis",
                                display: "block",
                              }}
                            >
                              {c.name}
                            </strong>
                            <p
                              style={{
                                margin: "2px 0 0",
                                "font-size": "var(--text-caption)",
                                color: "var(--text-secondary)",
                                "white-space": "nowrap",
                                overflow: "hidden",
                                "text-overflow": "ellipsis",
                              }}
                            >
                              {c.title}
                              {c.title && c.company ? " · " : ""}
                              {c.company}
                            </p>
                            <div
                              style={{
                                display: "flex",
                                gap: "4px",
                                "margin-top": "4px",
                              }}
                            >
                              <span
                                style={{
                                  padding: "1px 6px",
                                  background: `${STAGE_COLOR[c.stage]}20`,
                                  color: STAGE_COLOR[c.stage],
                                  "border-radius": "var(--radius-pill)",
                                  "font-size": "10px",
                                  "font-weight": "700",
                                }}
                              >
                                {STAGE_LABEL[c.stage]}
                              </span>
                              <span
                                style={{
                                  "font-size": "10px",
                                  color: "var(--text-muted)",
                                  "align-self": "center",
                                }}
                              >
                                健康度 {c.health}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditing(c);
                            }}
                            aria-label="Edit"
                            style={{
                              color: "var(--text-muted)",
                              "align-self": "center",
                              padding: "4px",
                            }}
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
      </Show>

      <Show when={creating()}>
        <ContactEditModal
          contact={newContact()}
          isNew
          onClose={() => setCreating(false)}
          onSave={onSave}
          onDelete={() => onRemove(editing()?.id ?? "")}
        />
      </Show>
      <Show when={editing() && !creating()}>
        <ContactEditModal
          contact={editing()!}
          isNew={false}
          onClose={() => setEditing(null)}
          onSave={onSave}
          onDelete={() => onRemove(editing()!.id)}
        />
      </Show>
    </div>
  );
}
