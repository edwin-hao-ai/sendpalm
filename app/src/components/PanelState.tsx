/** `PanelState` — the loading / error guard for the detail panels.
 *
 *  Views go through `<ResourceGate>`; panels historically went through
 *  nothing. A slow or failing query left the panel body empty, which reads as
 *  "this contact/task/draft has no data" rather than "we haven't loaded it"
 *  or "we couldn't". Same three-state contract, shaped for a panel: a compact
 *  skeleton instead of a full-page one, a retry, and an optional empty state
 *  so "no data" stays distinguishable from both.
 */

import { Show, type JSX, type Resource } from "solid-js";
import { ErrorState } from "./Empty";
import { Skeleton, SkeletonList } from "./Skeleton";

export interface PanelStateProps<T> {
  resource: Resource<T | undefined>;
  children: JSX.Element;
  /** Compact layout for popovers and side sheets. */
  compact?: boolean;
  /** Custom skeleton; defaults to three panel-shaped rows. */
  loading?: JSX.Element;
  /** True when the resolved value means "nothing to show". */
  isEmpty?: (data: T) => boolean;
  /** Rendered instead of `children` when `isEmpty` says so. */
  empty?: JSX.Element;
  /** Copy for the error panel. */
  errorTitle?: string;
}

export function PanelState<T>(props: PanelStateProps<T>): JSX.Element {
  const retry = () => {
    (
      props.resource as unknown as { refetch: () => void }
    ).refetch?.();
  };
  const resolved = () => props.resource();
  const loading = () => props.resource.loading && resolved() === undefined;
  const empty = () => {
    const data = resolved();
    return data !== undefined && props.isEmpty ? props.isEmpty(data) : false;
  };

  return (
    <Show when={!props.resource.error} fallback={
      <div style={{ padding: "var(--space-3)" }}>
        <ErrorState
          title={props.errorTitle ?? "加载失败"}
          message="读取这条记录时出错，你的数据没有丢失。"
          retry={retry}
        />
      </div>
    }>
      <Show
        when={!loading()}
        fallback={
          props.loading ?? (
            <div
              data-panel-skeleton
              style={{
                display: "flex",
                "flex-direction": "column",
                gap: "var(--space-3)",
                padding: "var(--space-3)",
              }}
              aria-busy="true"
              aria-label="加载中"
            >
              <Skeleton height={props.compact ? 16 : 24} width="55%" />
              <Skeleton height={12} width="35%" />
              <SkeletonList count={props.compact ? 2 : 3} height={props.compact ? 28 : 44} />
            </div>
          )
        }
      >
        <Show when={!empty()} fallback={props.empty}>
          {props.children}
        </Show>
      </Show>
    </Show>
  );
}
