import { createPortal } from "react-dom";

// A generic yes/no confirmation popup, meant to be reused anywhere an
// action is destructive or easy to trigger by mistake (deleting feedback,
// flipping a business's plan, cancelling an invoice, and so on) — one
// component so every confirmation in the app looks and behaves the same
// way, instead of each page inventing its own window.confirm() or, worse,
// no confirmation at all (2026-09-15).
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  return createPortal(
    <div className="modal-backdrop" onMouseDown={onCancel}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onCancel} aria-label="Close">
            &times;
          </button>
        </div>
        <div>
          {typeof message === "string" ? <p className="muted">{message}</p> : message}
          <div className="modal-actions">
            <button type="button" className="link-btn" onClick={onCancel}>
              {cancelLabel}
            </button>
            <button type="button" className={danger ? "btn-danger" : ""} onClick={onConfirm} disabled={busy}>
              {busy ? "Working..." : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
