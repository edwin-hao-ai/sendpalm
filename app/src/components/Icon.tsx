/** Icon component — Phosphor icons rendered as <i> tags.
 * The webfont is bundled via the `@phosphor-icons/web` npm package
 * (imported in src/index.tsx); a CDN loader would be blocked by the
 * Tauri CSP in production and render every icon as tofu (§11.8).
 * Same usage as prototype: <i class="ph ph-tray"></i>.
 */

import type { JSX } from "solid-js";

interface IconProps {
  name: string; // e.g. "ph-tray", "ph-arrow-u-up-left" ("tray" also works)
  size?: number;
  color?: string;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  class?: string;
  style?: JSX.CSSProperties | string;
  title?: string;
}

export function Icon(props: IconProps): JSX.Element {
  const weightClass = () => {
    const w = props.weight ?? "regular";
    return w === "regular" ? "" : `ph-${w}`;
  };
  // Tolerate a missing "ph-" prefix — a bare glyph name renders as tofu
  // otherwise (the class list would be "ph arrows-clockwise").
  const nameClass = () =>
    props.name.startsWith("ph-") ? props.name : `ph-${props.name}`;
  const styleObj = (): JSX.CSSProperties => {
    const base: JSX.CSSProperties = {
      "font-size": `${props.size ?? 16}px`,
    };
    if (props.color) base.color = props.color;
    if (typeof props.style === "object") {
      return { ...base, ...props.style };
    }
    return base;
  };

  return (
    <i
      class={`ph ${nameClass()} ${weightClass()} ${props.class ?? ""}`}
      style={styleObj()}
      title={props.title}
      aria-hidden="true"
    />
  );
}
