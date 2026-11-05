/** LLM keychain helpers — per-provider keys with a one-time migration of
 *  the legacy single `llm_api_key` vault entry.
 *
 *  SEC-2: keys never live in the prefs file; the OS keychain is the only
 *  source of truth. Storage scheme: `llm::<providerId>` (e.g.
 *  `llm::vercel`, `llm::custom` for self-hosted endpoints). */

import { vaultGetSecret, vaultSetSecret } from "./backend";

const LEGACY_VAULT_KEY = "llm_api_key";

export function llmVaultKey(providerId: string): string {
  return `llm::${providerId}`;
}

export async function saveLlmKey(
  providerId: string,
  key: string,
): Promise<void> {
  await vaultSetSecret(llmVaultKey(providerId), key);
}

/** Load the key for a provider. Falls back to the legacy single key when
 *  no per-provider entry exists yet (pre-catalog installs). */
export async function loadLlmKey(providerId: string): Promise<string | null> {
  const scoped = await vaultGetSecret(llmVaultKey(providerId));
  if (scoped) return scoped;
  return vaultGetSecret(LEGACY_VAULT_KEY);
}

export interface LlmProviderLike {
  id: string;
  defaultBaseUrl: string;
}

/** Map a self-hosted base URL to its catalog provider id by host; unknown
 *  hosts (or non-URL input) become "custom". Exported for testing. */
export function providerIdForBaseUrl(
  baseUrl: string,
  providers: LlmProviderLike[],
): string {
  const host = (u: string) =>
    u
      .replace(/^https?:\/\//, "")
      .split("/")[0]!
      .split(":")[0]!;
  const target = host(baseUrl.trim());
  if (!target) return "custom";
  const match = providers.find((p) => host(p.defaultBaseUrl) === target);
  return match?.id ?? "custom";
}

/** One-time migration: copy the legacy single key into the per-provider
 *  slot that matches the user's current base URL. Idempotent — a second
 *  run is a no-op because the per-provider entry then exists.
 *  In browser mode (no Tauri) the vault calls resolve to null and this
 *  is a harmless no-op. */
export async function migrateLegacyLlmKey(
  currentBaseUrl: string,
  providers: LlmProviderLike[],
): Promise<void> {
  const legacy = await vaultGetSecret(LEGACY_VAULT_KEY);
  if (!legacy) return;
  const providerId = providerIdForBaseUrl(currentBaseUrl, providers);
  const scoped = await vaultGetSecret(llmVaultKey(providerId));
  if (scoped) return; // already migrated
  await vaultSetSecret(llmVaultKey(providerId), legacy);
}
