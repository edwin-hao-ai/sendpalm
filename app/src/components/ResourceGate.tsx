/** ResourceGate — minimal Show-nested wrapper for createResource results.
 *
 *  SolidJS `createResource` exposes `.loading`, `.error`, and a `()` accessor
 *  that returns `T | undefined`. Every view that consumes a resource needs
 *  three guards (loading / error / empty), and writing them by hand led to
 *  22 views that all forgot the error check (audit 2026-08-18). This
 *  component centralises the pattern so each view only declares its custom
 *  empty / loading / error UX.
 *
 *  The default predicates assume the resource resolves to an array (the
 *  shape every list view in the app has). Callers resolving to a single
 *  object should pass `isEmpty={d => false}` or the equivalent — the
 *  single-record case is never 'empty' from the user's perspective.
 */

import { Show, type JSX, type Resource } from "solid-js";
import { Empty, ErrorState } from "./Empty";
import { SkeletonList } from "./Skeleton";

export interface ResourceGateProps<T> {
  resource: Resource<T | undefined>;
  /**
   * Render while the resource is in flight. Defaults to a 6-row
   * SkeletonList; pass an explicit element to override.
   */
  loading?: JSX.Element;
  /**
   * Render when the resource has errored. Receives the raw error and a
   * retry callback wired to `resource.refetch()`. Defaults to the app-wide
   * ErrorState with a 重试 button.
   */
  errorView?: (err: unknown, retry: () => void) => JSX.Element;
  /**
   * Render when the resource is ready but resolves to an empty value per
   * `isEmpty`. Caller passes a JSX element (typically `<Empty .../>`).
   * If omitted and the data is empty, the gate renders nothing — the
   * parent view's own fallback wins, which keeps existing visual designs
   * that already had bespoke Empty sub-components.
   */
  empty?: JSX.Element;
  /**
   * Decide whether `data` is considered 'empty'. Default behaviour
   * (`isResourceEmpty`) treats arrays of length 0 as empty and any other
   * value as non-empty. Override for non-list resources.
   */
  isEmpty?: (data: T) => boolean;
  children: (data: T) => JSX.Element;
}

/** Pure predicate extracted from ResourceGate so the decision logic can be
 *  unit-tested without a DOM. */
export function isResourceEmpty<T>(
  data: T | undefined,
  customIsEmpty?: (data: T) => boolean,
): boolean {
  if (data == null) return false;
  if (customIsEmpty) return customIsEmpty(data);
  if (Array.isArray(data)) return data.length === 0;
  return false;
}

export function ResourceGate<T>(props: ResourceGateProps<T>): JSX.Element {
  const data = (): T | undefined => props.resource();

  const errorView = (): JSX.Element => {
    const err = props.resource.error;
    if (props.errorView) {
      return props.errorView(err, () => {
        // Resource<T> doesn't expose refetch at the type level; cast
        // through unknown to call it. createResource always returns a
        // refetch pair, so this is safe at runtime.
        (props.resource as unknown as { refetch: () => void }).refetch();
      });
    }
    return (
      <ErrorState
        title="加载失败"
        message={err instanceof Error ? err.message : String(err)}
        retry={() => {
          (props.resource as unknown as { refetch: () => void }).refetch();
        }}
      />
    );
  };

  const fallbackEmpty = (): JSX.Element => (
    <Empty icon="ph-tray" title="暂无数据" />
  );

  return (
    <Show when={!props.resource.error} fallback={errorView()}>
      <Show
        when={!props.resource.loading && data() != null}
        fallback={props.loading ?? <SkeletonList count={6} />}
      >
        <Show
          when={!isResourceEmpty(data(), props.isEmpty)}
          fallback={props.empty ?? fallbackEmpty()}
        >
          {props.children(data() as T)}
        </Show>
      </Show>
    </Show>
  );
}