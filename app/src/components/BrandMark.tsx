/** BrandMark — paper-plane + canary-dot wordmark used in the topbar.
 *
 *  Uses the bespoke logo-mark.svg (same composition as the splash screen,
 *  full logo, and Tauri bundle icons) instead of a stock Phosphor glyph so
 *  the topbar reads as the same brand as the launch surface.
 *
 *  The asset is imported via Vite's `?url` query so the build rewrites the
 *  path to a hashed file under `dist/assets/`. Literal `/src/assets/...`
 *  strings in JSX are NOT processed by Vite — they would 404 in production.
 *
 *  Keep this typography in sync with the splash word in app/index.html so
 *  the two brand surfaces don't drift.
 */

import { JSX } from "solid-js";
import logoMarkUrl from "/src/assets/logo-mark.svg?url";

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
        src={logoMarkUrl}
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
