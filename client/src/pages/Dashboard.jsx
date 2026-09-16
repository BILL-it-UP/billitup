import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, getUser } from "../lib/api";
import CashFlowChart from "../components/CashFlowChart";
import InvoiceDetail from "../components/InvoiceDetail";
import { relativeDueLabel, computePaymentSummary } from "../lib/invoiceStatus";
import { formatMoney, formatDate } from "../lib/format";
import { currencySymbol } from "../lib/currencies";
import { useDateFormat } from "../lib/useDateFormat";
import ExportInvoicesModal from "../components/ExportInvoicesModal";

export default function Dashboard() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [summary, setSummary] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showExportModal, setShowExportModal] = useState(false);
  const [business, setBusiness] = useState(null);
  const [bulkSelectedIds, setBulkSelectedIds] = useState([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
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
    // The 401 case (expired login) is now handled globally in lib/api.js,
    // which sends the user straight back to the login page — this .catch()
    // is only for anything else that can fail (server down, no network) so
    // it shows a plain message instead of leaving the page looking empty
    // with no explanation.
    loadInvoices()
      .catch((err) => setLoadError(err.message || "Could not load invoices."))
      .finally(() => setLoading(false));
    if (isOwnerOrAdmin) api.getReportsSummary().then(setSummary).catch(() => {});
    api.getBusiness().then(setBusiness).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwnerOrAdmin]);

  // e-Invoicing under GST becomes mandatory once a business crosses ₹5 crore
  // in aggregate turnover in any year since FY 2017-18 — this is just an
  // awareness banner from the turnover Naveen enters in Settings, not a
  // check against actual GST portal data, so it's deliberately worded as a
  // reminder to verify rather than a determination (2026-09-16).
  const showEInvoiceBanner = Number(business?.annual_turnover) >= 50000000;

  const toggleBulkSelect = (id) => {
    setBulkSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const runBulkAction = async (action) => {
    if (bulkSelectedIds.length === 0) return;
    setBulkBusy(true);
    setBulkResult(null);
    try {
      const res = action === "send"
        ? await api.bulkSendInvoices(bulkSelectedIds)
        : await api.bulkInvoiceStatus(bulkSelectedIds, action);
      setBulkResult(res);
      setBulkSelectedIds([]);
      await loadInvoices();
    } catch (err) {
      setBulkResult({ error: err.message });
    } finally {
      setBulkBusy(false);
    }
  };

  const paymentSummary = useMemo(() => computePaymentSummary(invoices), [invoices]);

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

      {loadError && <p className="error">{loadError}</p>}
      {isOwnerOrAdmin && showEInvoiceBanner && (
        <p className="muted">
          Your annual turnover is set at ₹{formatMoney(business.annual_turnover)} or more, and e-Invoicing under GST is
          mandatory past ₹5 crore turnover. Double check with your GST practitioner whether e-Invoicing applies to you
          (BillItUp doesn't generate e-Invoices itself).
        </p>
      )}

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

      {invoices.length > 0 && (
        <div className="payment-summary-bar">
          <div className="payment-summary-item">
            <span className="payment-summary-label">Total Outstanding Receivables</span>
            <span className="payment-summary-value">{currencySymbol("INR")}{formatMoney(paymentSummary.totalOutstanding)}</span>
          </div>
          <div className="payment-summary-item">
            <span className="payment-summary-label">Due Today</span>
            <span className="payment-summary-value">{currencySymbol("INR")}{formatMoney(paymentSummary.dueToday)}</span>
          </div>
          <div className="payment-summary-item">
            <span className="payment-summary-label">Due Within 30 Days</span>
            <span className="payment-summary-value">{currencySymbol("INR")}{formatMoney(paymentSummary.dueWithin30)}</span>
          </div>
          <div className="payment-summary-item">
            <span className="payment-summary-label">Overdue Invoices</span>
            <span className="payment-summary-value payment-summary-overdue">{currencySymbol("INR")}{formatMoney(paymentSummary.overdue)}</span>
          </div>
          {isOwnerOrAdmin && summary?.avgDaysToPay != null && (
            <div className="payment-summary-item">
              <span className="payment-summary-label">Average Days to Get Paid</span>
              <span className="payment-summary-value">{summary.avgDaysToPay} Day{summary.avgDaysToPay === 1 ? "" : "s"}</span>
            </div>
          )}
        </div>
      )}

      <div className="page-header">
        <h2>Invoices</h2>
        {invoices.length > 0 && (
          <button type="button" className="link-btn" onClick={() => setShowExportModal(true)}>
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
            {isOwnerOrAdmin && bulkSelectedIds.length > 0 && (
              <div className="list-toolbar bulk-action-toolbar">
                <span>{bulkSelectedIds.length} selected</span>
                <button type="button" onClick={() => runBulkAction("sent")} disabled={bulkBusy}>Mark Sent</button>
                <button type="button" onClick={() => runBulkAction("cancelled")} disabled={bulkBusy}>Cancel</button>
                <button type="button" onClick={() => runBulkAction("send")} disabled={bulkBusy}>{bulkBusy ? "Working..." : "Email"}</button>
                <button type="button" className="link-btn" onClick={() => setBulkSelectedIds([])} disabled={bulkBusy}>Clear</button>
              </div>
            )}
            {bulkResult && (
              <p className="muted">
                {bulkResult.error
                  ? bulkResult.error
                  : `Done: ${(bulkResult.updated || bulkResult.sent || []).length} updated${(bulkResult.skipped || []).length ? `, ${bulkResult.skipped.length} skipped (${bulkResult.skipped.map((s) => s.reason).join("; ")})` : ""}.`}
              </p>
            )}
            <div className="invoice-list">
              {filteredInvoices.length === 0 && (
                <p className="list-empty-filtered">No invoices match your search.</p>
              )}
              {filteredInvoices.map((inv) => {
                const label = relativeDueLabel(inv);
                return (
                  <div key={inv.id} className={`invoice-list-item${inv.id === selectedId ? " active" : ""}`}>
                    {isOwnerOrAdmin && (
                      <input
                        type="checkbox"
                        className="invoice-list-item-checkbox"
                        checked={bulkSelectedIds.includes(inv.id)}
                        onChange={() => toggleBulkSelect(inv.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <button type="button" className="invoice-list-item-body" onClick={() => setSelectedId(inv.id)}>
                      <div className="invoice-list-item-top">
                        <span className="invoice-list-item-name">{inv.customer_name || "Walk-in customer"}</span>
                        <span className="invoice-list-item-amount">{currencySymbol(inv.currency)}{formatMoney(inv.total)}</span>
                      </div>
                      <div className="invoice-list-item-bottom">
                        <span className="muted">{inv.invoice_number} · {formatDate(inv.invoice_date, dateFormat)}</span>
                        <span className={`due-label due-label-${label.tone}`}>{label.text}</span>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="invoice-detail-pane">
            {selectedId && <InvoiceDetail invoiceId={selectedId} onChanged={loadInvoices} />}
          </div>
        </div>
      )}

      {showExportModal && (
        <ExportInvoicesModal invoices={invoices} onClose={() => setShowExportModal(false)} />
      )}
    </div>
  );
}
