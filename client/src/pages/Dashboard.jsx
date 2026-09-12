import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, getUser } from "../lib/api";
import CashFlowChart from "../components/CashFlowChart";
import InvoiceDetail from "../components/InvoiceDetail";
import { relativeDueLabel } from "../lib/invoiceStatus";
import { formatMoney, formatDate } from "../lib/format";
import { useDateFormat } from "../lib/useDateFormat";
import { exportSheet } from "../lib/exportExcel";

export default function Dashboard() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const user = getUser();
  const isOwnerOrAdmin = user?.role === "owner" || user?.role === "admin";
  const dateFormat = useDateFormat();

  const loadInvoices = () =>
    api.listInvoices().then((rows) => {
      setInvoices(rows);
      setSelectedId((current) => {
        if (current && rows.some((r) => r.id === current)) return current;
        return rows[0]?.id ?? null;
      });
    });

  useEffect(() => {
    loadInvoices().finally(() => setLoading(false));
    if (isOwnerOrAdmin) api.getReportsSummary().then(setSummary).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwnerOrAdmin]);

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (inv.customer_name || "").toLowerCase().includes(q) ||
        (inv.invoice_number || "").toLowerCase().includes(q) ||
        (inv.reference || "").toLowerCase().includes(q)
      );
    });
  }, [invoices, search, statusFilter]);

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
              <span className="stat-label">Overdue</span>
              <span className="stat-value" style={{ color: "var(--danger, #b3261e)" }}>₹{formatMoney(summary.overdueAmount)}</span>
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

      <div className="page-header">
        <h2>Invoices</h2>
        {invoices.length > 0 && (
          <button type="button" className="link-btn" onClick={() => exportInvoicesToExcel(invoices)}>
            Export to Excel
          </button>
        )}
      </div>
      {loading && <p className="muted">Loading...</p>}
      {!loading && invoices.length === 0 && (
        <div className="panel">
          <p className="muted">No invoices yet — create your first one.</p>
          <Link className="btn" to="/invoices/new">+ New Invoice</Link>
        </div>
      )}

      {invoices.length > 0 && (
        <div className="invoices-split">
          <div className="invoice-list-wrap">
            <div className="list-toolbar">
              <input
                type="search"
                placeholder="Search by customer, invoice #, reference..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="partially_paid">Partially paid</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="invoice-list">
              {filteredInvoices.length === 0 && (
                <p className="list-empty-filtered">No invoices match your search.</p>
              )}
              {filteredInvoices.map((inv) => {
                const label = relativeDueLabel(inv);
                return (
                  <button
                    key={inv.id}
                    type="button"
                    className={`invoice-list-item${inv.id === selectedId ? " active" : ""}`}
                    onClick={() => setSelectedId(inv.id)}
                  >
                    <div className="invoice-list-item-top">
                      <span className="invoice-list-item-name">{inv.customer_name || "Walk-in customer"}</span>
                      <span className="invoice-list-item-amount">₹{formatMoney(inv.total)}</span>
                    </div>
                    <div className="invoice-list-item-bottom">
                      <span className="muted">{inv.invoice_number} · {formatDate(inv.invoice_date, dateFormat)}</span>
                      <span className={`due-label due-label-${label.tone}`}>{label.text}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="invoice-detail-pane">
            {selectedId && <InvoiceDetail invoiceId={selectedId} onChanged={loadInvoices} />}
          </div>
        </div>
      )}
    </div>
  );
}

function exportInvoicesToExcel(invoices) {
  const rows = invoices.map((inv) => ({
    "Invoice #": inv.invoice_number,
    Customer: inv.customer_name || "Walk-in customer",
    "Invoice Date": inv.invoice_date,
    "Due Date": inv.due_date || "",
    Status: inv.status,
    Total: Number(inv.total),
    "Balance Due": Number(inv.balance_due),
  }));
  exportSheet("invoices.xlsx", "Invoices", rows);
}
