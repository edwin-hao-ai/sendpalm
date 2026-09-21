/** Shared liquid-glass recipe for floating overlays (popovers, menus,
 *  dropdowns). Composes the `--glass-*` tokens from tokens.css so every
 *  overlay stays consistent; the `.glass-panel` utility in base.css is
 *  the class-based equivalent for stylesheet consumers. */

export const glassPanelStyle = {
  background: "var(--glass-bg)",
  "backdrop-filter": "var(--glass-blur)",
  "-webkit-backdrop-filter": "var(--glass-blur)",
  border: "0.5px solid var(--border)",
  "box-shadow": "var(--glass-shadow)",
} as const;
