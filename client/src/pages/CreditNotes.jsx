import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";

export default function CreditNotes() {
  const [creditNotes, setCreditNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.listCreditNotes().then(setCreditNotes).finally(() => setLoading(false)); }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Credit Notes</h1>
        <Link className="btn" to="/credit-notes/new">+ New Credit Note</Link>
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
