import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";

const STATUS_LABEL = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined", converted: "Converted to Invoice" };

export default function Quotes() {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.listQuotes().then(setQuotes).finally(() => setLoading(false)); }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Quotes</h1>
        <Link className="btn" to="/quotes/new">+ New Quote</Link>
      </div>

      {loading && <p className="muted">Loading...</p>}
      {!loading && quotes.length === 0 && <p className="muted">No quotes yet.</p>}

      {quotes.length > 0 && (
        <table className="table">
          <thead><tr><th>#</th><th>Customer</th><th>Date</th><th>Status</th><th>Total</th></tr></thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id}>
                <td><Link to={`/quotes/${q.id}`}>{q.quote_number}</Link></td>
                <td>{q.customer_name || "—"}</td>
                <td>{q.quote_date}</td>
                <td><span className={`badge badge-${q.status === "converted" ? "paid" : q.status}`}>{STATUS_LABEL[q.status] || q.status}</span></td>
                <td>₹{formatMoney(q.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
