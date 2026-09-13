import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { exportSheet } from "../lib/exportExcel";
import { formatMoney } from "../lib/format";

const MODES = [
  { value: "", label: "All payment modes" },
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
];

// A single consolidated view of every payment recorded across every
// invoice, in one place — the "Payments Timeline" identified from the Swipe
// comparison. Reports' own Payments Received table stays as a capped
// preview (200 rows); this is the full, searchable/filterable version.
export default function PaymentsTimeline() {
  const [payments, setPayments] = useState(null);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => { api.listPayments().then(setPayments); }, []);

  const filtered = useMemo(() => {
    if (!payments) return [];
    const q = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (mode && p.mode !== mode) return false;
      const paidDate = String(p.paid_at).slice(0, 10);
      if (from && paidDate < from) return false;
      if (to && paidDate > to) return false;
      if (q) {
        const hay = `${p.invoice_number || ""} ${p.customer_name || ""} ${p.notes || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [payments, search, mode, from, to]);

  const total = useMemo(() => filtered.reduce((sum, p) => sum + Number(p.amount || 0), 0), [filtered]);

  if (!payments) return <p className="muted">Loading...</p>;

  return (
    <div>
      <div className="page-header">
        <h1>Payments Timeline</h1>
        {payments.length > 0 && (
          <button type="button" className="link-btn" onClick={() => exportPaymentsToExcel(filtered)}>
            Export to Excel
          </button>
        )}
      </div>

      {payments.length === 0 ? (
        <p className="muted">No payments recorded yet — they'll show up here as soon as you record one against an invoice.</p>
      ) : (
        <>
          <div className="stat-tiles" style={{ gridTemplateColumns: "repeat(2, 1fr)", marginBottom: 16 }}>
            <div className="stat-tile">
              <span className="stat-label">Payments Shown</span>
              <span className="stat-value">{filtered.length}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Total Amount</span>
              <span className="stat-value">₹{formatMoney(total)}</span>
            </div>
          </div>

          <div className="list-toolbar">
            <input
              type="search"
              placeholder="Search by invoice #, customer, notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              {MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <label className="muted" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="muted" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </label>
          </div>

          {filtered.length === 0 ? (
            <p className="list-empty-filtered">No payments match your filters.</p>
          ) : (
            <table className="table">
              <thead><tr><th>Date</th><th>Invoice #</th><th>Customer</th><th>Mode</th><th>Notes</th><th>Amount</th></tr></thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>{String(p.paid_at).slice(0, 10)}</td>
                    <td><Link to={`/invoices/${p.invoice_id}`}>{p.invoice_number}</Link></td>
                    <td>{p.customer_name || "—"}</td>
                    <td>{p.mode || "—"}</td>
                    <td>{p.notes}</td>
                    <td>₹{formatMoney(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

function exportPaymentsToExcel(payments) {
  const rows = payments.map((p) => ({
    Date: String(p.paid_at).slice(0, 10), "Invoice #": p.invoice_number,
    Customer: p.customer_name || "", Mode: p.mode || "", Notes: p.notes || "", Amount: Number(p.amount),
  }));
  exportSheet("payments-timeline.xlsx", "Payments", rows);
}
