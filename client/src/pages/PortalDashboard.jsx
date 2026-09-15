import { Fragment, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getCustomerUser, clearCustomerSession } from "../lib/api";
import { formatMoney, formatDate } from "../lib/format";
import { IconInvoice, IconPayments, IconCustomers, IconLogout } from "../components/Icons";

// The logged-in client portal — a customer's own view of every invoice
// raised against them and its status. Behind requireCustomerAuth on the
// server, which is re-checked on every request, so the business turning
// this customer's access off logs them out effectively immediately.
// Deliberately outside <Shell>: no nav, no other business data reachable
// from here — same idea as PublicInvoiceView.
//
// Redesigned 2026-09-15 into three tabs (Invoices / Payment History /
// Profile) with a proper branded top bar, after Naveen asked for the portal
// to look less like a bare table and to actually show more than just the
// invoice list — payment history and the client's/business's own saved
// details. Invoices also gained a "Pay via UPI" action per unpaid row,
// showing the same QR code now printed on the invoice/PDF (see
// lib/upiQr.js) without leaving the list.
const TABS = [
  { key: "invoices", label: "Invoices", icon: IconInvoice },
  { key: "payments", label: "Payment History", icon: IconPayments },
  { key: "profile", label: "Profile", icon: IconCustomers },
];

