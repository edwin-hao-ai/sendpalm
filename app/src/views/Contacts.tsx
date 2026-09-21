/** Contacts view — list with filter pills, group toggle, by-company.
 * Spec: prototype-v11 §3.4.
 */

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import {
  listContacts,
  listTasks,
  upsertContact,
  deleteContact,
  deleteTask,
} from "../stores/data";
import { Avatar } from "../components/Avatar";
import { Empty, ErrorState } from "../components/Empty";
import { Icon } from "../components/Icon";
import { ConfirmDialog } from "../components/ConfirmDialog";
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

export type ContactFilterId = (typeof FILTERS)[number]["id"];

/** Pure filter/search step, exported for tests. */
export function filterContacts(
  list: Contact[],
  filter: ContactFilterId,
  query: string,
): Contact[] {
  let out = list;
  if (filter === "active" || filter === "risk" || filter === "cold") {
    out = out.filter((c) => c.grp === filter);
  }
  const q = query.trim().toLowerCase();
  if (q) {
    out = out.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.company.toLowerCase().includes(q) ||
        c.emails.some((e) => e.value.toLowerCase().includes(q)),
    );
  }
  return out;
}

/** Semantic label + bar color for the numeric health score. */
export function healthLabel(health: number): string {
  const g = healthToGroup(health);
  return g === "active" ? "活跃" : g === "risk" ? "一般" : "冷淡";
}

export function healthColor(health: number): string {
  const g = healthToGroup(health);
  return g === "active"
    ? "var(--status-active)"
    : g === "risk"
      ? "var(--status-warning)"
      : "var(--status-danger)";
}

