import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

const STATUS_LABEL = {
  draft: "Draft", sent: "Sent", paid: "Paid",
  partially_paid: "Partially paid", overdue: "Overdue",
};

export default function Dashboard() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listInvoices().then(setInvoices).finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="page-header">
        <h1>Invoices</h1>
        <Link className="btn" to="/invoices/new">+ New Invoice</Link>
      </div>

      {loading && <p className="muted">Loading...</p>}
      {!loading && invoices.length === 0 && (
        <p className="muted">No invoices yet — create your first one.</p>
      )}

      {invoices.length > 0 && (
        <table className="table">
          <thead>
            <tr><th>#</th><th>Customer</th><th>Date</th><th>Status</th><th>Total</th></tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id}>
                <td><Link to={`/invoices/${inv.id}`}>{inv.invoice_number}</Link></td>
                <td>{inv.customer_name || "—"}</td>
                <td>{inv.invoice_date}</td>
                <td>
                  {inv.is_overdue
                    ? <span className="badge badge-overdue">Overdue</span>
                    : <span className={`badge badge-${inv.status}`}>{STATUS_LABEL[inv.status] || inv.status}</span>}
                </td>
                <td>₹{Number(inv.total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
