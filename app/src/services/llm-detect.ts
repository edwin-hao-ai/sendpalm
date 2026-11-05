/** Paste-key → provider detection, mirroring the Rust catalog logic
 *  (longest prefix wins; ambiguous prefixes return catalog-ordered
 *  candidates so the UI can ask, never silently pick). */

import type { LlmProviderDto } from "./backend";

export type PrefixMatch =
  | { kind: "single"; provider: LlmProviderDto }
  | { kind: "ambiguous"; providers: LlmProviderDto[] }
  | { kind: "none" };

export function detectProviderByPrefix(
  key: string,
  providers: LlmProviderDto[],
): PrefixMatch {
  const trimmed = key.trim();
  if (!trimmed) return { kind: "none" };
  let matches = providers.filter(
    (p) => p.keyPrefix && trimmed.startsWith(p.keyPrefix),
  );
  if (matches.length > 1) {
    const maxLen = Math.max(...matches.map((p) => p.keyPrefix!.length));
    matches = matches.filter((p) => p.keyPrefix!.length === maxLen);
  }
  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) return { kind: "single", provider: matches[0]! };
  return { kind: "ambiguous", providers: matches };
}
