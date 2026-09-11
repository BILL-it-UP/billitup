import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getUser } from "../lib/api";
import CashFlowChart from "../components/CashFlowChart";

const STATUS_LABEL = {
  draft: "Draft", sent: "Sent", paid: "Paid",
  partially_paid: "Partially paid", overdue: "Overdue",
};

export default function Dashboard() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const user = getUser();
  const isOwnerOrAdmin = user?.role === "owner" || user?.role === "admin";

  useEffect(() => {
    api.listInvoices().then(setInvoices).finally(() => setLoading(false));
    if (isOwnerOrAdmin) api.getReportsSummary().then(setSummary).catch(() => {});
  }, [isOwnerOrAdmin]);

  const recent = invoices.slice(0, 8);

  return (
    <div>
      <div className="page-header">
        <h1>Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}</h1>
        <Link className="btn" to="/invoices/new">+ New Invoice</Link>
      </div>

      {isOwnerOrAdmin && summary && (
        <>
          <div className="stat-tiles">
            <div className="stat-tile">
              <span className="stat-label">Total Invoiced</span>
              <span className="stat-value">₹{Number(summary.total_invoiced).toFixed(2)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Total Received</span>
              <span className="stat-value">₹{Number(summary.total_received).toFixed(2)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Outstanding</span>
              <span className="stat-value">₹{Number(summary.total_outstanding).toFixed(2)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Overdue</span>
              <span className="stat-value" style={{ color: "var(--danger, #b3261e)" }}>₹{Number(summary.overdueAmount).toFixed(2)}</span>
            </div>
          </div>

          <div className="report-columns">
            <div className="panel">
              <h2>Total Receivables</h2>
              <div className="receivables-split">
                <div>
                  <span className="stat-label">Current</span>
                  <span className="stat-value">₹{Number(summary.receivables.current).toFixed(2)}</span>
                </div>
                <div>
                  <span className="stat-label">Overdue</span>
                  <span className="stat-value" style={{ color: "var(--danger, #b3261e)" }}>₹{Number(summary.receivables.overdue).toFixed(2)}</span>
                </div>
              </div>
              <div className="receivables-bar">
                {summary.total_outstanding > 0 && (
                  <>
                    <div style={{ width: `${(summary.receivables.current / summary.total_outstanding) * 100}%` }} className="receivables-bar-current" />
                    <div style={{ width: `${(summary.receivables.overdue / summary.total_outstanding) * 100}%` }} className="receivables-bar-overdue" />
                  </>
                )}
              </div>
              <Link to="/reports" className="link-btn" style={{ marginTop: 12, display: "inline-block", fontSize: 13 }}>View full reports →</Link>
            </div>

            <div className="panel">
              <h2>Cash Flow (last 6 months)</h2>
              {summary.cashFlow.length === 0
                ? <p className="muted">No payments recorded yet.</p>
                : <CashFlowChart data={summary.cashFlow} />}
            </div>
          </div>
        </>
      )}

      <div className="panel dashboard-invoices">
        <div className="panel-header-row">
          <h2>Recent Invoices</h2>
          {invoices.length > 8 && <span className="muted" style={{ fontSize: 13 }}>Showing 8 of {invoices.length}</span>}
        </div>

        {loading && <p className="muted">Loading...</p>}
        {!loading && invoices.length === 0 && (
          <p className="muted">No invoices yet — create your first one.</p>
        )}

        {recent.length > 0 && (
          <table className="table">
            <thead>
              <tr><th>#</th><th>Customer</th><th>Date</th><th>Status</th><th className="num">Total</th></tr>
            </thead>
            <tbody>
              {recent.map((inv) => (
                <tr key={inv.id}>
                  <td><Link to={`/invoices/${inv.id}`}>{inv.invoice_number}</Link></td>
                  <td>{inv.customer_name || "—"}</td>
                  <td>{inv.invoice_date}</td>
                  <td>
                    {inv.is_overdue
                      ? <span className="badge badge-overdue">Overdue</span>
                      : <span className={`badge badge-${inv.status}`}>{STATUS_LABEL[inv.status] || inv.status}</span>}
                  </td>
                  <td className="num">₹{Number(inv.total).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
