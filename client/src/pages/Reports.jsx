import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function Reports() {
  const [summary, setSummary] = useState(null);

  useEffect(() => { api.getReportsSummary().then(setSummary); }, []);

  if (!summary) return <p className="muted">Loading...</p>;

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
      </div>

      <div className="report-columns">
        <div>
          <h2>Top Customers</h2>
          {summary.topCustomers.length === 0 && <p className="muted">No data yet.</p>}
          <table className="table">
            <thead><tr><th>Customer</th><th>Total Billed</th></tr></thead>
            <tbody>
              {summary.topCustomers.map((c) => (
                <tr key={c.name}><td>{c.name}</td><td>₹{Number(c.total).toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h2>Top Items</h2>
          {summary.topItems.length === 0 && <p className="muted">No data yet.</p>}
          <table className="table">
            <thead><tr><th>Item</th><th>Qty Sold</th><th>Total</th></tr></thead>
            <tbody>
              {summary.topItems.map((i) => (
                <tr key={i.description}><td>{i.description}</td><td>{i.qty}</td><td>₹{Number(i.total).toFixed(2)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
