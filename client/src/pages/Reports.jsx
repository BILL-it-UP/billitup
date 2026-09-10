import { useEffect, useState } from "react";
import { api } from "../lib/api";

const MONTH_LABEL = (ym) => {
  if (!ym) return "";
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
};

function CashFlowChart({ data }) {
  const max = Math.max(1, ...data.map((d) => Number(d.total) || 0));
  return (
    <div className="cash-flow-chart">
      {data.map((d) => (
        <div className="cash-flow-bar" key={d.month}>
          <div className="cash-flow-bar-track">
            <div className="cash-flow-bar-fill" style={{ height: `${Math.max(2, (Number(d.total) / max) * 100)}%` }} />
          </div>
          <span className="cash-flow-value">₹{Number(d.total).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
          <span className="cash-flow-label">{MONTH_LABEL(d.month)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Reports() {
  const [summary, setSummary] = useState(null);

  useEffect(() => { api.getReportsSummary().then(setSummary); }, []);

  if (!summary) return <p className="muted">Loading...</p>;

  const aging = summary.arAging;
  const agingTotal = aging.current + aging.days1to30 + aging.days31to60 + aging.days61to90 + aging.days90plus;

  return (
    <div>
      <h1>Reports</h1>

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
          <span className="stat-label">Invoices</span>
          <span className="stat-value">{summary.invoice_count}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Total Credited</span>
          <span className="stat-value">₹{Number(summary.totalCredited).toFixed(2)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Overdue</span>
          <span className="stat-value">₹{Number(summary.overdueAmount).toFixed(2)}</span>
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
        </div>

        <div className="panel">
          <h2>Cash Flow (last 6 months)</h2>
          {summary.cashFlow.length === 0
            ? <p className="muted">No payments recorded yet.</p>
            : <CashFlowChart data={summary.cashFlow} />}
        </div>
      </div>

      {summary.overdueInvoices.length > 0 && (
        <div className="low-stock-alert">
          <h2>Overdue Invoices</h2>
          <table className="table">
            <thead><tr><th>#</th><th>Customer</th><th>Due Date</th><th>Balance Due</th></tr></thead>
            <tbody>
              {summary.overdueInvoices.map((inv) => (
                <tr key={inv.id}>
                  <td><a href={`/invoices/${inv.id}`}>{inv.invoice_number}</a></td>
                  <td>{inv.customer_name || "—"}</td>
                  <td>{inv.due_date}</td>
                  <td>₹{Number(inv.balance_due).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>AR Aging Summary</h2>
      <table className="table">
        <thead><tr><th>Current</th><th>1–30 days</th><th>31–60 days</th><th>61–90 days</th><th>90+ days</th><th>Total</th></tr></thead>
        <tbody>
          <tr>
            <td>₹{aging.current.toFixed(2)}</td>
            <td>₹{aging.days1to30.toFixed(2)}</td>
            <td>₹{aging.days31to60.toFixed(2)}</td>
            <td>₹{aging.days61to90.toFixed(2)}</td>
            <td>₹{aging.days90plus.toFixed(2)}</td>
            <td><strong>₹{agingTotal.toFixed(2)}</strong></td>
          </tr>
        </tbody>
      </table>

      <div className="report-columns">
        <div>
          <h2>Sales by Customer</h2>
          {summary.salesByCustomer.length === 0 && <p className="muted">No data yet.</p>}
          {summary.salesByCustomer.length > 0 && (
            <table className="table">
              <thead><tr><th>Customer</th><th>Invoices</th><th>Total Billed</th></tr></thead>
              <tbody>
                {summary.salesByCustomer.map((c) => (
                  <tr key={c.name}><td>{c.name}</td><td>{c.invoice_count}</td><td>₹{Number(c.total).toFixed(2)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div>
          <h2>Sales by Item</h2>
          {summary.salesByItem.length === 0 && <p className="muted">No data yet.</p>}
          {summary.salesByItem.length > 0 && (
            <table className="table">
              <thead><tr><th>Item</th><th>Qty Sold</th><th>Total</th></tr></thead>
              <tbody>
                {summary.salesByItem.map((i) => (
                  <tr key={i.description}><td>{i.description}</td><td>{i.qty}</td><td>₹{Number(i.total).toFixed(2)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <h2>Customer Balance Summary</h2>
      {summary.customerBalances.length === 0 && <p className="muted">No data yet.</p>}
      {summary.customerBalances.length > 0 && (
        <table className="table">
          <thead><tr><th>Customer</th><th>Total Invoiced</th><th>Total Received</th><th>Balance Due</th></tr></thead>
          <tbody>
            {summary.customerBalances.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>₹{Number(c.total_invoiced).toFixed(2)}</td>
                <td>₹{Number(c.total_received).toFixed(2)}</td>
                <td>₹{Number(c.balance_due).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Payments Received</h2>
      {summary.paymentsReceived.length === 0 && <p className="muted">No payments recorded yet.</p>}
      {summary.paymentsReceived.length > 0 && (
        <table className="table">
          <thead><tr><th>Date</th><th>Invoice #</th><th>Customer</th><th>Mode</th><th>Amount</th></tr></thead>
          <tbody>
            {summary.paymentsReceived.map((p) => (
              <tr key={p.id}>
                <td>{String(p.paid_at).slice(0, 10)}</td>
                <td><a href={`/invoices/${p.invoice_id}`}>{p.invoice_number}</a></td>
                <td>{p.customer_name || "—"}</td>
                <td>{p.mode}</td>
                <td>₹{Number(p.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
