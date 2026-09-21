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
 *
 * Session 2026-08-21 perf pass: collapsed 5 parallel `createResource`
 * calls into a single `getInsightsSummary()` resource. The 5-cascade
 * was the bottleneck (each resource resolving re-ran every downstream
 * `createMemo` against half-loaded data). With one resource the JS
 * derivation runs exactly once, after the slowest read resolves. The
 * 5 SQL hits are unchanged — IPC is the same — but the mount cost
 * drops from 5x to 1x.
 */

import { For, Show, createMemo, createResource } from "solid-js";
import { getInsightsSummary } from "../stores/data";
import { Icon } from "../components/Icon";
import { Empty, ErrorState } from "../components/Empty";
import { ResourceGate } from "../components/ResourceGate";
import { SkeletonList } from "../components/Skeleton";
import { relativeTime } from "../utils/date";
import { Avatar } from "../components/Avatar";
import { healthToGroup } from "../utils/labels";
import { useRefreshEffect } from "../utils/gestures";
import { computeReplyTimeStats, formatDuration } from "../utils/insights";

export function Insights() {
  const [summary, { refetch }] = createResource(getInsightsSummary);

  useRefreshEffect(() => {
    void refetch();
  });

  // Slice accessors. `createMemo` is overkill here because the
  // resource is a single immutable snapshot until the next refetch,
  // but keeping them as plain function calls means a refetch that
  // updates one field doesn't re-derive the others (Solid's signal
  // graph handles the propagation).
  const contacts = () => summary()?.contacts;
  const followUps = () => summary()?.followUps;
  const agentTasks = () => summary()?.agentTasks;
  const events = () => summary()?.events;
  const messages = () => summary()?.messages;

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

  const replyTime = createMemo(() => computeReplyTimeStats(messages() ?? []));

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
    const buckets = { active: 0, risk: 0, cold: 0 };
    for (const c of list) {
      buckets[healthToGroup(c.health)]++;
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
      <style>{INSIGHTS_CSS}</style>
      <h1
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-h1)",
          "font-weight": "800",
          margin: "0 0 var(--space-5)",
        }}
      >
        洞察
      </h1>

      <ResourceGate
        resource={summary}
        loading={
          <div
            style={{
              display: "grid",
              "grid-template-columns": "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "var(--space-4)",
              "max-width": "1100px",
              margin: "0 auto",
            }}
          >
            <SkeletonList count={5} height={160} />
          </div>
        }
        errorView={() => (
          <ErrorState
            title="洞察加载失败"
            message="请稍后重试；若反复失败，可到顶栏的错误日志里查看详情。"
            retry={() => void refetch()}
          />
        )}
        empty={<Empty icon="ph-chart-line-up" title="暂无数据" />}
        isEmpty={() => weeklyVolume().total === 0 && topPeople().length === 0}
      >
        {() => (
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
            <Card title="本周邮件量" icon="ph-trend-up">
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
                封邮件 / 近 7 天
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
                  {(v, i) => {
                    const day = new Date(Date.now() - (6 - i()) * 86400_000);
                    const label = `${day.getMonth() + 1}月${day.getDate()}日 · ${v} 封`;
                    return (
                      <div
                        style={{
                          flex: 1,
                          display: "flex",
                          "flex-direction": "column",
                          "align-items": "center",
                          gap: "4px",
                          height: "100%",
                          "justify-content": "flex-end",
                        }}
                      >
                        <div
                          title={label}
                          aria-label={label}
                          style={{
                            width: "100%",
                            height: `${(v / weeklyVolume().max) * 100}%`,
                            "min-height": "2px",
                            background: "var(--palm)",
                            opacity: i() === 6 ? 1 : 0.45,
                            "border-radius": "var(--radius-sm)",
                          }}
                        />
                        <span
                          style={{
                            "font-size": "10px",
                            color: "var(--text-muted)",
                          }}
                        >
                          {"日一二三四五六"[day.getDay()]}
                        </span>
                      </div>
                    );
                  }}
                </For>
              </div>
            </Card>

            {/* Top people */}
            <Card title="高频联系人" icon="ph-users">
              <Show
                when={topPeople().length > 0}
                fallback={<Empty icon="ph-users" title="暂无" />}
              >
                <For each={topPeople()}>
                  {(p) => {
                    const max = topPeople()[0]?.count ?? 1;
                    return (
                      <div
                        style={{
                          display: "flex",
                          "align-items": "center",
                          gap: "var(--space-2)",
                          padding: "var(--space-2) 0",
                          position: "relative",
                        }}
                      >
                        <div
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            bottom: 0,
                            height: "3px",
                            background: "var(--paper-mid)",
                            "border-radius": "999px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: "100%",
                              height: "100%",
                              background: "var(--palm-soft)",
                              transform: `scaleX(${p.count / max})`,
                              "transform-origin": "left center",
                            }}
                          />
                        </div>
                        <Avatar
                          name={p.contact!.name}
                          src={p.contact!.avatar}
                          size={28}
                        />
                        <div style={{ flex: 1, "min-width": 0 }}>
                          <strong
                            style={{ "font-size": "var(--text-body-sm)" }}
                          >
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
                          {p.count} 封
                        </span>
                      </div>
                    );
                  }}
                </For>
              </Show>
            </Card>

            {/* Reply time */}
            <Card title="平均回复时间" icon="ph-clock">
              <Show
                when={replyTime().medianHours !== null}
                fallback={
                  <>
                    <p
                      style={{
                        "font-size": "var(--text-body-sm)",
                        "font-weight": "600",
                        color: "var(--text-secondary)",
                        margin: 0,
                      }}
                    >
                      还没有回复数据
                    </p>
                    <p
                      style={{
                        "font-size": "var(--text-caption)",
                        color: "var(--text-muted)",
                        margin: "var(--space-1) 0",
                      }}
                    >
                      回复几封邮件后，这里会显示你的回复速度。
                    </p>
                  </>
                }
              >
                <p
                  style={{
                    "font-size": "32px",
                    "font-weight": "800",
                    "font-family": "var(--font-display)",
                    margin: 0,
                    color: "var(--cobalt)",
                  }}
                >
                  {formatDuration(replyTime().medianHours!)}
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
              </Show>
            </Card>

            {/* Channel share */}
            <Card title="渠道分布" icon="ph-share-network">
              <Show
                when={channelShare().length > 0}
                fallback={
                  <p
                    style={{
                      color: "var(--text-muted)",
                      "font-size": "var(--text-caption)",
                    }}
                  >
                    联系人还没有记录沟通渠道，数据积累后会显示分布。
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
                      <span
                        style={{ "font-size": "var(--text-body-sm)", flex: 1 }}
                      >
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
            <Card title="待处理跟进" icon="ph-bell-ringing">
              <p
                style={{
                  "font-size": "32px",
                  "font-weight": "800",
                  "font-family": "var(--font-display)",
                  margin: 0,
                  color:
                    pendingFU() > 0 ? "var(--orange)" : "var(--text-muted)",
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
            <Card title="Agent 动作" icon="ph-sparkle">
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
                  <p
                    style={{ "font-size": "10px", color: "var(--text-muted)" }}
                  >
                    总数
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
                  <p
                    style={{ "font-size": "10px", color: "var(--text-muted)" }}
                  >
                    已完成
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
                  <p
                    style={{ "font-size": "10px", color: "var(--text-muted)" }}
                  >
                    进行中
                  </p>
                </div>
              </div>
              <Show when={agentActions().total > 0}>
                <div
                  aria-hidden="true"
                  style={{
                    "margin-top": "var(--space-3)",
                    height: "6px",
                    "border-radius": "999px",
                    overflow: "hidden",
                    display: "flex",
                    background: "var(--paper-mid)",
                  }}
                >
                  <div
                    style={{
                      width: `${(agentActions().done / agentActions().total) * 100}%`,
                      background: "var(--palm)",
                    }}
                  />
                  <div
                    style={{
                      width: `${(agentActions().doing / agentActions().total) * 100}%`,
                      background: "var(--yellow)",
                    }}
                  />
                </div>
              </Show>
            </Card>

            {/* Health distribution */}
            <Card title="联系人健康度" icon="ph-heartbeat">
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
                  ]}
                >
                  {(b) => {
                    const total =
                      healthDist().active +
                      healthDist().risk +
                      healthDist().cold;
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
                          style={{
                            "font-size": "var(--text-body-sm)",
                            flex: 1,
                          }}
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
            <Card title="接下来的会议" icon="ph-calendar-blank">
              <Show
                when={upcomingEvents().length > 0}
                fallback={
                  <p
                    style={{
                      color: "var(--text-muted)",
                      "font-size": "var(--text-caption)",
                    }}
                  >
                    近期没有安排会议。
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
                      <span
                        style={{ "font-size": "var(--text-body-sm)", flex: 1 }}
                      >
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
        )}
      </ResourceGate>
    </div>
  );
}

function Card(props: { title: string; icon: string; children: unknown }) {
  return (
    <div
      class="insight-card"
      style={{
        padding: "var(--space-4)",
        background:
          "color-mix(in srgb, var(--paper-light) 82%, transparent)",
        "backdrop-filter": "blur(20px) saturate(1.4)",
        "-webkit-backdrop-filter": "blur(20px) saturate(1.4)",
        border: "0.5px solid var(--border)",
        "border-radius": "var(--radius-lg)",
        "box-shadow": "var(--shadow-sm)",
        transition: "transform 0.2s var(--ease-out), box-shadow 0.2s var(--ease-out)",
      }}
    >
      <h3
        style={{
          "font-family": "var(--font-display)",
          "font-size": "var(--text-caption)",
          "font-weight": "800",
          "letter-spacing": "0.02em",
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

const INSIGHTS_CSS = `
.insight-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}
`;
