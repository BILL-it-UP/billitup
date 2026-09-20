import { useState } from "react";
import { api } from "../lib/api";
import { IconImport } from "./Icons";

// Reads a chosen CSV as plain text, same size-capped, error-callback shape
// as Settings.jsx's own readFileAsDataUrl for the logo/signature uploads,
// just readAsText instead of readAsDataURL since a CSV is sent to the server
// as a plain string, not embedded as a data: URL.
function readFileAsText(file, maxBytes, onError) {
  return new Promise((resolve) => {
    if (file.size > maxBytes) {
      onError(`That file is too large (max ${Math.round(maxBytes / 1024 / 1024)}MB).`);
      return resolve(null);
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => {
      onError("Couldn't read that file.");
      resolve(null);
    };
    reader.readAsText(file);
  });
}

const MAX_CSV_BYTES = 20 * 1024 * 1024; // generous for even a large export

const FIELDS = [
  { key: "items", label: "Items CSV (optional)" },
  { key: "contacts", label: "Contacts CSV (optional, import before Invoices)" },
  { key: "invoices", label: "Invoices CSV (optional)" },
];

// Settings > Import Data. Brings items, customers, and invoices in from a
// Zoho Books CSV export. See server/src/routes/zohoImport.js for the actual
// matching/skip rules; this component is just the file pickers plus a plain
// summary of what the server did. A generic, reusable feature for anyone
// self-hosting BillItUp, not tied to any one business's data (2026-09-20).
export default function ZohoImportCard() {
  const [csvText, setCsvText] = useState({ items: null, contacts: null, invoices: null });
  const [fileNames, setFileNames] = useState({ items: "", contacts: "", invoices: "" });
  const [recreatePayments, setRecreatePayments] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);

  const handleFile = async (key, file) => {
    setError("");
    setSummary(null);
    if (!file) {
      setCsvText((prev) => ({ ...prev, [key]: null }));
      setFileNames((prev) => ({ ...prev, [key]: "" }));
      return;
    }
    const text = await readFileAsText(file, MAX_CSV_BYTES, setError);
    if (text == null) return;
    setCsvText((prev) => ({ ...prev, [key]: text }));
    setFileNames((prev) => ({ ...prev, [key]: file.name }));
  };

  const hasAnyFile = Boolean(csvText.items || csvText.contacts || csvText.invoices);

  const runImport = async () => {
    setBusy(true);
    setError("");
    setSummary(null);
    try {
      const result = await api.importZoho({
        itemsCsv: csvText.items || undefined,
        contactsCsv: csvText.contacts || undefined,
        invoicesCsv: csvText.invoices || undefined,
        recreatePayments,
      });
      setSummary(result);
      setCsvText({ items: null, contacts: null, invoices: null });
      setFileNames({ items: "", contacts: "", invoices: "" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <span className="settings-card-icon"><IconImport size={19} /></span>
        <div>
          <h2>Import from Zoho Books</h2>
          <p className="muted">
            Bring your existing items, customers, and invoices in from Zoho Books. Everything you upload here goes
            into your own business account only, nobody else using BillItUp ever sees it.
          </p>
        </div>
      </div>

      <p className="muted" style={{ fontSize: 13 }}>
        In Zoho Books, export each list you want as CSV (Items, Contacts, Invoices) and choose the matching files
        below. Import Contacts before Invoices so each invoice can be matched to the right customer. Importing is
        safe to run more than once, anything already brought in (matched by name, or by invoice number) is skipped
        rather than duplicated.
      </p>

      <div className="settings-form">
        {FIELDS.map((f) => (
          <label key={f.key}>
            {f.label}
            <input type="file" accept=".csv,text/csv" onChange={(e) => handleFile(f.key, e.target.files[0])} />
            {fileNames[f.key] && <span className="muted"> Selected: {fileNames[f.key]}</span>}
          </label>
        ))}

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={recreatePayments}
            onChange={(e) => setRecreatePayments(e.target.checked)}
          />
          {" "}Recreate payment records for invoices Zoho shows as paid or partially paid
        </label>

        {error && <p className="error">{error}</p>}

        <button type="button" onClick={runImport} disabled={busy || !hasAnyFile}>
          {busy ? "Importing..." : "Import"}
        </button>
      </div>

      {summary && (
        <div className="panel" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Import complete</h3>
          <p>Items: {summary.items.created} added, {summary.items.skipped} already existed.</p>
          <p>Customers: {summary.customers.created} added, {summary.customers.skipped} already existed.</p>
          <p>
            Invoices: {summary.invoices.created} added
            {summary.invoices.skipped.length > 0 ? `, ${summary.invoices.skipped.length} skipped` : ""}.
          </p>
          {summary.payments.created > 0 && <p>Payment records recreated: {summary.payments.created}.</p>}
          {summary.nextInvoiceNumber && <p>Your next new invoice will start at number {summary.nextInvoiceNumber}.</p>}
          {summary.invoices.skipped.length > 0 && (
            <>
              <p className="muted" style={{ marginBottom: 4 }}>Skipped invoices:</p>
              <ul style={{ marginTop: 0, fontSize: 13 }}>
                {summary.invoices.skipped.map((s) => (
                  <li key={s.invoiceNumber}>{s.invoiceNumber}: {s.reason}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
