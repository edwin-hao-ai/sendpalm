/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";

// Native-app feel: never show the browser context menu. Users read this
// as "a web page, not an app". Editable fields keep their menu (copy /
// paste / spellcheck) — native text fields do too.
document.addEventListener("contextmenu", (e) => {
  const t = e.target as HTMLElement | null;
  if (t?.closest?.("input, textarea, [contenteditable=true]")) return;
  e.preventDefault();
});

// Browser-mode Tauri shim — installs `window.__TAURI_INTERNALS__` mock so
// services/backend.ts can run in plain `pnpm dev` (no Tauri shell).
// No-op when running inside the real Tauri runtime.
import "./services/tauri-shim";

// Expose test helpers on `window.__sendpalmE2E` in dev browser mode only.
// The DEV guard keeps this module out of the production Tauri bundle.
if (import.meta.env.DEV) {
  void import("./e2e-test-helpers");
}

// Phosphor Icons — bundled via npm so the Tauri CSP (script-src 'self') and
// offline desktop builds both get the webfont. The package ships a CSS file
// per weight; importing the regular weight covers all current <Icon> usage
// (no call site sets `weight=`). Vite copies the woff2 into dist/assets/.
// See AGENTS.md §11 ("Many resources not loaded") for the previous
// unpkg-CDN regression that this import replaces.
import "@phosphor-icons/web/regular";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/animations.css";
import "./styles/imbox.css";
import "./styles/print.css";

render(() => <App />, document.getElementById("root") as HTMLElement);

// Note: the pre-JS splash overlay in index.html is hidden from App.tsx once
// the app has finished bootstrapping. Keeping it visible until then avoids a
// white flash while initApp() loads settings and data.
