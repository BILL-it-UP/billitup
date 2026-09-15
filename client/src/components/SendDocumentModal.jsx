import { useState } from "react";
import { createPortal } from "react-dom";

// A popup for emailing a document (invoice/quote/credit note) to a
// customer — replaces the old inline "type an email, hit send" box so the
// business always sees the actual subject and message before anything goes
// out, pre-filled from their saved template (or the built-in default, see
// lib/emailTemplates.js) and fully editable right here before sending
// (2026-09-15).
export default function SendDocumentModal({ title, defaultTo, defaultSubject, defaultBody, onSend, onClose }) {
  const [to, setTo] = useState(defaultTo || "");
  const [subject, setSubject] = useState(defaultSubject || "");
  const [message, setMessage] = useState(defaultBody || "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const handleSend = async () => {
    if (!to.trim()) {
      setError("Enter an email address to send this to.");
      return;
    }
    setSending(true);
    setError("");
    try {
      await onSend({ to: to.trim(), subject, message });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-panel wide" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div>
          <label className="block">
            To
            <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@example.com" autoFocus />
          </label>
          <label className="block">
            Subject
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="block">
            Message
            <textarea rows={8} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          {!defaultTo && (
            <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
              This customer has no email on file — sending here won't save it to their record.
            </p>
          )}
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="link-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" onClick={handleSend} disabled={sending}>
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
