import { useState } from "react";

const MODES = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "cheque", label: "Cheque" },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

// A proper Record Payment form (amount, date, mode, reference/notes) instead
// of the old single amount box — collapsed to a button until clicked, same
// pattern as SendEmailButton, so it doesn't clutter the toolbar by default.
export default function RecordPaymentForm({ balanceDue, onRecord }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidAt, setPaidAt] = useState(todayISO());
  const [mode, setMode] = useState("cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const startOpen = () => {
    setAmount(balanceDue ? String(balanceDue) : "");
    setPaidAt(todayISO());
    setMode("cash");
    setNotes("");
    setError("");
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await onRecord({ amount: Number(amount), paid_at: paidAt, mode, notes: notes || undefined });
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return <button type="button" onClick={startOpen}>Record Payment</button>;
  }

  return (
    <form className="payment-form" onSubmit={submit}>
      <div className="form-row">
        <label className="block">
          Amount Received (₹)
          <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </label>
        <label className="block">
          Payment Date
          <input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} required />
        </label>
        <label className="block">
          Payment Mode
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        Reference / Notes (optional)
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. UTR number, cheque number" />
      </label>
      <div className="payment-form-actions">
        <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Payment"}</button>
        <button type="button" className="link-btn" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
