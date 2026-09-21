/** Companies view — group by company with people + comms + meetings.
 * Spec: prototype-v11 §3.4.
 *
 * Performance: aggregates people + message / event / file counts on the
 * SQL side via `listCompaniesWithCounts` (single IPC, single SQL pass).
 * The previous shape — 4 separate resources + a client-side
 * `grouped()` memo doing O(people × 4) Set lookups on the main thread
 * — measured 645 ms mount + 217 ms long task on a 1500-contact /
 * 4000-message corpus (e2e/perf-views.spec.ts Companies row). After
 * the server-side aggregation, the JS step is a single linear pass
 * to group the rows by company.
 */

import { For, Show, createResource } from "solid-js";
import { listCompaniesWithCounts, type CompanyGroup } from "../stores/data";
import { Avatar } from "../components/Avatar";
import { Empty, ErrorState } from "../components/Empty";
import { Icon } from "../components/Icon";
import { ResourceGate } from "../components/ResourceGate";
import {
  setDetailOpen,
  setSelectedContactId,
  openCompanyDetail,
} from "../stores/ui";
import { useRefreshEffect } from "../utils/gestures";

export function Companies() {
  const [groups, { refetch }] = createResource(listCompaniesWithCounts);

  useRefreshEffect(() => {
    void refetch();
  });

  const open = (id: string) => {
    setSelectedContactId(id);
    setDetailOpen(true);
  };

  return (
    <div style={{ animation: "view-enter 0.3s var(--ease-out) both" }}>
      <div
        style={{
          "max-width": "920px",
          margin: "0 auto",
          padding: "0 var(--space-5) var(--space-5)",
        }}
      >
        <header style={{ padding: "var(--space-5) 0" }}>
          <h1
            style={{
              "font-family": "var(--font-display)",
              "font-size": "var(--text-h1)",
              "font-weight": "800",
              margin: 0,
            }}
          >
            公司
          </h1>
          <p
            style={{
              color: "var(--text-secondary)",
              "font-size": "var(--text-caption)",
              margin: "var(--space-1) 0 0",
            }}
          >
            按公司分组 · 看到所有人和沟通历史
          </p>
        </header>

        <ResourceGate
          resource={groups}
          loading={<CompanySkeleton />}
          errorView={() => (
            <ErrorState
              title="公司数据加载失败"
              message="请检查网络后重试。"
              retry={() => void refetch()}
            />
          )}
          empty={
            <Empty
              icon="ph-buildings"
              title="还没有公司"
              description="联系人填写公司后会自动归组到这里。"
            />
          }
        >
          {(list: CompanyGroup[]) => (
            <For each={list}>
              {(g) => (
                <section
                  style={{
                    "margin-bottom": "var(--space-5)",
                    padding: "var(--space-4)",
                    background: "var(--paper-light)",
                    border: "0.5px solid var(--border)",
                    "border-radius": "var(--radius-lg)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      "align-items": "center",
                      "justify-content": "space-between",
                      "margin-bottom": "var(--space-3)",
                      gap: "var(--space-3)",
                      "flex-wrap": "wrap",
                    }}
                  >
                    <button
                      onClick={() => openCompanyDetail(g.company)}
                      aria-label={`查看公司 ${g.company}`}
                      style={{
                        "font-family": "var(--font-display)",
                        "font-size": "var(--text-h4)",
                        "font-weight": "800",
                        margin: 0,
                        background: "transparent",
                        border: "none",
                        padding: "4px 8px",
                        "border-radius": "var(--radius-md)",
                        cursor: "pointer",
                        color: "var(--text-primary)",
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
                      {g.company}
                      <Icon
                        name="ph-caret-right"
                        size={14}
                        style={{ color: "var(--text-muted)" }}
                      />
                    </button>
                    <div
                      style={{
                        display: "flex",
                        gap: "var(--space-2)",
                        "font-size": "var(--text-micro)",
                        color: "var(--text-muted)",
                        "flex-wrap": "wrap",
                      }}
                    >
                      <span>
                        <Icon name="ph-users" size={11} /> {g.peopleCount} 人
                      </span>
                      <span>
                        <Icon name="ph-envelope" size={11} /> {g.msgCount} 消息
                      </span>
                      <span>
                        <Icon name="ph-calendar-blank" size={11} />{" "}
                        {g.eventCount} 会议
                      </span>
                      <span>
                        <Icon name="ph-paperclip" size={11} /> {g.fileCount} 文件
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      "flex-wrap": "wrap",
                      gap: "var(--space-2)",
                    }}
                  >
                    <For each={g.people}>
                      {(c) => (
                        <button
                          onClick={() => open(c.id)}
                          style={{
                            display: "flex",
                            "align-items": "center",
                            gap: "var(--space-2)",
                            padding: "6px 12px",
                            "min-height": "36px",
                            background: "var(--paper-mid)",
                            "border-radius": "var(--radius-pill)",
                            cursor: "pointer",
                            border: "none",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background =
                              "var(--paper-dark)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background =
                              "var(--paper-mid)")
                          }
                        >
                          <Avatar name={c.name} src={c.avatar} size={20} />
                          <span
                            style={{
                              "font-size": "var(--text-caption)",
                              "font-weight": "600",
                            }}
                          >
                            {c.name}
                          </span>
                          <Show when={c.title}>
                            <span
                              style={{
                                "font-size": "10px",
                                color: "var(--text-muted)",
                              }}
                            >
                              · {c.title}
                            </span>
                          </Show>
                        </button>
                      )}
                    </For>
                  </div>
                </section>
              )}
            </For>
          )}
        </ResourceGate>
      </div>
    </div>
  );
}

