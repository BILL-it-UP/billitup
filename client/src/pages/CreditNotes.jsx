import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";
import { exportSheet } from "../lib/exportExcel";

export default function CreditNotes() {
  const [creditNotes, setCreditNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.listCreditNotes().then(setCreditNotes).finally(() => setLoading(false)); }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Credit Notes</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {creditNotes.length > 0 && (
            <button type="button" className="link-btn" onClick={() => exportCreditNotesToExcel(creditNotes)}>
              Export to Excel
            </button>
          )}
          <Link className="btn" to="/credit-notes/new">+ New Credit Note</Link>
        </div>
      </div>

      {loading && <p className="muted">Loading...</p>}
      {!loading && creditNotes.length === 0 && <p className="muted">No credit notes yet.</p>}

      {creditNotes.length > 0 && (
        <table className="table">
          <thead><tr><th>#</th><th>Customer</th><th>Against Invoice</th><th>Date</th><th>Total</th></tr></thead>
          <tbody>
            {creditNotes.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/credit-notes/${c.id}`}>{c.credit_note_number}</Link></td>
                <td>{c.customer_name || "—"}</td>
                <td>{c.invoice_number || "—"}</td>
                <td>{c.credit_note_date}</td>
                <td>₹{formatMoney(c.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function exportCreditNotesToExcel(creditNotes) {
  const rows = creditNotes.map((c) => ({
    "Credit Note #": c.credit_note_number,
    Customer: c.customer_name || "—",
    "Against Invoice": c.invoice_number || "",
    Date: c.credit_note_date,
    Total: Number(c.total),
  }));
  exportSheet("credit-notes.xlsx", "Credit Notes", rows);
}