export function Contacts() {
  const [contacts, { refetch }] = createResource(listContacts);

  useRefreshEffect(() => {
    void refetch();
  });

  const [filter, setFilter] = createSignal<ContactFilterId>("all");
  const [groupBy, setGroupBy] = createSignal<"all" | "company">("all");
  const [search, setSearch] = createSignal("");
  const [editing, setEditing] = createSignal<Contact | null>(null);
  const [creating, setCreating] = createSignal(false);
  const [deleteTarget, setDeleteTarget] = createSignal<Contact | null>(null);
  const [deleting, setDeleting] = createSignal(false);

  const filtered = createMemo<Contact[]>(() =>
    filterContacts(contacts() ?? [], filter(), search()),
  );

  const isFiltering = () => search().trim() !== "" || filter() !== "all";

  const grouped = createMemo<[string, Contact[]][]>(() => {
    if (groupBy() === "all") return [["", filtered()]];
    const map = new Map<string, Contact[]>();
    for (const c of filtered()) {
      const key = c.company || "（未填公司）";
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

  /** Delete a contact and cascade-clean the tasks that reference it
   *  (mirrors the prototype's confirmDestructive + task cleanup). The
   *  modal must close on success so the user can't resurrect the
   *  deleted contact by hitting Save in the stale edit form. */
  const confirmRemove = async (target: Contact) => {
    if (deleting()) return;
    setDeleting(true);
    try {
      const related = (await listTasks()).filter(
        (t) => t.relatedContactId === target.id,
      );
      for (const t of related) await deleteTask(t.id);
      await deleteContact(target.id);
      await refetch();
      setEditing(null);
      setCreating(false);
      showToast({ message: `已删除 ${target.name || "该联系人"}`, kind: "info" });
    } catch (err) {
      showToast({
        message: "删除失败，请重试",
        kind: "error",
        source: "contacts",
        detail: String(err),
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ animation: "view-enter 0.3s var(--ease-out) both" }}>
      <div
        style={{
          "max-width": "840px",
          margin: "0 auto",
          padding: "0 var(--space-5) var(--space-5)",
        }}
      >
        <header
          style={{
            padding: "var(--space-5) 0",
            display: "flex",
            "align-items": "center",
            gap: "var(--space-4)",
            "flex-wrap": "wrap",
          }}
        >
          <h1
            style={{
              "font-family": "var(--font-display)",
              "font-size": "var(--text-h1)",
              "font-weight": "800",
              margin: 0,
              flex: 1,
            }}
          >
            联系人
          </h1>
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
              cursor: "pointer",
              border: "none",
            }}
          >
            <Icon name="ph-plus" size={12} /> 新建
          </button>
        </header>

        <div
          style={{
            padding: "0 0 var(--space-4)",
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
            aria-label="搜索联系人"
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
                    padding: "6px 12px",
                    "min-height": "32px",
                    "border-radius": "var(--radius-pill)",
                    border: "none",
                    background:
                      filter() === f.id ? "var(--palm-soft)" : "var(--paper-mid)",
                    color:
                      filter() === f.id ? "var(--palm)" : "var(--text-secondary)",
                    "font-size": "var(--text-caption)",
                    "font-weight": filter() === f.id ? "700" : "500",
                    cursor: "pointer",
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
              padding: "6px 12px",
              "min-height": "32px",
              "border-radius": "var(--radius-pill)",
              border: "none",
              background: "var(--paper-mid)",
              color: "var(--text-secondary)",
              "font-size": "var(--text-caption)",
              display: "flex",
              "align-items": "center",
              gap: "4px",
              cursor: "pointer",
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
              message="请检查网络后重试。"
              retry={() => void refetch()}
            />
          }
        >
          <Show
            when={contacts.state !== "pending"}
            fallback={<SkeletonList count={8} />}
          >
            <Show
              when={filtered().length > 0}
              fallback={
                <Show
                  when={isFiltering()}
                  fallback={
                    <Empty
                      icon="ph-users"
                      title="还没有联系人"
                      description="新建第一位联系人，或同步邮箱后自动收录发件人。"
                      action={{
                        label: "新建联系人",
                        onClick: () => setCreating(true),
                      }}
                    />
                  }
                >
                  <Empty
                    icon="ph-magnifying-glass"
                    title="没有匹配的联系人"
                    description="试试别的关键词，或清除筛选条件。"
                    action={{
                      label: "清除筛选",
                      onClick: () => {
                        setSearch("");
                        setFilter("all");
                      },
                    }}
                  />
                </Show>
              }
            >
              <For each={grouped()}>
                {([group, list]) => (
                  <section style={{ "margin-bottom": "var(--space-5)" }}>
                    <Show when={group}>
                      <button
                        data-testid="company-group-header"
                        aria-label={`查看公司 ${group}`}
                        onClick={() => openCompanyDetail(group)}
                        style={{
                          "font-family": "var(--font-display)",
                          "font-size": "var(--text-h4)",
                          "font-weight": "800",
                          margin: "0 0 var(--space-3)",
                          background: "transparent",
                          border: "none",
                          padding: "4px 8px",
                          "border-radius": "var(--radius-md)",
                          cursor: "pointer",
                          color: "var(--text-primary)",
                          "text-align": "left",
                          display: "inline-flex",
                          "align-items": "center",
                          gap: "4px",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "var(--paper-mid)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        {group}
                        <span
                          style={{
                            "font-size": "var(--text-caption)",
                            color: "var(--text-muted)",
                            "font-weight": "500",
                          }}
                        >
                          {list.length}
                        </span>
                        <Icon
                          name="ph-caret-right"
                          size={14}
                          style={{ color: "var(--text-muted)" }}
                        />
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
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                open(c.id);
                              }
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
                              transition:
                                "transform var(--duration-fast) var(--ease-out), box-shadow var(--duration-fast) var(--ease-out)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.transform =
                                "translateY(-2px)";
                              e.currentTarget.style.boxShadow =
                                "var(--shadow-md)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.transform = "";
                              e.currentTarget.style.boxShadow = "";
                            }}
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
                                  "align-items": "center",
                                  gap: "var(--space-2)",
                                  "margin-top": "6px",
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
                                  title={`关系健康度 ${c.health}/100：根据互动频率自动估算`}
                                  style={{
                                    display: "inline-flex",
                                    "align-items": "center",
                                    gap: "4px",
                                    "font-size": "10px",
                                    color: "var(--text-muted)",
                                  }}
                                >
                                  <span
                                    aria-hidden="true"
                                    style={{
                                      width: "32px",
                                      height: "3px",
                                      "border-radius": "2px",
                                      background: "var(--paper-dark)",
                                      overflow: "hidden",
                                      display: "inline-block",
                                    }}
                                  >
                                    <span
                                      style={{
                                        display: "block",
                                        height: "100%",
                                        width: `${Math.min(100, Math.max(0, c.health))}%`,
                                        background: healthColor(c.health),
                                      }}
                                    />
                                  </span>
                                  {healthLabel(c.health)}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditing(c);
                              }}
                              aria-label="编辑联系人"
                              title="编辑联系人"
                              style={{
                                color: "var(--text-muted)",
                                "align-self": "center",
                                padding: "10px",
                                cursor: "pointer",
                                background: "transparent",
                                border: "none",
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
            </Show>
          </Show>
        </Show>
      </div>

      <Show when={creating()}>
        <ContactEditModal
          contact={newContact()}
          isNew
          onClose={() => setCreating(false)}
          onSave={onSave}
          onDelete={() => setDeleteTarget(editing())}
        />
      </Show>
      <Show when={editing() && !creating()}>
        <ContactEditModal
          contact={editing()!}
          isNew={false}
          onClose={() => setEditing(null)}
          onSave={onSave}
          onDelete={() => setDeleteTarget(editing())}
        />
      </Show>
      <ConfirmDialog
        open={deleteTarget() !== null}
        title={`删除 ${deleteTarget()?.name || "该联系人"}？`}
        body="与该联系人相关的任务也会一并删除，此操作无法撤销。"
        confirmLabel={deleting() ? "正在删除…" : "删除"}
        onConfirm={() => {
          // Capture before ConfirmDialog clears the target via onCancel.
          const t = deleteTarget();
          if (t) void confirmRemove(t);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