export default function PortalDashboard() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("invoices");
  const [payments, setPayments] = useState(null);
  const [paymentsError, setPaymentsError] = useState("");
  const [payQrOpenId, setPayQrOpenId] = useState(null);

  useEffect(() => {
    if (!getCustomerUser()) {
      navigate("/portal/login");
      return;
    }
    api.getPortalMe().then(setData).catch((err) => setError(err.message));
  }, [navigate]);

  useEffect(() => {
    if (tab !== "payments" || payments !== null) return;
    api.getPortalPayments().then(setPayments).catch((err) => setPaymentsError(err.message));
  }, [tab, payments]);

  const logout = () => {
    clearCustomerSession();
    navigate("/portal/login");
  };

  if (error) return <div className="portal-shell"><p className="error" style={{ textAlign: "center", padding: 40 }}>{error}</p></div>;
  if (!data) return <div className="portal-shell"><p className="muted" style={{ textAlign: "center", padding: 40 }}>Loading...</p></div>;

  const { customer, business, invoices } = data;
  const dateFormat = business.date_format;
  const totalOutstanding = invoices.reduce((sum, inv) => sum + Number(inv.balance_due || 0), 0);
  const overdueCount = invoices.filter((inv) => inv.balance_due > 0 && inv.due_date && inv.due_date < new Date().toISOString().slice(0, 10)).length;

  return (
    <div className="portal-shell">
      <div className="portal-topbar">
        <div className="portal-topbar-brand">
          {business.logo_data_url ? <img src={business.logo_data_url} alt={business.name} /> : <strong>{business.name}</strong>}
        </div>
        <div className="portal-topbar-right">
          <span className="portal-topbar-name">{customer.name}</span>
          <button type="button" className="link-btn portal-logout-btn" onClick={logout}>
            <IconLogout size={16} /> Log out
          </button>
        </div>
      </div>

      <div className="portal-content">
        <div className="portal-hero">
          <h1>Welcome, {customer.name}</h1>
          <p className="muted">Invoices from {business.name}</p>
          <div className="stat-tiles portal-stat-tiles">
            <div className="stat-tile">
              <span className="stat-label">Invoices</span>
              <span className="stat-value">{invoices.length}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Total Outstanding</span>
              <span className="stat-value">₹{formatMoney(totalOutstanding)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Overdue</span>
              <span className="stat-value">{overdueCount}</span>
            </div>
          </div>
        </div>

        <div className="portal-tabs">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`portal-tab${tab === key ? " active" : ""}`}
              onClick={() => setTab(key)}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
        </div>

        {tab === "invoices" && (
          invoices.length === 0 ? (
            <p className="muted">No invoices yet.</p>
          ) : (
            <div className="portal-table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Invoice #</th><th>Date</th><th>Due Date</th><th>Status</th><th>Total</th><th>Balance Due</th><th></th></tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <Fragment key={inv.id}>
                      <tr>
                        <td>{inv.invoice_number}</td>
                        <td>{formatDate(inv.invoice_date, dateFormat)}</td>
                        <td>{formatDate(inv.due_date, dateFormat)}</td>
                        <td style={{ textTransform: "capitalize" }}>{(inv.status || "").replace("_", " ")}</td>
                        <td>₹{formatMoney(inv.total)}</td>
                        <td>₹{formatMoney(inv.balance_due)}</td>
                        <td className="portal-invoice-actions">
                          <a href={`/view/invoice/${inv.public_token}`} target="_blank" rel="noreferrer">View</a>
                          {" · "}
                          <a href={api.publicInvoicePdfUrl(inv.public_token)} target="_blank" rel="noreferrer">Download PDF</a>
                          {inv.upi_qr_data_url && (
                            <>
                              {" · "}
                              <button
                                type="button"
                                className="link-btn"
                                onClick={() => setPayQrOpenId(payQrOpenId === inv.id ? null : inv.id)}
                              >
                                {payQrOpenId === inv.id ? "Hide QR" : "Pay via UPI"}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                      {payQrOpenId === inv.id && inv.upi_qr_data_url && (
                        <tr>
                          <td colSpan={7}>
                            <div className="portal-pay-qr">
                              <img src={inv.upi_qr_data_url} alt="Scan to pay via UPI" />
                              <div>
                                <p><strong>Scan with any UPI app</strong> (GPay, PhonePe, Paytm, BHIM...) to pay ₹{formatMoney(inv.balance_due)} directly to {business.name}.</p>
                                <p className="muted" style={{ fontSize: 12 }}>
                                  This pays {business.name} directly — BillItUp never handles the payment itself. {business.name} will mark this invoice paid once they see it land in their account.
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === "payments" && (
          paymentsError ? (
            <p className="error">{paymentsError}</p>
          ) : payments === null ? (
            <p className="muted">Loading...</p>
          ) : payments.length === 0 ? (
            <p className="muted">No payments recorded yet.</p>
          ) : (
            <div className="portal-table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Invoice #</th><th>Amount</th><th>Mode</th><th>Notes</th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.paid_at, dateFormat)}</td>
                      <td>
                        {p.public_token
                          ? <a href={`/view/invoice/${p.public_token}`} target="_blank" rel="noreferrer">{p.invoice_number}</a>
                          : p.invoice_number}
                      </td>
                      <td>₹{formatMoney(p.amount)}</td>
                      <td style={{ textTransform: "capitalize" }}>{(p.mode || "").replace("_", " ") || "—"}</td>
                      <td>{p.notes || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {tab === "profile" && (
          <div className="portal-profile-grid">
            <div className="panel">
              <h2>Your Details</h2>
              <p>{customer.name}</p>
              {customer.email && <p>{customer.email}</p>}
              {customer.phone && <p>{customer.phone}</p>}
              {customer.billing_address && <p>{customer.billing_address}</p>}
              {(customer.pincode || customer.country) && <p>{[customer.pincode, customer.country].filter(Boolean).join(", ")}</p>}
              {customer.gstin && <p>GSTIN: {customer.gstin}</p>}
              <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                Spot something wrong here? Let {business.name} know and they can update it for you.
              </p>
            </div>
            <div className="panel">
              <h2>{business.name}</h2>
              {business.address && <p>{business.address}</p>}
              {business.phone && <p>{business.phone}</p>}
              {business.email && <p>{business.email}</p>}
              {business.website && <p>{business.website}</p>}
              {business.gstin && <p>GSTIN: {business.gstin}</p>}
              {(business.bank_account_name || business.bank_account_number || business.bank_upi_id) && (
                <>
                  <h2 style={{ marginTop: 18 }}>Bank &amp; Payment Details</h2>
                  {business.bank_account_name && <p>Account Name: {business.bank_account_name}</p>}
                  {business.bank_name && <p>Bank: {business.bank_name}</p>}
                  {business.bank_account_number && <p>Account Number: {business.bank_account_number}</p>}
                  {business.bank_ifsc && <p>IFSC Code: {business.bank_ifsc}</p>}
                  {business.bank_upi_id && <p>UPI: {business.bank_upi_id}</p>}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
