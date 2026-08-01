/** Companies view — group by company with people + comms + meetings.
 * Spec: prototype-v11 §3.4.
 */

import { For, Show, createMemo, createResource } from "solid-js";
import { listContacts, listMessages, listEvents, listFiles } from "../stores/data";
import { Avatar } from "../components/Avatar";
import { Empty } from "../components/Empty";
import { Icon } from "../components/Icon";
import { setDetailOpen, setSelectedContactId } from "../stores/ui";

export function Companies() {
  const [contacts] = createResource(listContacts);
  const [messages] = createResource(listMessages);
  const [events] = createResource(listEvents);
  const [files] = createResource(listFiles);

  const grouped = createMemo(() => {
    const list = contacts() ?? [];
    const map = new Map<string, typeof list>();
    for (const c of list) {
      const key = c.company || "(未分类)";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return [...map.entries()]
      .map(([company, people]) => {
        const cids = people.map((p) => p.id);
        const msgs = (messages() ?? []).filter((m) => cids.includes(m.pid));
        const evts = (events() ?? []).filter((e) => e.pids.some((p) => cids.includes(p)));
        const fls = (files() ?? []).filter((f) => cids.includes(f.pid));
        return { company, people, msgCount: msgs.length, eventCount: evts.length, fileCount: fls.length };
      })
      .sort((a, b) => b.people.length - a.people.length);
  });

  const open = (id: string) => {
    setSelectedContactId(id);
    setDetailOpen(true);
  };

  return (
    <div style={{ animation: "view-enter 0.3s var(--ease-out) both" }}>
      <header style={{ padding: "var(--space-5)" }}>
        <h2 style={{ "font-family": "var(--font-display)", "font-size": "var(--text-h3)", "font-weight": "800", margin: 0 }}>
          Companies
        </h2>
        <p style={{ color: "var(--text-secondary)", "font-size": "var(--text-caption)", margin: "var(--space-1) 0 0" }}>
          按公司分组 · 看到所有人和沟通历史
        </p>
      </header>

      <Show when={grouped().length > 0} fallback={<Empty icon="ph-buildings" title="没有公司" />}>
        <div style={{ "max-width": "920px", margin: "0 auto", padding: "0 var(--space-5) var(--space-5)" }}>
          <For each={grouped()}>
            {(g) => (
              <section style={{ "margin-bottom": "var(--space-5)", padding: "var(--space-4)", background: "var(--paper-light)", border: "0.5px solid var(--border)", "border-radius": "var(--radius-lg)" }}>
                <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", "margin-bottom": "var(--space-3)" }}>
                  <h3 style={{ "font-family": "var(--font-display)", "font-size": "var(--text-h4)", "font-weight": "800", margin: 0 }}>
                    {g.company}
                  </h3>
                  <div style={{ display: "flex", gap: "var(--space-2)", "font-size": "var(--text-micro)", color: "var(--text-muted)" }}>
                    <span><Icon name="ph-users" size={11} /> {g.people.length} 人</span>
                    <span><Icon name="ph-envelope" size={11} /> {g.msgCount} 消息</span>
                    <span><Icon name="ph-calendar-blank" size={11} /> {g.eventCount} 会议</span>
                    <span><Icon name="ph-paperclip" size={11} /> {g.fileCount} 文件</span>
                  </div>
                </div>
                <div style={{ display: "flex", "flex-wrap": "wrap", gap: "var(--space-2)" }}>
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
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--paper-dark)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "var(--paper-mid)")}
                      >
                        <Avatar name={c.name} src={c.avatar} size={20} />
                        <span style={{ "font-size": "var(--text-caption)", "font-weight": "600" }}>{c.name}</span>
                        <Show when={c.title}>
                          <span style={{ "font-size": "10px", color: "var(--text-muted)" }}>· {c.title}</span>
                        </Show>
                      </button>
                    )}
                  </For>
                </div>
              </section>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}