/** AgentPanel — right-side panel (340px) with sessions / tasks / chat. M6 will fill it. */

import { setAgentPanelOpen } from "../stores/ui";
import { Icon } from "./Icon";

export function AgentPanel() {
  return (
    <aside
      id="agent-panel"
      style={{
        background: "var(--surface-elevated)",
        "border-left": "0.5px solid var(--border)",
        display: "flex",
        "flex-direction": "column",
        height: "100%",
      }}
    >
      <div
        style={{
          padding: "var(--space-4) var(--space-5)",
          "border-bottom": "0.5px solid var(--border)",
          display: "flex",
          "align-items": "center",
          "justify-content": "space-between",
        }}
      >
        <div style={{ display: "flex", "align-items": "center", gap: "var(--space-2)" }}>
          <Icon name="ph-sparkle" size={18} color="var(--agent)" />
          <strong style={{ "font-size": "var(--text-body-sm)", "font-weight": "700" }}>
            SendPalm Agent
          </strong>
        </div>
        <button
          onClick={() => setAgentPanelOpen(false)}
          aria-label="Close agent panel"
          style={{
            color: "var(--text-muted)",
            width: "28px",
            height: "28px",
            "border-radius": "var(--radius-pill)",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
          }}
        >
          <Icon name="ph-x" size={14} />
        </button>
      </div>

      <div
        style={{
          padding: "var(--space-5)",
          color: "var(--text-muted)",
          "font-size": "var(--text-caption)",
          "text-align": "center",
        }}
      >
        <Icon name="ph-sparkle" size={32} color="var(--agent-soft)" />
        <p style={{ "margin-top": "var(--space-3)" }}>Agent 面板（M6 实装）</p>
        <p style={{ "margin-top": "var(--space-2)", "font-size": "11px" }}>
          会话 / 任务 / 草稿 / 记忆 / 审计
        </p>
      </div>
    </aside>
  );
}