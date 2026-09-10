import { useState } from "react";

// Small inline "email this document" control shared by Invoice/Quote/Credit
// Note views — a button that expands into a recipient field once clicked, so
// it doesn't clutter the toolbar when the customer already has an email on file.
export default function SendEmailButton({ defaultTo, onSend }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo || "");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null); // { ok: true } | { error: string }

  const handleSend = async (e) => {
    e.preventDefault();
    setSending(true);
    setResult(null);
    try {
      await onSend(to);
      setResult({ ok: true });
    } catch (err) {
      setResult({ error: err.message });
    } finally {
      setSending(false);
    }
  };

  if (!open) {
    return (
      <button type="button" onClick={() => { setOpen(true); setResult(null); }}>
        Email to Customer
      </button>
    );
  }

  return (
    <form className="inline-form" onSubmit={handleSend}>
      <input
        type="email" placeholder="customer@example.com" value={to}
        onChange={(e) => setTo(e.target.value)} required
      />
      <button type="submit" disabled={sending}>{sending ? "Sending..." : "Send"}</button>
      <button type="button" className="link-btn" onClick={() => setOpen(false)}>Cancel</button>
      {result?.error && <p className="error">{result.error}</p>}
      {result?.ok && <p className="muted">Sent!</p>}
    </form>
  );
}
