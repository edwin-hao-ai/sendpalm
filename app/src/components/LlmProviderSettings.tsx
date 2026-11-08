/** LlmProviderSettings — the BYOK provider picker for Settings → Agent.
 *
 *  Flow: pick provider (or paste a key and get auto-detected) → verify &
 *  load the live model list → tap a model to make it the default. Keys
 *  are stored per-provider in the OS keychain (see services/llm-config).
 */

import {
  For,
  Show,
  createEffect,
  createResource,
  createSignal,
  type JSX,
} from "solid-js";
import {
  listLlmProviders,
  listLlmModels,
  type LlmProviderDto,
  type LlmModelInfo,
} from "../services/backend";
import { detectProviderByPrefix } from "../services/llm-detect";
import { saveLlmKey, migrateLegacyLlmKey } from "../services/llm-config";
import { appSettings, setAppSettings, showToast } from "../stores/ui";
import { Icon } from "./Icon";

const KIND_LABEL: Record<LlmProviderDto["kind"], string> = {
  gateway: "Gateway · 一把 key 多个模型",
  direct: "直连厂商",
  local: "本地 · 无需 key",
};

export function LlmProviderSettings() {
  const [providers, { refetch: refetchProviders }] =
    createResource(listLlmProviders);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [keyInput, setKeyInput] = createSignal("");
  const [models, setModels] = createSignal<LlmModelInfo[] | null>(null);
  const [verifying, setVerifying] = createSignal(false);
  const [verifyError, setVerifyError] = createSignal<string | null>(null);
  const [ambiguous, setAmbiguous] = createSignal<LlmProviderDto[]>([]);

  const list = () => providers() ?? [];

  const selected = (): LlmProviderDto | null =>
    list().find((p) => p.id === selectedId()) ?? null;

  // One-time migration of the pre-catalog single key + restore the
  // current provider selection from the persisted base URL. A
  // source-less createResource runs its fetcher only once — an effect
  // re-runs when the provider list (or persisted baseUrl) resolves.
  createEffect(() => {
    const ps = list();
    const baseUrl = appSettings.agent.llm.baseUrl;
    if (ps.length === 0) return;
    void migrateLegacyLlmKey(baseUrl, ps).then(() => {
      if (selectedId()) return;
      const host = (u: string) =>
        u.replace(/^https?:\/\//, "").split("/")[0]!.split(":")[0]!;
      const match = baseUrl
        ? ps.find((p) => host(p.defaultBaseUrl) === host(baseUrl))
        : null;
      setSelectedId(match?.id ?? "vercel");
    });
  });

  const onPasteKey = (value: string) => {
    setKeyInput(value);
    setModels(null);
    setVerifyError(null);
    setAmbiguous([]);
    const match = detectProviderByPrefix(value, list());
    if (match.kind === "single") {
      setSelectedId(match.provider.id);
    } else if (match.kind === "ambiguous") {
      setAmbiguous(match.providers);
    }
  };

  const verify = async () => {
    const p = selected();
    if (!p || verifying()) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const apiKey = keyInput().trim();
      const result = await listLlmModels({
        baseUrl: p.defaultBaseUrl,
        apiKey,
      });
      if (!result) {
        setVerifyError("无法连接提供商，请检查网络或 key 是否有效。");
        setModels(null);
        return;
      }
      if (result.length === 0) {
        setVerifyError("提供商没有返回可用模型。");
        setModels(null);
        return;
      }
      setModels(result);
    } catch (e) {
      setVerifyError(`验证失败：${e instanceof Error ? e.message : e}`);
      setModels(null);
    } finally {
      setVerifying(false);
    }
  };

  const chooseModel = async (m: LlmModelInfo) => {
    const p = selected();
    if (!p) return;
    const apiKey = keyInput().trim();
    if (!p.local) await saveLlmKey(p.id, apiKey);
    setAppSettings("agent", "llm", "baseUrl", p.defaultBaseUrl);
    setAppSettings("agent", "llm", "model", m.id);
    showToast({
      message: `默认模型已设为 ${m.displayName}`,
      kind: "success",
      ttlMs: 2000,
    });
  };

  const groups = (): [LlmProviderDto["kind"], LlmProviderDto[]][] => {
    const ps = list();
    return (["gateway", "direct", "local"] as const)
      .map((k) => [k, ps.filter((p) => p.kind === k)] as [LlmProviderDto["kind"], LlmProviderDto[]])
      .filter(([, ps]) => ps.length > 0);
  };

  return (
    <div data-llm-providers style={{ display: "flex", "flex-direction": "column", gap: "var(--space-3)" }}>
      <p style={{ margin: 0, "font-size": "var(--text-caption)", color: "var(--text-muted)" }}>
        提问内容会直连你选择的提供商，不经过 SendPalm。
      </p>

      <Show when={providers.error}>
        <p
          data-llm-providers-error
          style={{ margin: 0, "font-size": "var(--text-caption)", color: "var(--text-secondary)" }}
        >
          模型服务列表加载失败 ·{" "}
          <button
            type="button"
            onClick={() => void refetchProviders()}
            style={{ color: "var(--palm)", "font-weight": 700 }}
          >
            重试
          </button>
        </p>
      </Show>
      <Show when={!providers.error && providers.loading}>
        <p
          data-llm-providers-loading
          aria-busy="true"
          style={{ margin: 0, "font-size": "var(--text-caption)", color: "var(--text-muted)" }}
        >
          正在读取模型服务…
        </p>
      </Show>
      <For each={groups()}>
        {([kind, ps]) => (
          <div>
            <div style={{ "font-size": "var(--text-micro)", "font-weight": 700, color: "var(--text-muted)", margin: "var(--space-2) 0 var(--space-1)" }}>
              {KIND_LABEL[kind]}
            </div>
            <For each={ps}>
              {(p) => (
                <button
                  type="button"
                  data-provider-id={p.id}
                  onClick={() => {
                    setSelectedId(p.id);
                    setModels(null);
                    setVerifyError(null);
                    setAmbiguous([]);
                  }}
                  style={{
                    display: "flex",
                    "align-items": "center",
                    gap: "var(--space-2)",
                    width: "100%",
                    padding: "10px var(--space-3)",
                    "min-height": "44px",
                    "border-radius": "var(--radius-sm)",
                    background:
                      selectedId() === p.id ? "var(--palm-soft)" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    "text-align": "left",
                  }}
                >
                  <span style={{ flex: 1, "min-width": 0 }}>
                    <span style={{ display: "block", "font-size": "var(--text-body-sm)", "font-weight": 600, color: "var(--text-primary)" }}>
                      {p.name}
                    </span>
                    <span style={{ display: "block", "font-size": "var(--text-caption)", color: "var(--text-muted)" }}>
                      {p.tagline}
                    </span>
                  </span>
                  <Show when={selectedId() === p.id}>
                    <Icon name="ph-check" size={14} />
                  </Show>
                </button>
              )}
            </For>
          </div>
        )}
      </For>

      <Show when={ambiguous().length > 0}>
        <div data-ambiguous style={{ display: "flex", gap: "var(--space-2)", "flex-wrap": "wrap" }}>
          <span style={{ "font-size": "var(--text-caption)", color: "var(--text-secondary)" }}>
            这个前缀对应多家提供商，选一家：
          </span>
          <For each={ambiguous()}>
            {(p) => (
              <button
                type="button"
                class="llm-chip"
                onClick={() => {
                  setSelectedId(p.id);
                  setAmbiguous([]);
                }}
              >
                {p.name}
              </button>
            )}
          </For>
        </div>
      </Show>

      <Show when={selected() && !selected()!.local}>
        <input
          type="password"
          data-llm-key-input
          placeholder={`粘贴 ${selected()?.name ?? ""} API key`}
          value={keyInput()}
          onInput={(e) => onPasteKey(e.currentTarget.value)}
          style={inputStyle}
        />
      </Show>

      <Show when={selected()}>
        <div style={{ display: "flex", gap: "var(--space-2)", "align-items": "center" }}>
          <button
            type="button"
            data-verify-models
            disabled={verifying() || (selected()!.local ? false : !keyInput().trim())}
            onClick={() => void verify()}
            style={{
              padding: "8px 16px",
              "border-radius": "var(--radius-pill)",
              background: "var(--palm)",
              color: "white",
              "font-size": "var(--text-caption)",
              "font-weight": 700,
              border: "none",
              cursor: "pointer",
              opacity: verifying() ? 0.6 : 1,
            }}
          >
            {verifying() ? "验证中…" : "验证并加载模型"}
          </button>
          <Show when={verifyError()}>
            <span data-verify-error style={{ "font-size": "var(--text-caption)", color: "var(--status-danger, #C0392B)" }}>
              {verifyError()}
            </span>
          </Show>
        </div>
      </Show>

      <Show when={models()}>
        <div data-model-list style={{ display: "flex", "flex-direction": "column", gap: "2px", "max-height": "260px", overflow: "auto" }}>
          <For each={models()!}>
            {(m) => {
              const isDefault = () =>
                appSettings.agent.llm.model === m.id &&
                appSettings.agent.llm.baseUrl === selected()?.defaultBaseUrl;
              return (
                <button
                  type="button"
                  data-model-id={m.id}
                  onClick={() => void chooseModel(m)}
                  style={{
                    display: "flex",
                    "align-items": "baseline",
                    gap: "var(--space-2)",
                    width: "100%",
                    padding: "8px var(--space-3)",
                    "min-height": "40px",
                    "border-radius": "var(--radius-sm)",
                    background: isDefault() ? "var(--palm-soft)" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    "text-align": "left",
                  }}
                >
                  <span style={{ "font-size": "var(--text-body-sm)", "font-weight": isDefault() ? 700 : 500, color: "var(--text-primary)" }}>
                    {m.displayName}
                  </span>
                  <span style={{ "font-size": "var(--text-caption)", color: "var(--text-muted)" }}>
                    {m.contextWindow ? `${(m.contextWindow / 1000).toFixed(0)}k 上下文` : ""}
                    {m.inputPricePerM != null ? ` · $${m.inputPricePerM.toFixed(2)}/M` : ""}
                  </span>
                  <Show when={isDefault()}>
                    <span style={{ "margin-left": "auto", "font-size": "var(--text-micro)", "font-weight": 700, color: "var(--palm)" }}>
                      默认
                    </span>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

const inputStyle: JSX.CSSProperties = {
  width: "100%",
  padding: "var(--space-2) var(--space-3)",
  "border-radius": "var(--radius-sm)",
  border: "0.5px solid var(--border)",
  background: "var(--paper-light)",
  color: "var(--text-primary)",
  "font-size": "var(--text-body-sm)",
};
