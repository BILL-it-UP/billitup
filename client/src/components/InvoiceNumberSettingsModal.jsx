import { useState } from "react";
import { api } from "../lib/api";

// Zoho's own "Configure Invoice Number Preferences" popup (Naveen's
// reference screenshot, 2026-09-20), opened from the small gear icon next
// to the Invoice# field on New Invoice. Continuing to auto-generate lets the
// prefix and the next number be changed directly (this is also how a
// business can start numbering at any chosen number, without needing to
// import anything first); switching to manual instead lets the exact number
// be typed per invoice, right there on the New Invoice form.
export default function InvoiceNumberSettingsModal({ business, onClose, onSaved }) {
  const [mode, setMode] = useState(business.invoice_number_mode || "auto");
  const [prefix, setPrefix] = useState(business.invoice_prefix || "");
  const [nextNumber, setNextNumber] = useState(business.next_invoice_number || 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const yearlyReset = !!business.reset_invoice_numbering_yearly;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = { invoice_number_mode: mode, invoice_prefix: prefix || undefined };
      // The Next Number field only actually drives anything when numbering
      // isn't reset every financial year. With that setting on, the real
      // counter lives per financial year (see invoice_number_counters in
      // db.js) and resets on its own every April, so there's nothing here
      // to hand-set.
      if (mode === "auto" && !yearlyReset) {
        const n = Number(nextNumber);
        if (!n || n < 1) {
          setError("Enter a whole number of 1 or more.");
          setSaving(false);
          return;
        }
        payload.next_invoice_number = n;
      }
      const updated = await api.updateBusiness(payload);
      onSaved(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Configure Invoice Number Preferences</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">&times;</button>
        </div>
        <div>
          <label className="checkbox-row" style={{ marginBottom: 8 }}>
            <input type="radio" name="invoice-number-mode" checked={mode === "auto"} onChange={() => setMode("auto")} />
            Continue auto-generating invoice numbers
          </label>
          {mode === "auto" && (
            <div className="field-row" style={{ marginLeft: 24, marginBottom: 12 }}>
              <label className="block">Prefix
                <input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="INV-" />
              </label>
              {yearlyReset ? (
                <p className="muted" style={{ alignSelf: "flex-end", marginBottom: 8 }}>
                  Numbering resets automatically every financial year, so there's no single "next number" to set here.
                </p>
              ) : (
                <label className="block">Next Number
                  <input type="number" min="1" step="1" value={nextNumber} onChange={(e) => setNextNumber(e.target.value)} />
                </label>
              )}
            </div>
          )}
          <label className="checkbox-row" style={{ marginBottom: 8 }}>
            <input type="radio" name="invoice-number-mode" checked={mode === "manual"} onChange={() => setMode("manual")} />
            Enter invoice numbers manually
          </label>
          {mode === "manual" && (
            <p className="muted" style={{ marginLeft: 24, marginTop: -4 }}>
              You'll type the exact invoice number yourself, right on the New Invoice form, each time.
            </p>
          )}

          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="link-btn" onClick={onClose}>Cancel</button>
            <button type="button" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
