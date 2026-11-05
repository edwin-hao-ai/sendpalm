/** AgentConnectionPanel — one-click connection between SendPalm and local
 *  AI agents (Claude Code / Codex). SendPalm writes the agent's config
 *  itself; the user just flips a toggle. */

import { For, Show, createResource, createSignal } from "solid-js";
import { safeInvoke } from "../services/backend";
import { Icon } from "./Icon";

export interface AgentClientDto {
  id: string;
  name: string;
  installed: boolean;
  connected: boolean;
}

export interface McpStatus {
  url: string;
  tokenPreview: string;
}

function detectClients(): Promise<AgentClientDto[] | null> {
  return safeInvoke<AgentClientDto[]>("detect_agent_clients");
}

export function AgentConnectionPanel() {
  const [clients, { refetch }] = createResource(detectClients);
  const [status] = createResource(() =>
    safeInvoke<McpStatus>("mcp_gateway_status"),
  );
  const [busyId, setBusyId] = createSignal<string | null>(null);
  const [manualOpen, setManualOpen] = createSignal(false);

  const toggle = async (c: AgentClientDto) => {
    if (busyId()) return;
    setBusyId(c.id);
    try {
      await safeInvoke(
        c.connected ? "disconnect_agent_client" : "connect_agent_client",
        { id: c.id },
      );
      await refetch();
    } finally {
      setBusyId(null);
    }
  };

  const visible = () => (clients() ?? []).filter((c) => c.installed);
  const snippet = () =>
    status()
      ? JSON.stringify(
          {
            mcpServers: {
              sendpalm: { url: status()!.url, headers: { Authorization: `Bearer <token>` } },
            },
          },
          null,
          2,
        )
      : "";

  return (
    <div data-agent-connections style={{ display: "flex", "flex-direction": "column", gap: "var(--space-2)" }}>
      <p style={{ margin: 0, "font-size": "var(--text-caption)", color: "var(--text-muted)" }}>
        开启后，你授权的 AI Agent 可以读写这个应用里的邮件数据（写操作只建草稿/任务，发送由你确认）。
        邮件内容会进入该 Agent 的上下文，并发送到你配置的模型提供商。SendPalm 需要保持运行。
      </p>

      <Show
        when={visible().length > 0}
        fallback={
          <p data-no-clients style={{ margin: 0, "font-size": "var(--text-caption)", color: "var(--text-muted)" }}>
            没有检测到已安装的 Agent 客户端。支持 OpenCode、Claude Code 和 Codex；其他客户端可用下方手动配置。
          </p>
        }
      >
        <For each={visible()}>
          {(c) => (
            <div
              data-client-row={c.id}
              style={{
                display: "flex",
                "align-items": "center",
                gap: "var(--space-3)",
                padding: "var(--space-2) 0",
              }}
            >
              <span style={{ flex: 1, "font-size": "var(--text-body-sm)", "font-weight": 600, color: "var(--text-primary)" }}>
                {c.name}
              </span>
              <Show when={c.connected}>
                <span data-connected style={{ display: "inline-flex", "align-items": "center", gap: "4px", "font-size": "var(--text-caption)", "font-weight": 700, color: "var(--palm)" }}>
                  <Icon name="ph-check-circle" size={13} /> 已连接
                </span>
              </Show>
              <button
                type="button"
                data-toggle={c.id}
                disabled={busyId() === c.id}
                onClick={() => void toggle(c)}
                style={{
                  padding: "6px 14px",
                  "min-height": "36px",
                  "border-radius": "var(--radius-pill)",
                  background: c.connected ? "var(--paper-mid)" : "var(--palm)",
                  color: c.connected ? "var(--text-secondary)" : "white",
                  "font-size": "var(--text-caption)",
                  "font-weight": 700,
                  border: "none",
                  cursor: "pointer",
                  opacity: busyId() === c.id ? 0.6 : 1,
                }}
              >
                {busyId() === c.id ? "…" : c.connected ? "断开" : "连接"}
              </button>
            </div>
          )}
        </For>
      </Show>

      <button
        type="button"
        data-manual-toggle
        onClick={() => setManualOpen(!manualOpen())}
        style={{
          "align-self": "flex-start",
          background: "none",
          border: "none",
          padding: "6px 0",
          color: "var(--text-muted)",
          "font-size": "var(--text-caption)",
          cursor: "pointer",
        }}
      >
        {manualOpen() ? "收起手动配置 ▲" : "其他 Agent？手动添加 ▼"}
      </button>
      <Show when={manualOpen()}>
        <Show
          when={status()}
          fallback={
            <p style={{ margin: 0, "font-size": "var(--text-caption)", color: "var(--status-danger, #C0392B)" }}>
              网关未运行——请重启 SendPalm 后重试。
            </p>
          }
        >
          <pre
            data-manual-snippet
            style={{
              margin: 0,
              padding: "var(--space-3)",
              "border-radius": "var(--radius-sm)",
              background: "var(--paper-mid)",
              "font-size": "var(--text-caption)",
              overflow: "auto",
            }}
          >
            {snippet()}
          </pre>
          <p style={{ margin: 0, "font-size": "var(--text-micro)", color: "var(--text-muted)" }}>
            把这段配置加到你的 Agent 的 MCP 配置里（token 在 SendPalm 设置中查看，仅显示前几位）。
          </p>
        </Show>
      </Show>
    </div>
  );
}
