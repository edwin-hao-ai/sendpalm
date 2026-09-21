/** ConfirmDialog — destructive-action confirmation built on Modal.
 *
 * Use for any irreversible action (permanent delete, empty trash, …).
 * The confirm button is danger-styled; Esc / backdrop click cancels.
 */

import { Show } from "solid-js";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Optional explanatory line(s) under the title. */
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const confirm = () => {
    props.onConfirm();
    props.onCancel();
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onCancel}
      title={props.title}
      width="400px"
      footer={
        <>
          <button
            onClick={props.onCancel}
            style={{
              padding: "8px 16px",
              "border-radius": "var(--radius-pill)",
              border: "0.5px solid var(--border)",
              color: "var(--ink-secondary)",
              "font-size": "var(--text-body-sm)",
            }}
          >
            {props.cancelLabel ?? "取消"}
          </button>
          <button
            onClick={confirm}
            style={{
              padding: "8px 16px",
              "border-radius": "var(--radius-pill)",
              background: "var(--status-danger)",
              color: "#fff",
              "font-size": "var(--text-body-sm)",
              "font-weight": "600",
            }}
          >
            {props.confirmLabel ?? "确认"}
          </button>
        </>
      }
    >
      <Show when={props.body}>
        <p
          style={{
            margin: 0,
            color: "var(--ink-secondary)",
            "font-size": "var(--text-body-sm)",
            "line-height": "1.6",
          }}
        >
          {props.body}
        </p>
      </Show>
    </Modal>
  );
}
