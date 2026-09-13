import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatMoney, formatDate } from "../lib/format";

// Reached with no login — the destination of a customer's own "Copy portal
// link" button on the Customers page. Shows that one customer every
// invoice raised against them and its current status, so they don't have
// to email or call to ask "did you get my payment" / "what do I still
// owe". Deliberately outside <Shell>: no nav, no other business data
// reachable from here — same idea as PublicInvoiceView.
export default function PublicCustomerPortal() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getPublicCustomerPortal(token).then(setData).catch((err) => setError(err.message));
  }, [token]);

  if (error) return <div className="public-invoice-page"><p className="error" style={{ textAlign: "center" }}>{error}</p></div>;
  if (!data) return <div className="public-invoice-page"><p className="muted" style={{ textAlign: "center" }}>Loading...</p></div>;

  const { customer, business, invoices } = data;
  const dateFormat = business.date_format;
  const totalOutstanding = invoices.reduce((sum, inv) => sum + Number(inv.balance_due || 0), 0);

  return (
    <div className="public-invoice-page">
      <div className="no-print public-invoice-toolbar">
        <img src="/logo-header.png" alt="BillItUp" />
      </div>
      <div className="invoice-doc" style={{ width: "210mm", maxWidth: "100%" }}>
        <div className="panel" style={{ marginBottom: 24 }}>
          <h1 style={{ marginTop: 0 }}>{business.name}</h1>
          <p className="muted" style={{ marginTop: -8 }}>Invoices for {customer.name}</p>
          <div className="stat-tiles">
            <div className="stat-tile">
              <span className="stat-label">Invoices</span>
              <span className="stat-value">{invoices.length}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Total Outstanding</span>
              <span className="stat-value">₹{formatMoney(totalOutstanding)}</span>
            </div>
          </div>
        </div>

        {invoices.length === 0 ? (
          <p className="muted">No invoices yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Invoice #</th><th>Date</th><th>Due Date</th><th>Status</th><th>Total</th><th>Balance Due</th><th></th></tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.invoice_number}</td>
                  <td>{formatDate(inv.invoice_date, dateFormat)}</td>
                  <td>{formatDate(inv.due_date, dateFormat)}</td>
                  <td style={{ textTransform: "capitalize" }}>{(inv.status || "").replace("_", " ")}</td>
                  <td>₹{formatMoney(inv.total)}</td>
                  <td>₹{formatMoney(inv.balance_due)}</td>
                  <td>
                    <a href={`/view/invoice/${inv.public_token}`} target="_blank" rel="noreferrer">View</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
