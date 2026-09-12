import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatMoney } from "../lib/format";
import { exportSheet } from "../lib/exportExcel";

const STATUS_LABEL = { draft: "Draft", sent: "Sent", accepted: "Accepted", declined: "Declined", converted: "Converted to Invoice" };

export default function Quotes() {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => { api.listQuotes().then(setQuotes).finally(() => setLoading(false)); }, []);

  const filteredQuotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes.filter((quote) => {
      if (statusFilter !== "all" && quote.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (quote.customer_name || "").toLowerCase().includes(q) ||
        (quote.quote_number || "").toLowerCase().includes(q)
      );
    });
  }, [quotes, search, statusFilter]);

  return (
    <div>
      <div className="page-header">
        <h1>Quotes</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {quotes.length > 0 && (
            <button type="button" className="link-btn" onClick={() => exportQuotesToExcel(quotes)}>
              Export to Excel
            </button>
          )}
          <Link className="btn" to="/quotes/new">+ New Quote</Link>
        </div>
      </div>

      {loading && <p className="muted">Loading...</p>}
      {!loading && quotes.length === 0 && <p className="muted">No quotes yet.</p>}

      {quotes.length > 0 && (
        <div className="list-toolbar">
          <input
            type="search"
            placeholder="Search by customer or quote #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="accepted">Accepted</option>
            <option value="declined">Declined</option>
            <option value="converted">Converted to Invoice</option>
          </select>
        </div>
      )}

      {quotes.length > 0 && filteredQuotes.length === 0 && (
        <p className="list-empty-filtered">No quotes match your search.</p>
      )}

      {filteredQuotes.length > 0 && (
        <table className="table">
          <thead><tr><th>#</th><th>Customer</th><th>Date</th><th>Status</th><th>Total</th></tr></thead>
          <tbody>
            {filteredQuotes.map((q) => (
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

function exportQuotesToExcel(quotes) {
  const rows = quotes.map((q) => ({
    "Quote #": q.quote_number,
    Customer: q.customer_name || "—",
    Date: q.quote_date,
    Status: STATUS_LABEL[q.status] || q.status,
    Total: Number(q.total),
  }));
  exportSheet("quotes.xlsx", "Quotes", rows);
}
