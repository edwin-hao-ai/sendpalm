/** LLM keychain helpers — per-provider keys + legacy migration. */

import { describe, it, expect, vi, beforeEach } from "vitest";

const store = new Map<string, string>();

vi.mock("../services/backend", () => ({
  vaultGetSecret: (key: string) => Promise.resolve(store.get(key) ?? null),
  vaultSetSecret: (key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve(true);
  },
}));

import {
  saveLlmKey,
  loadLlmKey,
  migrateLegacyLlmKey,
  providerIdForBaseUrl,
  llmVaultKey,
} from "./llm-config";

const PROVIDERS = [
  { id: "vercel", defaultBaseUrl: "https://ai-gateway.vercel.sh/v1" },
  { id: "deepseek", defaultBaseUrl: "https://api.deepseek.com/v1" },
  { id: "ollama", defaultBaseUrl: "http://127.0.0.1:11434" },
];

describe("llm-config", () => {
  beforeEach(() => store.clear());

  it("saves and loads a per-provider key", async () => {
    await saveLlmKey("vercel", "vck_test");
    expect(await loadLlmKey("vercel")).toBe("vck_test");
    expect(store.has(llmVaultKey("vercel"))).toBe(true);
  });

  it("falls back to the legacy key when no per-provider entry exists", async () => {
    store.set("llm_api_key", "sk-legacy");
    expect(await loadLlmKey("openai")).toBe("sk-legacy");
  });

  it("prefers the per-provider key over the legacy one", async () => {
    store.set("llm_api_key", "sk-legacy");
    await saveLlmKey("deepseek", "sk-deepseek-new");
    expect(await loadLlmKey("deepseek")).toBe("sk-deepseek-new");
  });

  it("maps base URLs to provider ids by host, custom otherwise", () => {
    expect(
      providerIdForBaseUrl("https://ai-gateway.vercel.sh/v1", PROVIDERS),
    ).toBe("vercel");
    expect(
      providerIdForBaseUrl("https://api.deepseek.com/v1", PROVIDERS),
    ).toBe("deepseek");
    expect(providerIdForBaseUrl("http://192.168.1.9:8000/v1", PROVIDERS)).toBe(
      "custom",
    );
    expect(providerIdForBaseUrl("", PROVIDERS)).toBe("custom");
  });

  it("migrates the legacy key into the matching provider slot, once", async () => {
    store.set("llm_api_key", "vck_legacy_vercel");
    await migrateLegacyLlmKey("https://ai-gateway.vercel.sh/v1", PROVIDERS);
    expect(await loadLlmKey("vercel")).toBe("vck_legacy_vercel");
    // Idempotent: a scoped key now exists; a second run must not clobber.
    store.set(llmVaultKey("vercel"), "vck_newer");
    await migrateLegacyLlmKey("https://ai-gateway.vercel.sh/v1", PROVIDERS);
    expect(await loadLlmKey("vercel")).toBe("vck_newer");
  });

  it("migration is a no-op without a legacy key (browser mode)", async () => {
    await migrateLegacyLlmKey("https://api.openai.com/v1", PROVIDERS);
    expect(store.size).toBe(0);
  });
});
