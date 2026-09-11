import { useEffect, useState } from "react";
import { api } from "../lib/api";
import CashFlowChart from "../components/CashFlowChart";
import { formatMoney } from "../lib/format";
import { exportWorkbook } from "../lib/exportExcel";

export default function Reports() {
  const [summary, setSummary] = useState(null);

  useEffect(() => { api.getReportsSummary().then(setSummary); }, []);

  if (!summary) return <p className="muted">Loading...</p>;

  const aging = summary.arAging;
  const agingTotal = aging.current + aging.days1to30 + aging.days31to60 + aging.days61to90 + aging.days90plus;

  return (
    <div>
      <div className="page-header">
        <h1>Reports</h1>
        <button type="button" className="link-btn" onClick={() => exportReportsToExcel(summary, aging, agingTotal)}>
          Export to Excel
        </button>
      </div>

      <div className="stat-tiles">
        <div className="stat-tile">
          <span className="stat-label">Total Invoiced</span>
          <span className="stat-value">₹{formatMoney(summary.total_invoiced)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Total Received</span>
          <span className="stat-value">₹{formatMoney(summary.total_received)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Outstanding</span>
          <span className="stat-value">₹{formatMoney(summary.total_outstanding)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Invoices</span>
          <span className="stat-value">{summary.invoice_count}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Total Credited</span>
          <span className="stat-value">₹{formatMoney(summary.totalCredited)}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Overdue</span>
          <span className="stat-value">₹{formatMoney(summary.overdueAmount)}</span>
        </div>
      </div>

      <div className="report-columns">
        <div className="panel">
          <h2>Total Receivables</h2>
          <div className="receivables-split">
            <div>
              <span className="stat-label">Current</span>
              <span className="stat-value">₹{formatMoney(summary.receivables.current)}</span>
            </div>
            <div>
              <span className="stat-label">Overdue</span>
              <span className="stat-value" style={{ color: "var(--danger, #b3261e)" }}>₹{formatMoney(summary.receivables.overdue)}</span>
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
                  <td>₹{formatMoney(inv.balance_due)}</td>
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
            <td>₹{formatMoney(aging.current)}</td>
            <td>₹{formatMoney(aging.days1to30)}</td>
            <td>₹{formatMoney(aging.days31to60)}</td>
            <td>₹{formatMoney(aging.days61to90)}</td>
            <td>₹{formatMoney(aging.days90plus)}</td>
            <td><strong>₹{formatMoney(agingTotal)}</strong></td>
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
                  <tr key={c.name}><td>{c.name}</td><td>{c.invoice_count}</td><td>₹{formatMoney(c.total)}</td></tr>
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
                  <tr key={i.description}><td>{i.description}</td><td>{i.qty}</td><td>₹{formatMoney(i.total)}</td></tr>
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
                <td>₹{formatMoney(c.total_invoiced)}</td>
                <td>₹{formatMoney(c.total_received)}</td>
                <td>₹{formatMoney(c.balance_due)}</td>
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
                <td>₹{formatMoney(p.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function exportReportsToExcel(summary, aging, agingTotal) {
  exportWorkbook("reports.xlsx", [
    {
      name: "AR Aging",
      rows: [{
        Current: aging.current, "1-30 days": aging.days1to30, "31-60 days": aging.days31to60,
        "61-90 days": aging.days61to90, "90+ days": aging.days90plus, Total: agingTotal,
      }],
    },
    {
      name: "Sales by Customer",
      rows: summary.salesByCustomer.map((c) => ({ Customer: c.name, Invoices: c.invoice_count, "Total Billed": Number(c.total) })),
    },
    {
      name: "Sales by Item",
      rows: summary.salesByItem.map((i) => ({ Item: i.description, "Qty Sold": i.qty, Total: Number(i.total) })),
    },
    {
      name: "Customer Balances",
      rows: summary.customerBalances.map((c) => ({
        Customer: c.name, "Total Invoiced": Number(c.total_invoiced),
        "Total Received": Number(c.total_received), "Balance Due": Number(c.balance_due),
      })),
    },
    {
      name: "Payments Received",
      rows: summary.paymentsReceived.map((p) => ({
        Date: String(p.paid_at).slice(0, 10), "Invoice #": p.invoice_number,
        Customer: p.customer_name || "", Mode: p.mode, Amount: Number(p.amount),
      })),
    },
    {
      name: "Overdue Invoices",
      rows: summary.overdueInvoices.map((inv) => ({
        "Invoice #": inv.invoice_number, Customer: inv.customer_name || "",
        "Due Date": inv.due_date, "Balance Due": Number(inv.balance_due),
      })),
    },
  ]);
}
