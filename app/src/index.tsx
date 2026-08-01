/* @refresh reload */
import { render } from "solid-js/web";
import App from "./App";

import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/animations.css";

render(() => <App />, document.getElementById("root") as HTMLElement);