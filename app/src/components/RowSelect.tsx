/** Checkbox for tick-based row selection in the non-Imbox list views.
 *
 *  Imbox has had checkbox selection since the multi-select round; Stream /
 *  Records / Trash / Spam only ever answered 多选暂只在 Inbox 可用. This is the
 *  same affordance, small enough to drop into each row.
 */

import { selectedIds, setSelectedIds } from "../stores/ui";

export function RowSelect(props: { id: string; label?: string }) {
  const checked = () => selectedIds().has(props.id);

  const toggle = (ev: MouseEvent) => {
    ev.stopPropagation();
    const next = new Set(selectedIds());
    if (next.has(props.id)) next.delete(props.id);
    else next.add(props.id);
    setSelectedIds(next);
  };

  return (
    <span style={{ display: "inline-flex", "align-items": "center" }}>
      <input
        type="checkbox"
        data-row-select={props.id}
        aria-label={props.label ?? "选择这封邮件"}
        checked={checked()}
        onClick={toggle}
        // Always visible (dimmed until ticked): hover-only would hide the one
        // affordance these views were missing, and a row-level hover state
        // lives in the parent component.
        style={{
          width: "16px",
          height: "16px",
          "margin-right": "var(--space-2)",
          opacity: checked() ? 1 : 0.35,
          cursor: "pointer",
        }}
      />
    </span>
  );
}

/** Background tint for a selected row. */
export function selectedRowStyle(id: string) {
  return selectedIds().has(id)
    ? { background: "var(--palm-soft)" }
    : undefined;
}
