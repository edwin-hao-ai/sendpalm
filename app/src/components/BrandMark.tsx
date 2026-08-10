/** BrandMark — palm-leaf wordmark used in the topbar. */

import { Icon } from "./Icon";

export function BrandMark() {
  return (
    <div
      data-testid="brand-mark"
      style={{
        display: "inline-flex",
        "align-items": "center",
        gap: "8px",
        "user-select": "none",
      }}
    >
      <Icon
        name="ph-leaf"
        size={18}
        style={{ color: "var(--palm)", "flex-shrink": "0" }}
      />
      <span
        style={{
          "font-family": "var(--font-display)",
          "font-weight": "700",
          "font-size": "18px",
          "letter-spacing": "-0.01em",
          color: "var(--text-primary)",
          "white-space": "nowrap",
        }}
      >
        SendPalm
      </span>
    </div>
  );
}
