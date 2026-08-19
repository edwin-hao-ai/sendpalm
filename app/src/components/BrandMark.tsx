/** BrandMark — paper-plane + palm-leaf wordmark used in the topbar.
 *
 *  Uses the bespoke logo-mark.svg (same composition as the splash screen,
 *  full logo, and Tauri bundle icons) instead of a stock Phosphor glyph so
 *  the topbar reads as the same brand as the launch surface.
 *
 *  The asset path is `/src/assets/logo-mark.svg` and Vite bundles it as a
 *  URL — there is no additional HTTP request at runtime because the asset
 *  sits in the bundle.
 */

import { JSX } from "solid-js";

export function BrandMark(): JSX.Element {
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
      <img
        src="/src/assets/logo-mark.svg"
        alt=""
        width="22"
        height="22"
        aria-hidden="true"
        style={{ "flex-shrink": 0, display: "block" }}
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
