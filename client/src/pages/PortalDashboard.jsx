import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getCustomerUser, clearCustomerSession } from "../lib/api";
import { formatMoney, formatDate } from "../lib/format";

// The logged-in client portal — a customer's own view of every invoice
// raised against them and its status. Behind requireCustomerAuth on the
// server, which is re-checked on every request, so the business turning
// this customer's access off logs them out effectively immediately.
// Deliberately outside <Shell>: no nav, no other business data reachable
// from here — same idea as PublicInvoiceView.
export default function PortalDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getCustomerUser()) {
      navigate("/portal/login");
      return;
    }
    api.getPortalMe().then(setData).catch((err) => setError(err.message));
  }, [navigate]);

  const logout = () => {
    clearCustomerSession();
    navigate("/portal/login");
  };

  if (error) return <div className="public-invoice-page"><p className="error" style={{ textAlign: "center" }}>{error}</p></div>;
  if (!data) return <div className="public-invoice-page"><p className="muted" style={{ textAlign: "center" }}>Loading...</p></div>;

  const { customer, business, invoices } = data;
  const dateFormat = business.date_format;
  const totalOutstanding = invoices.reduce((sum, inv) => sum + Number(inv.balance_due || 0), 0);

  return (
    <div className="public-invoice-page">
      <div className="no-print public-invoice-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <img src="/logo-header.png" alt="BillItUp" />
        <button type="button" className="link-btn" onClick={logout}>Log out</button>
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
