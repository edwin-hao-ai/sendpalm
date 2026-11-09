/** Appearance: density and accent colour.
 *
 *  Both are applied to `<html>` as attributes/CSS variables rather than
 *  threaded through components — the token system already owns every colour
 *  and spacing decision, so the theme is a two-line override, not a prop.
 */

export type Density = "compact" | "standard" | "comfortable";

export const DENSITY_LABEL: Record<Density, string> = {
  compact: "紧凑",
  standard: "标准",
  comfortable: "舒适",
};

export interface AccentChoice {
  /** Stored value. */
  value: string;
  label: string;
}

export const ACCENT_CHOICES: AccentChoice[] = [
  { value: "#0a8f63", label: "品牌绿" },
  { value: "#2f6feb", label: "海蓝" },
  { value: "#7700a2", label: "紫罗兰" },
  { value: "#c2410c", label: "赤陶" },
  { value: "#4b5563", label: "石墨" },
];

/** `#rrggbb` + alpha byte, e.g. `withAlpha("#0a8f63", 0.1)` → `#0a8f631a`. */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "").trim();
  if (clean.length !== 6 || !/^[0-9a-f]{6}$/i.test(clean)) {
    // Unknown value: fall back to the brand green so a corrupt setting can
    // never make the UI transparent.
    return alpha === 0.1 ? "#0a8f631a" : "#0a8f632e";
  }
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${clean}${byte}`;
}

/** Apply appearance to the document. Idempotent; safe to call on boot and on
 *  every settings change. */
export function applyAppearance(opts: {
  density?: Density;
  accent?: string;
}): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  if (opts.density) {
    if (opts.density === "standard") root.removeAttribute("data-density");
    else root.dataset.density = opts.density;
  }

  if (opts.accent) {
    root.style.setProperty("--palm", opts.accent);
    root.style.setProperty("--palm-soft", withAlpha(opts.accent, 0.1));
    root.style.setProperty("--palm-glow", withAlpha(opts.accent, 0.18));
    // A slightly lighter tint for the "bright" accent used by hovers/badges.
    root.style.setProperty(
      "--palm-bright",
      `color-mix(in srgb, ${opts.accent} 85%, white)`,
    );
  }
}
