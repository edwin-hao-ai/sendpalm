/** LlmProviderSettings — BYOK provider picker flow. */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@solidjs/testing-library";

const invokeMock = vi.fn();

vi.mock("../services/backend", () => ({
  listLlmProviders: () => invokeMock("list_llm_providers"),
  listLlmModels: (config: unknown) =>
    invokeMock("llm_list_models", { config }),
  vaultSetSecret: (key: string, value: string) =>
    invokeMock("vault_set_secret", { key, value }),
  vaultGetSecret: (key: string) => invokeMock("vault_get_secret", { key }),
}));

import { LlmProviderSettings } from "./LlmProviderSettings";
import { appSettings, setAppSettings } from "../stores/ui";
import { detectProviderByPrefix } from "../services/llm-detect";
import type { LlmProviderDto } from "../services/backend";

const PROVIDERS: LlmProviderDto[] = [
  { id: "openrouter", name: "OpenRouter", kind: "gateway", keyPrefix: "sk-or-", tagline: "t", defaultBaseUrl: "https://openrouter.ai/api/v1", local: false },
  { id: "vercel", name: "Vercel AI Gateway", kind: "gateway", keyPrefix: "vck_", tagline: "t", defaultBaseUrl: "https://ai-gateway.vercel.sh/v1", local: false },
  { id: "openai", name: "OpenAI", kind: "direct", keyPrefix: "sk-", tagline: "t", defaultBaseUrl: "https://api.openai.com/v1", local: false },
  { id: "deepseek", name: "DeepSeek", kind: "direct", keyPrefix: "sk-", tagline: "t", defaultBaseUrl: "https://api.deepseek.com/v1", local: false },
  { id: "ollama", name: "Ollama", kind: "local", keyPrefix: null, tagline: "t", defaultBaseUrl: "http://127.0.0.1:11434", local: true },
];

const MODELS = [
  { id: "gpt-4o", displayName: "GPT-4o", contextWindow: 128000, inputPricePerM: 2.5 },
  { id: "gpt-4o-mini", displayName: "GPT-4o mini", contextWindow: 128000, inputPricePerM: 0.15 },
];

describe("detectProviderByPrefix", () => {
  it("detects vercel and openrouter keys", () => {
    const single = (key: string) => {
      const m = detectProviderByPrefix(key, PROVIDERS);
      return m.kind === "single" ? m.provider.id : m.kind;
    };
    expect(single("vck_abc")).toBe("vercel");
    expect(single("sk-or-v1-x")).toBe("openrouter");
  });

  it("treats bare sk- as ambiguous between openai and deepseek", () => {
    const m = detectProviderByPrefix("sk-abc", PROVIDERS);
    expect(m.kind).toBe("ambiguous");
    if (m.kind === "ambiguous")
      expect(m.providers.map((p) => p.id)).toEqual(["openai", "deepseek"]);
  });
});

describe("LlmProviderSettings", () => {


  beforeEach(() => {
    vi.clearAllMocks();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_llm_providers") return Promise.resolve(PROVIDERS);
      if (cmd === "vault_get_secret") return Promise.resolve(null);
      if (cmd === "vault_set_secret") return Promise.resolve(true);
      return Promise.resolve(null);
    });
    setAppSettings("agent", "llm", "baseUrl", "");
    setAppSettings("agent", "llm", "model", "");
  });

  it("renders providers grouped and preselects nothing when no baseUrl set", async () => {
    render(() => <LlmProviderSettings />);
    await screen.findByText("Vercel AI Gateway");
    expect(screen.getByText("OpenRouter")).toBeTruthy();
    expect(screen.getByText("Ollama")).toBeTruthy();
  });

  it("pasting a vck_ key auto-selects Vercel", async () => {
    render(() => <LlmProviderSettings />);
    await screen.findByText("Vercel AI Gateway");
    const input = await screen.findByPlaceholderText(/API key/);
    fireEvent.input(input, { target: { value: "vck_test123" } });
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Vercel/)).toBeTruthy();
    });
  });

  it("bare sk- offers an ambiguity picker", async () => {
    render(() => <LlmProviderSettings />);
    await screen.findByText("Vercel AI Gateway");
    const input = await screen.findByPlaceholderText(/API key/);
    fireEvent.input(input, { target: { value: "sk-abc" } });
    await screen.findByText(/这个前缀对应多家提供商/);
    fireEvent.click(screen.getAllByText("DeepSeek")[1]!);
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/DeepSeek/)).toBeTruthy();
    });
  });

  it("verify success renders models; choosing one sets the default", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "llm_list_models") return Promise.resolve(MODELS);
      if (cmd === "list_llm_providers") return Promise.resolve(PROVIDERS);
      if (cmd === "vault_get_secret") return Promise.resolve(null);
      if (cmd === "vault_set_secret") return Promise.resolve(true);
      return Promise.resolve(null);
    });
    render(() => <LlmProviderSettings />);
    await screen.findByText("Vercel AI Gateway");
    fireEvent.input(await screen.findByPlaceholderText(/API key/), {
      target: { value: "vck_test123" },
    });
    fireEvent.click(screen.getByText("验证并加载模型"));
    await screen.findByText("GPT-4o");
    fireEvent.click(screen.getByText("GPT-4o mini"));
    await waitFor(() => {
      expect(appSettings.agent.llm.model).toBe("gpt-4o-mini");
      expect(appSettings.agent.llm.baseUrl).toBe(
        "https://ai-gateway.vercel.sh/v1",
      );
    });
  });

  it("verify failure shows an inline error", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "llm_list_models") return Promise.resolve(null);
      if (cmd === "list_llm_providers") return Promise.resolve(PROVIDERS);
      if (cmd === "vault_get_secret") return Promise.resolve(null);
      return Promise.resolve(true);
    });
    render(() => <LlmProviderSettings />);
    await screen.findByText("Vercel AI Gateway");
    fireEvent.input(await screen.findByPlaceholderText(/API key/), {
      target: { value: "vck_bad" },
    });
    fireEvent.click(screen.getByText("验证并加载模型"));
    await screen.findByText(/无法连接提供商/);
  });

  it("local provider (Ollama) hides the key field", async () => {
    render(() => <LlmProviderSettings />);
    await screen.findByText("Ollama");
    fireEvent.click(screen.getByText("Ollama"));
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/API key/)).toBeNull();
    });
  });
});
