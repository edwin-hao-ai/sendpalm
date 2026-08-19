/** Insights dashboard — 7 cards.
 * Spec: prototype-v11 §3.7.
 *
 * The 3 cards that need messages (weekly volume / top people / reply
 * time) all use the same narrow projection. We pull that once via
 * `listMessagesForInsights({ since: now-30d })` which returns just
 * {id, pid, st, thread_id, bucket, direction} — no body / body_html /
 * labels / attachments / trackers. On the Feishu account this drops
 * the IPC payload from ~80 MB (3,900 × 80 KB body_html) to ~600 KB
 * (3,900 × 150 bytes).
 */

import { For, Show, createMemo, createResource } from "solid-js";
import {
  listContacts,
  listFollowUps,
  listAgentTasks,
  listEvents,
  listMessagesForInsights,
} from "../stores/data";
import { Icon } from "../components/Icon";
import { Empty } from "../components/Empty";
import { relativeTime } from "../utils/date";
import { Avatar } from "../components/Avatar";
import { useRefreshEffect } from "../utils/gestures";
import {
  computeReplyTimeStats,
  formatDuration,
} from "../utils/insights";

export function Insights() {
  const [contacts, { refetch: refetchContacts }] = createResource(listContacts);
  const [followUps, { refetch: refetchFollowUps }] =
    createResource(listFollowUps);
  const [agentTasks, { refetch: refetchAgentTasks }] = createResource(() =>
    listAgentTasks(),
  );
  const [events, { refetch: refetchEvents }] = createResource(listEvents);

  /** 30-day window: powers weekly volume (7d) AND reply time (30d). */
  const [messages, { refetch: refetchMessages }] = createResource(
    () => ({
      since: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    }),
    listMessagesForInsights,
  );

  useRefreshEffect(() => {
    void refetchContacts();
    void refetchFollowUps();
    void refetchAgentTasks();
    void refetchEvents();
    void refetchMessages();
  });

  const weeklyVolume = createMemo(() => {
    const now = new Date();
    const week: number[] = [0, 0, 0, 0, 0, 0, 0];
    for (const m of messages() ?? []) {
      const d = new Date(m.st);
      const daysAgo = Math.floor((now.getTime() - d.getTime()) / 86400_000);
      if (daysAgo >= 0 && daysAgo < 7) {
        const idx = 6 - daysAgo;
        week[idx] = (week[idx] ?? 0) + 1;
      }
    }
    const total = week.reduce((a, b) => a + b, 0);
    const max = Math.max(1, ...week);
    return { week, total, max };
  });

  const topPeople = createMemo(() => {
    const counts = new Map<string, number>();
    for (const m of messages() ?? []) {
      if (m.bucket === "imbox") counts.set(m.pid, (counts.get(m.pid) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, n]) => ({
        contact: (contacts() ?? []).find((c) => c.id === id),
        count: n,
      }))
      .filter((x) => x.contact);
  });

  const replyTime = createMemo(() =>
    computeReplyTimeStats(messages() ?? []),
  );

  const channelShare = createMemo(() => {
    const map = new Map<string, number>();
    for (const c of contacts() ?? []) {
      for (const ch of c.ch ?? []) {
        map.set(ch, (map.get(ch) ?? 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  });

  const pendingFU = createMemo(
    () => (followUps() ?? []).filter((f) => f.status === "pending").length,
  );
  const agentActions = createMemo(() => {
    const list = agentTasks() ?? [];
    const done = list.filter((t) => t.status === "done").length;
    const doing = list.filter((t) => t.status === "doing").length;
    return { done, doing, total: list.length };
  });

  const healthDist = createMemo(() => {
    const list = contacts() ?? [];
    const buckets = { active: 0, risk: 0, cold: 0, other: 0 };
    for (const c of list) {
      if (c.grp === "active") buckets.active++;
      else if (c.grp === "risk") buckets.risk++;
      else if (c.grp === "cold") buckets.cold++;
      else buckets.other++;
    }
    return buckets;
  });

  const upcomingEvents = createMemo(() => {
    const list = events() ?? [];
    return list
      .filter((e) => new Date(e.dt) >= new Date())
      .sort((a, b) => new Date(a.dt).getTime() - new Date(b.dt).getTime())
      .slice(0, 3);
  });

  return (
    <div
      style={{
        padding: "var(--space-5)",
        animation: "view-enter 0.3s var(--ease-out) both",
      }}
    >
      <h2
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-h3)",
          "font-weight": "800",
          margin: "0 0 var(--space-5)",
        }}
      >
        Insights
      </h2>

      <div
        style={{
          display: "grid",
          "grid-template-columns": "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "var(--space-4)",
          "max-width": "1100px",
          margin: "0 auto",
        }}
      >
        {/* Weekly volume */}
        <Card title="Weekly volume" icon="ph-trend-up">
          <p
            style={{
              "font-size": "32px",
              "font-weight": "800",
              "font-family": "var(--font-display)",
              margin: 0,
              color: "var(--palm)",
            }}
          >
            {weeklyVolume().total}
          </p>
          <p
            style={{
              "font-size": "var(--text-caption)",
              color: "var(--text-muted)",
              margin: "var(--space-1) 0 var(--space-3)",
            }}
          >
            条消息 / 7 天
          </p>
          <div
            style={{
              display: "flex",
              "align-items": "flex-end",
              gap: "4px",
              height: "60px",
            }}
          >
            <For each={weeklyVolume().week}>
              {(v, i) => (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    "flex-direction": "column",
                    "align-items": "center",
                    gap: "4px",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: `${(v / weeklyVolume().max) * 100}%`,
                      "min-height": "2px",
                      background:
                        i() === 6 ? "var(--palm)" : "var(--paper-dark)",
                      "border-radius": "var(--radius-sm)",
                    }}
                  />
                  <span
                    style={{ "font-size": "10px", color: "var(--text-muted)" }}
                  >
                    {["S", "M", "T", "W", "T", "F", "S"][i()]}
                  </span>
                </div>
              )}
            </For>
          </div>
        </Card>

        {/* Top people */}
        <Card title="Top People" icon="ph-users">
          <Show
            when={topPeople().length > 0}
            fallback={<Empty icon="ph-users" title="暂无" />}
          >
            <For each={topPeople()}>
              {(p) => (
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--space-2)",
                    padding: "var(--space-2) 0",
                  }}
                >
                  <Avatar
                    name={p.contact!.name}
                    src={p.contact!.avatar}
                    size={28}
                  />
                  <div style={{ flex: 1, "min-width": 0 }}>
                    <strong style={{ "font-size": "var(--text-body-sm)" }}>
                      {p.contact!.name}
                    </strong>
                    <p
                      style={{
                        margin: 0,
                        "font-size": "10px",
                        color: "var(--text-muted)",
                      }}
                    >
                      {p.contact!.company}
                    </p>
                  </div>
                  <span
                    style={{
                      "font-size": "var(--text-caption)",
                      color: "var(--text-secondary)",
                      "font-weight": "700",
                    }}
                  >
                    {p.count}
                  </span>
                </div>
              )}
            </For>
          </Show>
        </Card>

        {/* Reply time */}
        <Card title="平均回复时间" icon="ph-clock">
          <p
            style={{
              "font-size": "32px",
              "font-weight": "800",
              "font-family": "var(--font-display)",
              margin: 0,
              color: "var(--cobalt)",
            }}
          >
            {replyTime().medianHours === null
              ? "—"
              : formatDuration(replyTime().medianHours!)}
          </p>
          <p
            style={{
              "font-size": "var(--text-caption)",
              color: "var(--text-muted)",
              margin: "var(--space-1) 0",
            }}
          >
            近 30 天 · 中位数
          </p>
          <Show when={replyTime().total > 0}>
            <p
              style={{
                "margin-top": "var(--space-3)",
                "font-size": "var(--text-caption)",
                color: "var(--text-secondary)",
              }}
            >
              <Icon name="ph-arrow-u-up-left" size={11} /> 已回复{" "}
              {replyTime().replied} · 未回复 {replyTime().noReply} · 共{" "}
              {replyTime().total} 封
            </p>
          </Show>
        </Card>

        {/* Channel share */}
        <Card title="Channel share" icon="ph-share-network">
          <Show
            when={channelShare().length > 0}
            fallback={
              <p
                style={{
                  color: "var(--text-muted)",
                  "font-size": "var(--text-caption)",
                }}
              >
                暂无
              </p>
            }
          >
            <For each={channelShare()}>
              {([ch, n]) => (
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--space-2)",
                    padding: "var(--space-1) 0",
                  }}
                >
                  <span style={{ "font-size": "var(--text-body-sm)", flex: 1 }}>
                    {ch}
                  </span>
                  <span
                    style={{
                      "font-size": "var(--text-caption)",
                      "font-weight": "700",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {n}
                  </span>
                </div>
              )}
            </For>
          </Show>
        </Card>

        {/* Pending follow-ups */}
        <Card title="Pending follow-ups" icon="ph-bell-ringing">
          <p
            style={{
              "font-size": "32px",
              "font-weight": "800",
              "font-family": "var(--font-display)",
              margin: 0,
              color: pendingFU() > 0 ? "var(--orange)" : "var(--text-muted)",
            }}
          >
            {pendingFU()}
          </p>
          <p
            style={{
              "font-size": "var(--text-caption)",
              color: "var(--text-muted)",
              margin: "var(--space-1) 0",
            }}
          >
            待处理跟进
          </p>
        </Card>

        {/* Agent actions */}
        <Card title="Agent actions" icon="ph-sparkle">
          <div style={{ display: "flex", gap: "var(--space-4)" }}>
            <div>
              <p
                style={{
                  "font-size": "24px",
                  "font-weight": "800",
                  "font-family": "var(--font-display)",
                  margin: 0,
                  color: "var(--agent)",
                }}
              >
                {agentActions().total}
              </p>
              <p style={{ "font-size": "10px", color: "var(--text-muted)" }}>
                Total
              </p>
            </div>
            <div>
              <p
                style={{
                  "font-size": "24px",
                  "font-weight": "800",
                  "font-family": "var(--font-display)",
                  margin: 0,
                  color: "var(--palm)",
                }}
              >
                {agentActions().done}
              </p>
              <p style={{ "font-size": "10px", color: "var(--text-muted)" }}>
                Done
              </p>
            </div>
            <div>
              <p
                style={{
                  "font-size": "24px",
                  "font-weight": "800",
                  "font-family": "var(--font-display)",
                  margin: 0,
                  color: "var(--yellow)",
                }}
              >
                {agentActions().doing}
              </p>
              <p style={{ "font-size": "10px", color: "var(--text-muted)" }}>
                Doing
              </p>
            </div>
          </div>
        </Card>

        {/* Health distribution */}
        <Card title="Health distribution" icon="ph-heartbeat">
          <Show
            when={Object.values(healthDist()).some((v) => v > 0)}
            fallback={
              <p
                style={{
                  color: "var(--text-muted)",
                  "font-size": "var(--text-caption)",
                }}
              >
                暂无联系人
              </p>
            }
          >
            <For
              each={[
                {
                  label: "活跃",
                  count: healthDist().active,
                  color: "var(--status-active)",
                },
                {
                  label: "需跟进",
                  count: healthDist().risk,
                  color: "var(--status-warning)",
                },
                {
                  label: "冷淡",
                  count: healthDist().cold,
                  color: "var(--status-danger)",
                },
                {
                  label: "其他",
                  count: healthDist().other,
                  color: "var(--text-muted)",
                },
              ]}
            >
              {(b) => {
                const total =
                  healthDist().active +
                  healthDist().risk +
                  healthDist().cold +
                  healthDist().other;
                return (
                  <div
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "var(--space-2)",
                      padding: "var(--space-1) 0",
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        "border-radius": "50%",
                        background: b.color,
                      }}
                    />
                    <span
                      style={{ "font-size": "var(--text-body-sm)", flex: 1 }}
                    >
                      {b.label}
                    </span>
                    <span
                      style={{
                        "font-size": "var(--text-caption)",
                        "font-weight": "700",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {b.count}
                    </span>
                    <span
                      style={{
                        "font-size": "10px",
                        color: "var(--text-muted)",
                        "min-width": "32px",
                        "text-align": "right",
                      }}
                    >
                      {total > 0
                        ? `${Math.round((b.count / total) * 100)}%`
                        : "0%"}
                    </span>
                  </div>
                );
              }}
            </For>
          </Show>
        </Card>

        {/* Upcoming events */}
        <Card title="Upcoming meetings" icon="ph-calendar-blank">
          <Show
            when={upcomingEvents().length > 0}
            fallback={
              <p
                style={{
                  color: "var(--text-muted)",
                  "font-size": "var(--text-caption)",
                }}
              >
                暂无
              </p>
            }
          >
            <For each={upcomingEvents()}>
              {(e) => (
                <div
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--space-2)",
                    padding: "var(--space-1) 0",
                  }}
                >
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      "border-radius": "50%",
                      background: e.color,
                    }}
                  />
                  <span style={{ "font-size": "var(--text-body-sm)", flex: 1 }}>
                    {e.title}
                  </span>
                  <span
                    style={{
                      "font-size": "var(--text-micro)",
                      color: "var(--text-muted)",
                    }}
                  >
                    {relativeTime(e.dt)}
                  </span>
                </div>
              )}
            </For>
          </Show>
        </Card>
      </div>
    </div>
  );
}

function Card(props: { title: string; icon: string; children: unknown }) {
  return (
    <div
      style={{
        padding: "var(--space-4)",
        background: "var(--paper-light)",
        border: "0.5px solid var(--border)",
        "border-radius": "var(--radius-lg)",
        "box-shadow": "var(--shadow-sm)",
      }}
    >
      <h3
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-caption)",
          "font-weight": "800",
          "letter-spacing": "0.04em",
          "text-transform": "uppercase",
          color: "var(--text-muted)",
          margin: "0 0 var(--space-3)",
          display: "flex",
          "align-items": "center",
          gap: "var(--space-2)",
        }}
      >
        <Icon name={props.icon} size={12} />
        {props.title}
      </h3>
      {props.children as never}
    </div>
  );
}
