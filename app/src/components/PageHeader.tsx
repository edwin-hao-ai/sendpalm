/** Shared page/section heading primitives.
 *
 *  Every top-level view presents exactly one left-aligned H1 through
 *  `PageHeader`, with an optional description line and an actions slot.
 *  `SectionHeading` carries H2/H3 hierarchy inside views. Centered
 *  composition stays reserved for empty states and onboarding — never
 *  as a second page-title style.
 */

import { Show, type JSX } from "solid-js";
import { Dynamic } from "solid-js/web";
import "./PageHeader.css";

export interface PageHeaderProps {
  title: string;
  /** Optional muted line under the title (string or rich content). */
  description?: JSX.Element;
  /** Right-aligned controls; the row wraps instead of clipping on
   *  narrow (375px) screens. */
  actions?: JSX.Element;
  /** Extra class forwarded to the root <header>. */
  class?: string;
}

export function PageHeader(props: PageHeaderProps) {
  return (
    <header
      class={`page-header${props.class ? ` ${props.class}` : ""}`}
    >
      <div class="page-header-main">
        <h1 class="page-header-title">{props.title}</h1>
        <Show when={props.description}>
          <div class="page-header-desc">{props.description}</div>
        </Show>
      </div>
      <Show when={props.actions}>
        <div class="page-header-actions">{props.actions}</div>
      </Show>
    </header>
  );
}

export interface SectionHeadingProps {
  title: string;
  description?: JSX.Element;
  actions?: JSX.Element;
  /** Semantic level — default 2. Use 3 inside an H2 section. */
  level?: 2 | 3;
}

export function SectionHeading(props: SectionHeadingProps) {
  return (
    <header class="section-heading">
      <div class="page-header-main">
        <Dynamic
          component={props.level === 3 ? "h3" : "h2"}
          class={`section-heading-title${
            props.level === 3 ? " section-heading-title--h3" : ""
          }`}
        >
          {props.title}
        </Dynamic>
        <Show when={props.description}>
          <div class="section-heading-desc">{props.description}</div>
        </Show>
      </div>
      <Show when={props.actions}>
        <div class="section-heading-actions">{props.actions}</div>
      </Show>
    </header>
  );
}
