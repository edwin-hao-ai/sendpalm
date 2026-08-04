/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";

// Browser-mode Tauri shim — installs `window.__TAURI_INTERNALS__` mock so
// services/backend.ts can run in plain `pnpm dev` (no Tauri shell).
// No-op when running inside the real Tauri runtime.
import "./services/tauri-shim";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/animations.css";

render(() => <App />, document.getElementById("root") as HTMLElement);

// Once SolidJS has mounted, dismiss the pre-JS splash overlay declared in
// index.html. Using a class (not `display:none` directly) so the splash's
// own fade-out keyframes can play first.
requestAnimationFrame(() => {
  document.body.classList.add("app-ready");
});