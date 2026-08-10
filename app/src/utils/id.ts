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

/** Encode an ArrayBuffer as a pure base64 string (no data URL prefix). */
export function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1024) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + 1024) as unknown as number[],
    );
  }
  return btoa(binary);
}
