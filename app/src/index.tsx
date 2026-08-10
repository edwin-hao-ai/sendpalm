/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";

// Browser-mode Tauri shim — installs `window.__TAURI_INTERNALS__` mock so
// services/backend.ts can run in plain `pnpm dev` (no Tauri shell).
// No-op when running inside the real Tauri runtime.
import "./services/tauri-shim";

// Expose test helpers on `window.__sendpalmE2E` in dev browser mode only.
// The DEV guard keeps this module out of the production Tauri bundle.
if (import.meta.env.DEV) {
  void import("./e2e-test-helpers");
}

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/animations.css";

render(() => <App />, document.getElementById("root") as HTMLElement);

// Note: the pre-JS splash overlay in index.html is hidden from App.tsx once
// the app has finished bootstrapping. Keeping it visible until then avoids a
// white flash while initApp() loads settings and data.
