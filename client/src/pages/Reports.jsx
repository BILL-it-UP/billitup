import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import CashFlowChart from "../components/CashFlowChart";
import { formatMoney, formatDate } from "../lib/format";
import { exportWorkbook, exportSheet } from "../lib/exportExcel";
import { useDateFormat } from "../lib/useDateFormat";

function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

// GSTR-1-style export — a self-contained panel: picking a month fetches a
// preview (counts + totals) so Naveen can sanity-check it before exporting,
// and the actual Excel workbook is only built once he clicks Export. See
// server/src/lib/gstr1.js for exactly what this does and doesn't cover.
function Gstr1Panel() {
  const [month, setMonth] = useState(currentMonthStr());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      setReport(await api.getGstr1Report(month));
    } catch (err) {
      setError(err.message);
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!report) return;
    exportWorkbook(`gstr1-${report.month}.xlsx`, [
      {
        name: "B2B Invoices",
        rows: report.b2b.map((r) => ({
          "GSTIN of Recipient": r.gstin, "Receiver Name": r.receiver_name,
          "Invoice Number": r.invoice_number, "Invoice Date": r.invoice_date,
          "Invoice Value": r.invoice_value, "Place of Supply": r.place_of_supply,
          "Reverse Charge": r.reverse_charge, "Rate (%)": r.rate, "Taxable Value": r.taxable_value,
          CGST: r.cgst, SGST: r.sgst, IGST: r.igst,
        })),
      },
      {
        name: "B2C Summary",
        rows: report.b2cSummary.map((r) => ({
          "Place of Supply": r.place_of_supply, "Rate (%)": r.rate,
          "Taxable Value": r.taxable_value, CGST: r.cgst, SGST: r.sgst, IGST: r.igst,
        })),
      },
      {
        name: "Nil Rated - No GST",
        rows: report.nilRated.map((r) => ({
          "Invoice Number": r.invoice_number, "Invoice Date": r.invoice_date,
          Customer: r.customer_name, "Place of Supply": r.place_of_supply, "Invoice Value": r.invoice_value,
        })),
      },
    ]);
  };

  return (
    <div className="panel" style={{ marginBottom: 32 }}>
      <h2>GSTR-1 Export</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Builds a GSTR-1-style breakdown of one month's invoices (B2B, a B2C summary, and nil-rated/no-GST) as an
        Excel file, for you or your tax advisor to use when filing. This assembles the numbers, it does not file
        anything on its own.
      </p>
      <div className="list-toolbar">
        <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setReport(null); }} />
        <button type="button" onClick={handleGenerate} disabled={loading}>{loading ? "Generating..." : "Generate"}</button>
        {report && <button type="button" className="link-btn" onClick={handleExport}>Export to Excel</button>}
      </div>
      {error && <p className="error">{error}</p>}
      {report && (
        <table className="table">
          <thead><tr><th></th><th>Invoices</th><th>Taxable Value</th><th>Tax</th></tr></thead>
          <tbody>
            <tr><td>B2B (customer has GSTIN)</td><td>{report.totals.b2bCount}</td><td>₹{formatMoney(report.totals.b2bTaxableValue)}</td><td>₹{formatMoney(report.totals.b2bTax)}</td></tr>
            <tr><td>B2C (grouped by state + rate)</td><td>{report.totals.b2cCount} group(s)</td><td>₹{formatMoney(report.totals.b2cTaxableValue)}</td><td>₹{formatMoney(report.totals.b2cTax)}</td></tr>
            <tr><td>Nil Rated / No GST</td><td>{report.totals.nilRatedCount}</td><td>₹{formatMoney(report.totals.nilRatedValue)}</td><td>—</td></tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

// A GSTR-3B-style helper — the summary return where actual tax liability is
// declared and paid each month, separate from the line-by-line GSTR-1 above.
// This pulls together output tax already collected (from invoices) and a
// candidate input tax credit figure (from the Purchases log) into one rough
// net-payable number. See server/src/lib/gstr3b.js for exactly what this
// does and doesn't cover — it's a starting point for your tax advisor, not a
// final filing figure.
function Gstr3bPanel() {
  const [month, setMonth] = useState(currentMonthStr());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      setSummary(await api.getGstr3bSummary(month));
    } catch (err) {
      setError(err.message);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!summary) return;
    exportWorkbook(`gstr3b-helper-${summary.month}.xlsx`, [
      {
        name: "Summary",
        rows: [
          { Section: "Regular outward supplies (3.1a) - Taxable Value", Amount: summary.outward.regular.taxableValue },
          { Section: "Regular outward supplies (3.1a) - CGST", Amount: summary.outward.regular.cgst },
          { Section: "Regular outward supplies (3.1a) - SGST", Amount: summary.outward.regular.sgst },
          { Section: "Regular outward supplies (3.1a) - IGST", Amount: summary.outward.regular.igst },
          { Section: "Regular outward supplies (3.1a) - Tax not split by CGST/SGST/IGST (older invoices)", Amount: summary.outward.regular.unsplitTax },
          { Section: "Reverse charge outward (3.1a, tax paid by recipient) - Taxable Value", Amount: summary.outward.reverseCharge.taxableValue },
          { Section: "Nil rated / no GST - Value", Amount: summary.outward.nilRated.taxableValue },
          { Section: "Total output tax collected", Amount: summary.taxCollected },
          { Section: "Purchases logged - Taxable Value", Amount: summary.purchases.taxableValue },
          { Section: "Purchases logged - Tax (candidate ITC, Table 4)", Amount: summary.purchases.taxAmount },
          { Section: "Rough net payable (tax collected minus candidate ITC)", Amount: summary.roughNetPayable },
        ],
      },
    ]);
  };

  return (
    <div className="panel" style={{ marginBottom: 32 }}>
      <h2>GSTR-3B Helper</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Pulls together the output tax already collected on your invoices and a candidate input tax credit figure
        from your Purchases log into one rough summary for the month. This is a starting point for filing, not a
        final figure, since real GSTR-3B eligibility also depends on things this software doesn't track, such as
        your suppliers' own filing status and any credit carried forward. Please confirm the final numbers with
        your tax advisor before filing.
      </p>
      <div className="list-toolbar">
        <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setSummary(null); }} />
        <button type="button" onClick={handleGenerate} disabled={loading}>{loading ? "Generating..." : "Generate"}</button>
        {summary && <button type="button" className="link-btn" onClick={handleExport}>Export to Excel</button>}
      </div>
      {error && <p className="error">{error}</p>}
      {summary && (
        <>
          <table className="table">
            <thead><tr><th></th><th>Invoices</th><th>Taxable Value</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Not split (older invoices)</th></tr></thead>
            <tbody>
              <tr>
                <td>Regular (forward charge)</td>
                <td>{summary.outward.regular.count}</td>
                <td>₹{formatMoney(summary.outward.regular.taxableValue)}</td>
                <td>₹{formatMoney(summary.outward.regular.cgst)}</td>
                <td>₹{formatMoney(summary.outward.regular.sgst)}</td>
                <td>₹{formatMoney(summary.outward.regular.igst)}</td>
                <td>{summary.outward.regular.unsplitTax > 0 ? `₹${formatMoney(summary.outward.regular.unsplitTax)}` : "—"}</td>
              </tr>
              <tr>
                <td>Reverse charge (tax paid by recipient)</td>
                <td>{summary.outward.reverseCharge.count}</td>
                <td>₹{formatMoney(summary.outward.reverseCharge.taxableValue)}</td>
                <td>—</td><td>—</td><td>—</td><td>—</td>
              </tr>
              <tr>
                <td>Nil rated / no GST</td>
                <td>{summary.outward.nilRated.count}</td>
                <td>₹{formatMoney(summary.outward.nilRated.taxableValue)}</td>
                <td>—</td><td>—</td><td>—</td><td>—</td>
              </tr>
            </tbody>
          </table>
          {summary.outward.regular.unsplitTax > 0 && (
            <p className="muted" style={{ marginTop: 8 }}>
              The "Not split" column is tax from invoices saved before this software tracked CGST/SGST/IGST
              separately (or where a state wasn't set at the time). It is still included in the total below,
              just not broken out by CGST/SGST/IGST.
            </p>
          )}
          <table className="table" style={{ marginTop: 16 }}>
            <tbody>
              <tr><td>Total output tax collected</td><td><strong>₹{formatMoney(summary.taxCollected)}</strong></td></tr>
              <tr>
                <td>Purchases logged ({summary.purchases.count}) - taxable value ₹{formatMoney(summary.purchases.taxableValue)}</td>
                <td>Candidate ITC: <strong>₹{formatMoney(summary.purchases.taxAmount)}</strong></td>
              </tr>
              <tr><td>Rough net payable</td><td><strong>₹{formatMoney(summary.roughNetPayable)}</strong></td></tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

const REPORT_CATEGORY_ORDER = ["Sales", "Receivables", "Payments Received", "Purchases and Expenses"];

// The Report Library — pick one of a catalog of named reports (Sales by
// Customer, Invoice Details, AR Aging Summary, and so on), narrow it down
// with whichever filters that report supports (date range, customer,
// vendor, status), then export the result as Excel or PDF. See
// server/src/lib/reportsCatalog.js for the full list and why a few
// Zoho-style reports (Profit and Loss, Vendor Balance Summary, and similar)
// aren't in this list — they need features BillItUp doesn't have yet.
function ReportLibraryPanel() {
  const [catalog, setCatalog] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [category, setCategory] = useState("Sales");
  const [reportKey, setReportKey] = useState("");
  const [filters, setFilters] = useState({ from: "", to: "", customerId: "", vendorId: "", status: "" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState("");
  const dateFormat = useDateFormat();

  useEffect(() => {
    api.getReportLibraryCatalog().then((list) => {
      setCatalog(list);
      const first = list.find((r) => r.category === "Sales");
      if (first) setReportKey(first.key);
    });
    api.listCustomers().then(setCustomers).catch(() => {});
    api.listVendors().then(setVendors).catch(() => {});
  }, []);

  const reportsInCategory = useMemo(() => (catalog || []).filter((r) => r.category === category), [catalog, category]);
  const def = useMemo(() => (catalog || []).find((r) => r.key === reportKey), [catalog, reportKey]);

  const handleCategoryChange = (value) => {
    setCategory(value);
    const first = (catalog || []).find((r) => r.category === value);
    setReportKey(first ? first.key : "");
    setResult(null);
  };

  const buildParams = () => {
    const params = {};
    if (!def) return params;
    if (def.filters.includes("from") && filters.from) params.from = filters.from;
    if (def.filters.includes("to") && filters.to) params.to = filters.to;
    if (def.filters.includes("customerId") && filters.customerId) params.customerId = filters.customerId;
    if (def.filters.includes("vendorId") && filters.vendorId) params.vendorId = filters.vendorId;
    if (def.filters.includes("status") && filters.status) params.status = filters.status;
    return params;
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError("");
    try {
      setResult(await api.runReportLibrary(reportKey, buildParams()));
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = () => {
    if (!result) return;
    const rows = result.rows.map((row) => {
      const out = {};
      for (const col of result.columns) out[col.label] = row[col.key];
      return out;
    });
    exportSheet(`${reportKey}.xlsx`, result.name.slice(0, 31), rows);
  };

  const handleExportPdf = async () => {
    setPdfLoading(true);
    setError("");
    try {
      const url = await api.downloadReportLibraryPdf(reportKey, buildParams());
      window.open(url, "_blank");
    } catch (err) {
      setError(err.message);
    } finally {
      setPdfLoading(false);
    }
  };

  const formatCell = (value, type) => {
    if (value === null || value === undefined || value === "") return "—";
    if (type === "money") return `₹${formatMoney(value)}`;
    if (type === "date") return formatDate(value, dateFormat);
    return String(value);
  };

  if (!catalog) return null;

  return (
    <div className="panel" style={{ marginBottom: 32 }}>
      <h2>Report Library</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Pick a report, narrow it down by date range, customer, or vendor, and export it as Excel or PDF.
      </p>

      <div className="list-toolbar">
        <select value={category} onChange={(e) => handleCategoryChange(e.target.value)}>
          {REPORT_CATEGORY_ORDER.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={reportKey} onChange={(e) => { setReportKey(e.target.value); setResult(null); }}>
          {reportsInCategory.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
        </select>
      </div>

      {def && <p className="muted" style={{ marginTop: -4 }}>{def.description}</p>}

      {def && (
        <div className="list-toolbar">
          {def.filters.includes("from") && (
            <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} title="From date" />
          )}
          {def.filters.includes("to") && (
            <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} title="To date" />
          )}
          {def.filters.includes("customerId") && (
            <select value={filters.customerId} onChange={(e) => setFilters({ ...filters, customerId: e.target.value })}>
              <option value="">All customers</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {def.filters.includes("vendorId") && (
            <select value={filters.vendorId} onChange={(e) => setFilters({ ...filters, vendorId: e.target.value })}>
              <option value="">All vendors</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          )}
          {def.filters.includes("status") && (
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">All statuses</option>
              {(def.statusOptions || []).map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </select>
          )}
          <button type="button" onClick={handleGenerate} disabled={loading}>{loading ? "Generating..." : "Generate"}</button>
          {result && <button type="button" className="link-btn" onClick={handleExportExcel}>Export to Excel</button>}
          {result && (
            <button type="button" className="link-btn" onClick={handleExportPdf} disabled={pdfLoading}>
              {pdfLoading ? "Preparing PDF..." : "Export to PDF"}
            </button>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {result && (
        result.rows.length === 0 ? (
          <p className="muted">No data for the selected filters.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table">
              <thead>
                <tr>{result.columns.map((col) => <th key={col.key}>{col.label}</th>)}</tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i}>
                    {result.columns.map((col) => <td key={col.key}>{formatCell(row[col.key], col.type)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

export default function Reports() {
  const [summary, setSummary] = useState(null);
  const dateFormat = useDateFormat();

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

      <ReportLibraryPanel />

      <Gstr1Panel />
      <Gstr3bPanel />

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
                  <td>{formatDate(inv.due_date, dateFormat)}</td>
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
