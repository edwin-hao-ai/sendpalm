/** Imbox-style "更多筛选" modal.
 *
 *  Mirrors the prototype's openFilterPanel / renderFilterPanelBody sort
 *  dropdown (Newest first / Oldest first / Most relevant). Apply commits
 *  the in-memory copy to the shared `sortMode` signal so the Imbox header
 *  reflects the change immediately. "清除全部" resets the current view's
 *  filter to `DEFAULT_SORT`.
 *
 *  The prototype's extra filter dimensions (date range, channel pills,
 *  contacts, has-attachment, followed-up) need query support in
 *  `listMessagesPaged` — tracked as a follow-up; an inert toggle that
 *  applies to nothing is worse than no toggle (AGENTS §3.2).
 */

import { For, createEffect, createSignal } from "solid-js";
import { Modal } from "./Modal";
import {
  DEFAULT_SORT,
  SORT_LABELS,
  type SortMode,
} from "../utils/sort-imbox";
import { getSortMode, updateSortMode } from "../stores/ui";
import type { ViewName } from "../stores/ui";

interface FilterPanelProps {
  open: boolean;
  viewName: ViewName;
  onClose: () => void;
}

const SORT_ORDER: SortMode[] = ["newest", "oldest", "most_relevant"];

export function FilterPanel(props: FilterPanelProps) {
  const [pending, setPending] = createSignal<SortMode>(DEFAULT_SORT);

  // Sync pending state whenever the modal opens so it reflects the current
  // committed value, not whatever the user was last editing.
  createEffect(() => {
    if (props.open) {
      setPending(getSortMode(props.viewName));
    }
  });

  const apply = () => {
    updateSortMode(props.viewName, pending());
    props.onClose();
  };

  const clearAll = () => {
    updateSortMode(props.viewName, DEFAULT_SORT);
    setPending(DEFAULT_SORT);
    props.onClose();
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="更多筛选"
      width="420px"
      footer={
        <>
          <button
            type="button"
            onClick={clearAll}
            style={{
              padding: "8px 14px",
              background: "transparent",
              border: "0",
              color: "var(--text-secondary)",
              "font-weight": "700",
              cursor: "pointer",
            }}
          >
            清除全部
          </button>
          <button
            type="button"
            onClick={apply}
            style={{
              padding: "8px 18px",
              background: "var(--palm)",
              color: "white",
              border: "0",
              "border-radius": "var(--radius-pill)",
              "font-weight": "700",
              cursor: "pointer",
            }}
          >
            应用
          </button>
        </>
      }
    >
      <div style={{ display: "flex", "flex-direction": "column", gap: "18px" }}>
        <div>
          <div
            style={{
              "font-size": "var(--text-caption)",
              "font-weight": "700",
              color: "var(--text-muted)",
              "margin-bottom": "8px",
            }}
          >
            排序
          </div>
          <select
            value={pending()}
            onChange={(e) =>
              setPending(e.currentTarget.value as SortMode)
            }
            data-filter-sort
            aria-label="排序方式"
            style={{
              width: "100%",
              padding: "10px 12px",
              "border-radius": "var(--radius-md)",
              border: "0.5px solid var(--border)",
              background: "var(--paper)",
              color: "var(--text-primary)",
              "font-family": "inherit",
              "font-size": "var(--text-body-sm)",
            }}
          >
            <For each={SORT_ORDER}>
              {(mode) => <option value={mode}>{SORT_LABELS[mode]}</option>}
            </For>
          </select>
        </div>
      </div>
    </Modal>
  );
}
