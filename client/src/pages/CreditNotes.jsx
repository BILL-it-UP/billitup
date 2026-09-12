import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatMoney, formatDate } from "../lib/format";
import { exportSheet } from "../lib/exportExcel";
import { useDateFormat } from "../lib/useDateFormat";

export default function CreditNotes() {
  const [creditNotes, setCreditNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const dateFormat = useDateFormat();

  useEffect(() => { api.listCreditNotes().then(setCreditNotes).finally(() => setLoading(false)); }, []);

  const filteredCreditNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return creditNotes;
    return creditNotes.filter((c) =>
      (c.customer_name || "").toLowerCase().includes(q) ||
      (c.credit_note_number || "").toLowerCase().includes(q) ||
      (c.invoice_number || "").toLowerCase().includes(q)
    );
  }, [creditNotes, search]);

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
        <div className="list-toolbar">
          <input
            type="search"
            placeholder="Search by customer, credit note #, or invoice #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {creditNotes.length > 0 && filteredCreditNotes.length === 0 && (
        <p className="list-empty-filtered">No credit notes match your search.</p>
      )}

      {filteredCreditNotes.length > 0 && (
        <table className="table">
          <thead><tr><th>#</th><th>Customer</th><th>Against Invoice</th><th>Date</th><th>Total</th></tr></thead>
          <tbody>
            {filteredCreditNotes.map((c) => (
              <tr key={c.id}>
                <td><Link to={`/credit-notes/${c.id}`}>{c.credit_note_number}</Link></td>
                <td>{c.customer_name || "—"}</td>
                <td>{c.invoice_number || "—"}</td>
                <td>{formatDate(c.credit_note_date, dateFormat)}</td>
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
