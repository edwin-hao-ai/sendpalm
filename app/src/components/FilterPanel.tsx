/** Imbox-style "More filters" modal.
 *
 *  Mirrors the prototype's openFilterPanel / renderFilterPanelBody:
 *  - Sort dropdown (Newest first / Oldest first / Most relevant)
 *  - Unread only toggle
 *
 *  Only the sort dropdown is wired to behavior right now; the unread toggle
 *  is kept for visual parity and future use. Apply commits the in-memory
 *  copy to the shared `sortMode` signal so the Imbox header reflects the
 *  change immediately. "Clear all" resets the current view's filter to
 *  `DEFAULT_SORT`.
 */

import { For, Show, createEffect, createSignal } from "solid-js";
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
  const [unreadOnly, setUnreadOnly] = createSignal(false);

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
    setUnreadOnly(false);
    props.onClose();
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="More filters"
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
            Clear all
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
            Apply
          </button>
        </>
      }
    >
      <div style={{ display: "flex", "flex-direction": "column", gap: "18px" }}>
        <Field label="Sort">
          <select
            value={pending()}
            onChange={(e) =>
              setPending(e.currentTarget.value as SortMode)
            }
            data-filter-sort
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
        </Field>

        <Field label="Status">
          <Toggle
            label="Unread only"
            checked={unreadOnly()}
            onChange={setUnreadOnly}
          />
        </Field>
      </div>
    </Modal>
  );
}

function Field(props: { label: string; children: unknown }) {
  return (
    <div>
      <div
        style={{
          "font-size": "var(--text-caption)",
          "font-weight": "700",
          color: "var(--text-muted)",
          "text-transform": "uppercase",
          "letter-spacing": "0.06em",
          "margin-bottom": "8px",
        }}
      >
        {props.label}
      </div>
      {props.children as never}
    </div>
  );
}

function Toggle(props: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Show when={true}>
      <label
        style={{
          display: "flex",
          "align-items": "center",
          gap: "10px",
          cursor: "pointer",
          "font-size": "var(--text-body-sm)",
          color: "var(--text-primary)",
        }}
      >
        <input
          type="checkbox"
          checked={props.checked}
          onChange={(e) => props.onChange(e.currentTarget.checked)}
          style={{
            width: "16px",
            height: "16px",
            "accent-color": "var(--palm)",
            cursor: "pointer",
          }}
        />
        {props.label}
      </label>
    </Show>
  );
}
