/** Avatar — initials-based fallback with picsum/photo support. */

import { Show } from "solid-js";

interface AvatarProps {
  name: string;
  src?: string;
  size?: number;
  color?: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

export function Avatar(props: AvatarProps) {
  const size = () => props.size ?? 32;
  return (
    <div
      style={{
        width: `${size()}px`,
        height: `${size()}px`,
        "border-radius": "50%",
        background: props.color ?? `hsl(${hashHue(props.name)}, 60%, 85%)`,
        color: props.color ? "white" : `hsl(${hashHue(props.name)}, 60%, 30%)`,
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "font-size": `${Math.round(size() * 0.4)}px`,
        "font-weight": "700",
        overflow: "hidden",
        "flex-shrink": 0,
        border: "0.5px solid var(--border)",
      }}
    >
      <Show when={props.src} fallback={<span>{initials(props.name)}</span>}>
        <img
          src={props.src}
          alt={props.name}
          style={{
            width: "100%",
            height: "100%",
            "object-fit": "cover",
          }}
          loading="lazy"
        />
      </Show>
    </div>
  );
}
