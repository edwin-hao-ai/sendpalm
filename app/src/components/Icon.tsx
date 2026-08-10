/** Icon component — Phosphor icons rendered as <i> tags.
 * Phosphor's CDN loader script (loaded in index.html) renders these.
 * Same usage as prototype: <i class="ph ph-tray"></i>.
 */

import type { JSX } from "solid-js";

interface IconProps {
  name: string; // e.g. "ph-tray", "ph-arrow-u-up-left"
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
      class={`ph ${props.name} ${weightClass()} ${props.class ?? ""}`}
      style={styleObj()}
      title={props.title}
      aria-hidden="true"
    />
  );
}
