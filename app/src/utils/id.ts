/** ID generation + JSON helpers. */

export function uid(prefix = ""): string {
  const u =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${u}` : u;
}

export function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

export function safeStringify(v: unknown): string {
  return JSON.stringify(v ?? null);
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}