/** Skeleton shaped like the real company section: a title line, a row
 *  of stat dots, and a row of avatar chips — not generic gray bars. */
function CompanySkeleton() {
  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "var(--space-5)",
      }}
      aria-busy="true"
      aria-label="加载中"
    >
      <For each={[0, 1, 2, 3]}>
        {() => (
          <div
            style={{
              padding: "var(--space-4)",
              background: "var(--paper-light)",
              border: "0.5px solid var(--border)",
              "border-radius": "var(--radius-lg)",
            }}
          >
            <div
              style={{
                display: "flex",
                "justify-content": "space-between",
                "align-items": "center",
                "margin-bottom": "var(--space-3)",
              }}
            >
              <div
                style={{
                  height: "18px",
                  width: "32%",
                  "border-radius": "4px",
                  background:
                    "linear-gradient(90deg, var(--paper-mid) 25%, var(--paper-dark) 50%, var(--paper-mid) 75%)",
                  "background-size": "200% 100%",
                  animation: "shimmer 1.4s infinite linear",
                }}
              />
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <For each={[0, 1, 2, 3]}>
                  {() => (
                    <div
                      style={{
                        height: "10px",
                        width: "34px",
                        "border-radius": "var(--radius-pill)",
                        background: "var(--paper-mid)",
                      }}
                    />
                  )}
                </For>
              </div>
            </div>
            <div style={{ display: "flex", gap: "var(--space-2)" }}>
              <For each={[0, 1, 2]}>
                {() => (
                  <div
                    style={{
                      display: "inline-flex",
                      "align-items": "center",
                      gap: "var(--space-2)",
                      padding: "6px 12px",
                      background: "var(--paper-mid)",
                      "border-radius": "var(--radius-pill)",
                    }}
                  >
                    <div
                      style={{
                        width: "20px",
                        height: "20px",
                        "border-radius": "50%",
                        background: "var(--paper-dark)",
                      }}
                    />
                    <div
                      style={{
                        height: "10px",
                        width: "48px",
                        "border-radius": "4px",
                        background: "var(--paper-dark)",
                      }}
                    />
                  </div>
                )}
              </For>
            </div>
          </div>
        )}
      </For>
    </div>
  );
}
