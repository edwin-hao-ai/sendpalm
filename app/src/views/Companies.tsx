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
import { SkeletonList } from "../components/Skeleton";
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
      <header style={{ padding: "var(--space-5)" }}>
        <h2
          style={{
            "font-family": "var(--font-display)",
            "font-size": "var(--text-h3)",
            "font-weight": "800",
            margin: 0,
          }}
        >
          Companies
        </h2>
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
        loading={
          <div
            style={{
              "max-width": "920px",
              margin: "0 auto",
              padding: "0 var(--space-5) var(--space-5)",
            }}
          >
            <SkeletonList count={4} height={120} />
          </div>
        }
        errorView={() => (
          <ErrorState
            title="公司数据加载失败"
            message={String(groups.error ?? "")}
            retry={() => void refetch()}
          />
        )}
        empty={<Empty icon="ph-buildings" title="没有公司" />}
      >
        {(list: CompanyGroup[]) => (
          <div
            style={{
              "max-width": "920px",
              margin: "0 auto",
              padding: "0 var(--space-5) var(--space-5)",
            }}
          >
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
                    }}
                  >
                    <button
                      onClick={() => openCompanyDetail(g.company)}
                      style={{
                        "font-family": "var(--font-display)",
                        "font-size": "var(--text-h4)",
                        "font-weight": "800",
                        margin: 0,
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        color: "var(--text-primary)",
                      }}
                    >
                      {g.company}
                    </button>
                    <div
                      style={{
                        display: "flex",
                        gap: "var(--space-2)",
                        "font-size": "var(--text-micro)",
                        color: "var(--text-muted)",
                      }}
                    >
                      <span>
                        <Icon name="ph-users" size={11} /> {g.peopleCount} 人
                      </span>
                      <span>
                        <Icon name="ph-envelope" size={11} /> {g.msgCount} 消息
                      </span>
                      <span>
                        <Icon name="ph-calendar-blank" size={11} /> {g.eventCount}{" "}
                        会议
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
                            background: "var(--paper-mid)",
                            "border-radius": "var(--radius-pill)",
                            cursor: "pointer",
                            border: "none",
                          }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.background = "var(--paper-dark)")
                          }
                          onMouseLeave={(e) =>
                            (e.currentTarget.style.background = "var(--paper-mid)")
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
          </div>
        )}
      </ResourceGate>
    </div>
  );
}
