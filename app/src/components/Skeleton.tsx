/** Skeleton placeholder for loading states.
 * Spec: PRD §3.21 — every view must have empty / loading / error states.
 */

interface SkeletonProps {
  lines?: number;
  height?: number;
  width?: string;
  circle?: boolean;
  style?: JSX.CSSProperties;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace JSX {
  interface CSSProperties {
    [key: string]: string | number | undefined;
  }
}

export function Skeleton(props: SkeletonProps) {
  const baseStyle = {
    background:
      "linear-gradient(90deg, var(--paper-mid) 25%, var(--paper-light) 50%, var(--paper-mid) 75%)",
    "background-size": "200% 100%",
    animation: "shimmer 1.4s infinite linear",
    "border-radius": props.circle ? "50%" : "var(--radius-md)",
    height: props.circle
      ? `${props.height ?? 40}px`
      : `${props.height ?? 14}px`,
    width: props.width ?? (props.circle ? `${props.height ?? 40}px` : "100%"),
    ...props.style,
  };
  return <div style={baseStyle} aria-busy="true" aria-label="Loading" />;
}

export function SkeletonList(props: { count?: number; height?: number }) {
  const count = props.count ?? 6;
  return (
    <div
      style={{
        display: "flex",
        "flex-direction": "column",
        gap: "var(--space-3)",
      }}
    >
      {Array.from({ length: count }).map(() => (
        <Skeleton height={props.height ?? 64} />
      ))}
    </div>
  );
}
