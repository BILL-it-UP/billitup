import { db } from "../db.js";

// The Report Library behind Reports > Report Library — a set of named,
// filterable reports modeled on the common report names an invoicing/
// accounting tool like Zoho Books offers, scoped down to what BillItUp's
// schema can actually answer correctly. Two whole groups are deliberately
// left out rather than faked with numbers that would look plausible but
// mean the wrong thing:
//
// 1. Full double-entry accounting reports (Profit and Loss, Balance Sheet,
//    Trial Balance, General Ledger, Journal Report, and similar). Those
//    need a real chart of accounts with every transaction posted as a
//    journal entry — see db.js's schema comment: "no double-entry ledger".
//    Building these means adding that accounting engine first, not just
//    adding a report on top of what already exists.
// 2. A true "Payables" side (Vendor Balance Summary, AP Aging Summary/
//    Details, Payable Summary/Details, Payments Made). Those need to know
//    how much of a purchase/bill has actually been paid, and the purchases
//    table has no payment or balance tracking at all — see db.js's
//    purchases table comment: "basic record-keeping only, not a full
//    purchase ledger". Purchases by Vendor and Bill Details below are
//    grouped under "Purchases and Expenses" instead of "Payables", since
//    that's what the data actually supports.
//
// Every report definition's run(businessId, filters) returns
// { columns: [{ key, label, type }], rows: [...] } — rows are plain
// objects keyed by column.key, values left as raw numbers/strings so both
// the client table and the Excel/PDF exporters can format them themselves.
// filters is whichever of { from, to, customerId, vendorId, status } the
// report declares in its `filters` list; anything else passed is ignored.

function pushDateRange(column, from, to, clauses, params) {
  if (from) { clauses.push(`${column} >= ?`); params.push(from); }
  if (to) { clauses.push(`${column} <= ?`); params.push(to); }
}

// payments.paid_at is a full datetime ("YYYY-MM-DD HH:MM:SS"), unlike the
// plain "YYYY-MM-DD" date columns everywhere else — comparing it directly
// against a plain "to" date as a string would silently exclude same-day
// payments (e.g. "2026-09-13 10:00:00" sorts AFTER "2026-09-13", so
// "<= '2026-09-13'" would drop it). date(...) strips the time first.
function pushDatetimeRange(column, from, to, clauses, params) {
  if (from) { clauses.push(`date(${column}) >= ?`); params.push(from); }
  if (to) { clauses.push(`date(${column}) <= ?`); params.push(to); }
}

function bucketFor(daysOverdue) {
  if (daysOverdue == null || daysOverdue <= 0) return "Current";
  if (daysOverdue <= 30) return "1-30 days";
  if (daysOverdue <= 60) return "31-60 days";
  if (daysOverdue <= 90) return "61-90 days";
  return "90+ days";
}

function money(key, label) { return { key, label, type: "money" }; }
function text(key, label) { return { key, label, type: "text" }; }
function num(key, label) { return { key, label, type: "number" }; }
function date(key, label) { return { key, label, type: "date" }; }

// --- Sales -------------------------------------------------------------

function salesByCustomer(businessId, { from, to, customerId }) {
  const clauses = ["invoices.business_id = ?", "invoices.status <> 'cancelled'"];
  const params = [businessId];
  pushDateRange("invoices.invoice_date", from, to, clauses, params);
  if (customerId) { clauses.push("invoices.customer_id = ?"); params.push(customerId); }
  const rows = db
    .prepare(
      `SELECT customers.name AS customer, COUNT(*) AS invoices,
        SUM(invoices.sub_total) AS sub_total, SUM(invoices.discount) AS discount,
        SUM(invoices.tax_total) AS tax, SUM(invoices.total) AS total
       FROM invoices JOIN customers ON customers.id = invoices.customer_id
       WHERE ${clauses.join(" AND ")}
       GROUP BY invoices.customer_id ORDER BY total DESC`
    )
    .all(...params);
  return {
    columns: [text("customer", "Customer"), num("invoices", "Invoices"), money("sub_total", "Sub Total"), money("discount", "Discount"), money("tax", "Tax"), money("total", "Total")],
    rows,
  };
}

function salesByItem(businessId, { from, to, customerId }) {
  const clauses = ["invoices.business_id = ?", "invoices.status <> 'cancelled'"];
  const params = [businessId];
  pushDateRange("invoices.invoice_date", from, to, clauses, params);
  if (customerId) { clauses.push("invoices.customer_id = ?"); params.push(customerId); }
  const rows = db
    .prepare(
      `SELECT invoice_line_items.description AS item, SUM(invoice_line_items.qty) AS qty, SUM(invoice_line_items.amount) AS amount
       FROM invoice_line_items JOIN invoices ON invoices.id = invoice_line_items.invoice_id
       WHERE ${clauses.join(" AND ")}
       GROUP BY invoice_line_items.description ORDER BY amount DESC`
    )
    .all(...params);
  return { columns: [text("item", "Item"), num("qty", "Qty Sold"), money("amount", "Total")], rows };
}

function salesSummary(businessId, { from, to, customerId }) {
  const clauses = ["invoices.business_id = ?", "invoices.status <> 'cancelled'"];
  const params = [businessId];
  pushDateRange("invoices.invoice_date", from, to, clauses, params);
  if (customerId) { clauses.push("invoices.customer_id = ?"); params.push(customerId); }
  const rows = db
    .prepare(
      `SELECT invoices.status AS status, COUNT(*) AS invoices,
        SUM(invoices.sub_total) AS sub_total, SUM(invoices.discount) AS discount,
        SUM(invoices.tax_total) AS tax, SUM(invoices.total) AS total
       FROM invoices WHERE ${clauses.join(" AND ")}
       GROUP BY invoices.status ORDER BY total DESC`
    )
    .all(...params);
  const allRow = rows.reduce(
    (acc, r) => ({
      invoices: acc.invoices + r.invoices, sub_total: acc.sub_total + r.sub_total,
      discount: acc.discount + r.discount, tax: acc.tax + r.tax, total: acc.total + r.total,
    }),
    { status: "All", invoices: 0, sub_total: 0, discount: 0, tax: 0, total: 0 }
  );
  return {
    columns: [text("status", "Status"), num("invoices", "Invoices"), money("sub_total", "Sub Total"), money("discount", "Discount"), money("tax", "Tax"), money("total", "Total")],
    rows: [...rows, allRow],
  };
}

// --- Receivables ---------------------------------------------------------

function invoiceDetails(businessId, { from, to, customerId, status }) {
  const clauses = ["invoices.business_id = ?"];
  const params = [businessId];
  pushDateRange("invoices.invoice_date", from, to, clauses, params);
  if (customerId) { clauses.push("invoices.customer_id = ?"); params.push(customerId); }
  if (status) { clauses.push("invoices.status = ?"); params.push(status); }
  const rows = db
    .prepare(
      `SELECT invoices.invoice_number AS invoice_number, invoices.invoice_date AS date, customers.name AS customer,
        invoices.status AS status, invoices.sub_total AS sub_total, invoices.discount AS discount,
        invoices.tax_total AS tax, invoices.total AS total, invoices.balance_due AS balance_due
       FROM invoices LEFT JOIN customers ON customers.id = invoices.customer_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY invoices.invoice_date DESC, invoices.id DESC`
    )
    .all(...params);
  return {
    columns: [text("invoice_number", "Invoice #"), date("date", "Date"), text("customer", "Customer"), text("status", "Status"), money("sub_total", "Sub Total"), money("discount", "Discount"), money("tax", "Tax"), money("total", "Total"), money("balance_due", "Balance Due")],
    rows,
  };
}

function quoteDetails(businessId, { from, to, customerId, status }) {
  const clauses = ["quotes.business_id = ?"];
  const params = [businessId];
  pushDateRange("quotes.quote_date", from, to, clauses, params);
  if (customerId) { clauses.push("quotes.customer_id = ?"); params.push(customerId); }
  if (status) { clauses.push("quotes.status = ?"); params.push(status); }
  const rows = db
    .prepare(
      `SELECT quotes.quote_number AS quote_number, quotes.quote_date AS date, quotes.expiry_date AS expiry_date,
        customers.name AS customer, quotes.status AS status, quotes.total AS total
       FROM quotes LEFT JOIN customers ON customers.id = quotes.customer_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY quotes.quote_date DESC, quotes.id DESC`
    )
    .all(...params);
  return {
    columns: [text("quote_number", "Quote #"), date("date", "Date"), date("expiry_date", "Expiry Date"), text("customer", "Customer"), text("status", "Status"), money("total", "Total")],
    rows,
  };
}

function customerBalanceSummary(businessId, { from, to, customerId }) {
  const onClauses = ["invoices.customer_id = customers.id", "invoices.business_id = customers.business_id", "invoices.status <> 'cancelled'"];
  const onParams = [];
  pushDateRange("invoices.invoice_date", from, to, onClauses, onParams);
  const whereClauses = ["customers.business_id = ?"];
  const whereParams = [businessId];
  if (customerId) { whereClauses.push("customers.id = ?"); whereParams.push(customerId); }
  const rows = db
    .prepare(
      `SELECT customers.name AS customer,
        COALESCE(SUM(invoices.total), 0) AS total_invoiced,
        COALESCE(SUM(invoices.total - invoices.balance_due), 0) AS total_received,
        COALESCE(SUM(invoices.balance_due), 0) AS balance_due
       FROM customers LEFT JOIN invoices ON ${onClauses.join(" AND ")}
       WHERE ${whereClauses.join(" AND ")}
       GROUP BY customers.id HAVING total_invoiced > 0
       ORDER BY balance_due DESC, total_invoiced DESC`
    )
    .all(...onParams, ...whereParams);
  return {
    columns: [text("customer", "Customer"), money("total_invoiced", "Total Invoiced"), money("total_received", "Total Received"), money("balance_due", "Balance Due")],
    rows,
  };
}

function receivableSummary(businessId, { from, to, customerId }) {
  const clauses = ["business_id = ?", "status <> 'cancelled'"];
  const params = [businessId];
  pushDateRange("invoice_date", from, to, clauses, params);
  if (customerId) { clauses.push("customer_id = ?"); params.push(customerId); }
  const row = db
    .prepare(
      `SELECT COUNT(*) AS invoices, COALESCE(SUM(total), 0) AS total_invoiced,
        COALESCE(SUM(total - balance_due), 0) AS total_received, COALESCE(SUM(balance_due), 0) AS total_outstanding
       FROM invoices WHERE ${clauses.join(" AND ")}`
    )
    .get(...params);
  return {
    columns: [num("invoices", "Invoices"), money("total_invoiced", "Total Invoiced"), money("total_received", "Total Received"), money("total_outstanding", "Total Outstanding")],
    rows: [row],
  };
}

function receivableDetails(businessId, { from, to, customerId }) {
  const clauses = ["invoices.business_id = ?", "invoices.status <> 'cancelled'", "invoices.balance_due > 0"];
  const params = [businessId];
  pushDateRange("invoices.invoice_date", from, to, clauses, params);
  if (customerId) { clauses.push("invoices.customer_id = ?"); params.push(customerId); }
  const rows = db
    .prepare(
      `SELECT invoices.invoice_number AS invoice_number, invoices.invoice_date AS date, invoices.due_date AS due_date,
        customers.name AS customer, invoices.total AS total, invoices.balance_due AS balance_due
       FROM invoices LEFT JOIN customers ON customers.id = invoices.customer_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY invoices.due_date ASC, invoices.invoice_date ASC`
    )
    .all(...params);
  return {
    columns: [text("invoice_number", "Invoice #"), date("date", "Date"), date("due_date", "Due Date"), text("customer", "Customer"), money("total", "Total"), money("balance_due", "Balance Due")],
    rows,
  };
}

function arAgingSummary(businessId, { customerId }) {
  const clauses = ["business_id = ?", "status <> 'cancelled'", "balance_due > 0"];
  const params = [businessId];
  if (customerId) { clauses.push("customer_id = ?"); params.push(customerId); }
  const invoiceRows = db
    .prepare(
      `SELECT balance_due,
        CASE WHEN due_date IS NULL THEN NULL ELSE CAST(julianday('now') - julianday(due_date) AS INTEGER) END AS days_overdue
       FROM invoices WHERE ${clauses.join(" AND ")}`
    )
    .all(...params);
  const bucket = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
  for (const r of invoiceRows) {
    const label = bucketFor(r.days_overdue);
    if (label === "Current") bucket.current += r.balance_due;
    else if (label === "1-30 days") bucket.days1to30 += r.balance_due;
    else if (label === "31-60 days") bucket.days31to60 += r.balance_due;
    else if (label === "61-90 days") bucket.days61to90 += r.balance_due;
    else bucket.days90plus += r.balance_due;
  }
  const total = bucket.current + bucket.days1to30 + bucket.days31to60 + bucket.days61to90 + bucket.days90plus;
  return {
    columns: [money("current", "Current"), money("days1to30", "1-30 days"), money("days31to60", "31-60 days"), money("days61to90", "61-90 days"), money("days90plus", "90+ days"), money("total", "Total")],
    rows: [{ ...bucket, total }],
  };
}

function arAgingDetails(businessId, { customerId }) {
  const clauses = ["invoices.business_id = ?", "invoices.status <> 'cancelled'", "invoices.balance_due > 0"];
  const params = [businessId];
  if (customerId) { clauses.push("invoices.customer_id = ?"); params.push(customerId); }
  const rows = db
    .prepare(
      `SELECT invoices.invoice_number AS invoice_number, customers.name AS customer, invoices.due_date AS due_date, invoices.balance_due AS balance_due,
        CASE WHEN invoices.due_date IS NULL THEN NULL ELSE CAST(julianday('now') - julianday(invoices.due_date) AS INTEGER) END AS days_overdue
       FROM invoices LEFT JOIN customers ON customers.id = invoices.customer_id
       WHERE ${clauses.join(" AND ")}`
    )
    .all(...params);
  for (const r of rows) {
    r.bucket = bucketFor(r.days_overdue);
  }
  rows.sort((a, b) => (b.days_overdue ?? -1) - (a.days_overdue ?? -1));
  return {
    columns: [text("invoice_number", "Invoice #"), text("customer", "Customer"), date("due_date", "Due Date"), num("days_overdue", "Days Overdue"), text("bucket", "Bucket"), money("balance_due", "Balance Due")],
    rows,
  };
}

// --- Payments Received -----------------------------------------------------

function paymentsReceived(businessId, { from, to, customerId }) {
  const clauses = ["invoices.business_id = ?"];
  const params = [businessId];
  pushDatetimeRange("payments.paid_at", from, to, clauses, params);
  if (customerId) { clauses.push("invoices.customer_id = ?"); params.push(customerId); }
  const rows = db
    .prepare(
      `SELECT payments.paid_at AS date, invoices.invoice_number AS invoice_number, customers.name AS customer,
        payments.mode AS mode, payments.amount AS amount
       FROM payments JOIN invoices ON invoices.id = payments.invoice_id
       LEFT JOIN customers ON customers.id = invoices.customer_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY payments.paid_at DESC`
    )
    .all(...params);
  return {
    columns: [date("date", "Date"), text("invoice_number", "Invoice #"), text("customer", "Customer"), text("mode", "Mode"), money("amount", "Amount")],
    rows,
  };
}

function creditNoteDetails(businessId, { from, to, customerId }) {
  const clauses = ["credit_notes.business_id = ?"];
  const params = [businessId];
  pushDateRange("credit_notes.credit_note_date", from, to, clauses, params);
  if (customerId) { clauses.push("credit_notes.customer_id = ?"); params.push(customerId); }
  const rows = db
    .prepare(
      `SELECT credit_notes.credit_note_number AS credit_note_number, credit_notes.credit_note_date AS date,
        customers.name AS customer, credit_notes.reason AS reason, credit_notes.total AS total
       FROM credit_notes LEFT JOIN customers ON customers.id = credit_notes.customer_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY credit_notes.credit_note_date DESC, credit_notes.id DESC`
    )
    .all(...params);
  return {
    columns: [text("credit_note_number", "Credit Note #"), date("date", "Date"), text("customer", "Customer"), text("reason", "Reason"), money("total", "Total")],
    rows,
  };
}

// --- Purchases and Expenses ------------------------------------------------

function purchasesByVendor(businessId, { from, to, vendorId }) {
  const clauses = ["purchases.business_id = ?"];
  const params = [businessId];
  pushDateRange("purchases.purchase_date", from, to, clauses, params);
  if (vendorId) { clauses.push("purchases.vendor_id = ?"); params.push(vendorId); }
  const rows = db
    .prepare(
      `SELECT vendors.name AS vendor, COUNT(*) AS bills, SUM(purchases.amount) AS amount,
        SUM(purchases.tax_amount) AS tax, SUM(purchases.total) AS total
       FROM purchases JOIN vendors ON vendors.id = purchases.vendor_id
       WHERE ${clauses.join(" AND ")}
       GROUP BY purchases.vendor_id ORDER BY total DESC`
    )
    .all(...params);
  return {
    columns: [text("vendor", "Vendor"), num("bills", "Bills"), money("amount", "Amount"), money("tax", "Tax"), money("total", "Total")],
    rows,
  };
}

function billDetails(businessId, { from, to, vendorId }) {
  const clauses = ["purchases.business_id = ?"];
  const params = [businessId];
  pushDateRange("purchases.purchase_date", from, to, clauses, params);
  if (vendorId) { clauses.push("purchases.vendor_id = ?"); params.push(vendorId); }
  const rows = db
    .prepare(
      `SELECT purchases.purchase_date AS date, purchases.bill_number AS bill_number, vendors.name AS vendor,
        purchases.description AS description, purchases.amount AS amount, purchases.tax_amount AS tax, purchases.total AS total
       FROM purchases LEFT JOIN vendors ON vendors.id = purchases.vendor_id
       WHERE ${clauses.join(" AND ")}
       ORDER BY purchases.purchase_date DESC`
    )
    .all(...params);
  return {
    columns: [date("date", "Date"), text("bill_number", "Bill #"), text("vendor", "Vendor"), text("description", "Description"), money("amount", "Amount"), money("tax", "Tax"), money("total", "Total")],
    rows,
  };
}

// --- Catalog ---------------------------------------------------------------

export const REPORTS_CATALOG = [
  { key: "sales_by_customer", name: "Sales by Customer", category: "Sales", description: "Total billed per customer.", filters: ["from", "to", "customerId"], run: salesByCustomer },
  { key: "sales_by_item", name: "Sales by Item", category: "Sales", description: "Quantity and value sold per item/description.", filters: ["from", "to", "customerId"], run: salesByItem },
  { key: "sales_summary", name: "Sales Summary", category: "Sales", description: "Invoice totals grouped by status, with an overall total.", filters: ["from", "to", "customerId"], run: salesSummary },
  { key: "invoice_details", name: "Invoice Details", category: "Receivables", description: "Every invoice with its own totals and balance due.", filters: ["from", "to", "customerId", "status"], statusOptions: ["draft", "sent", "paid", "partially_paid", "overdue", "cancelled"], run: invoiceDetails },
  { key: "quote_details", name: "Quote Details", category: "Receivables", description: "Every quote with its status and total.", filters: ["from", "to", "customerId", "status"], statusOptions: ["draft", "sent", "accepted", "declined", "converted"], run: quoteDetails },
  { key: "customer_balance_summary", name: "Customer Balance Summary", category: "Receivables", description: "Per customer: total invoiced, received, and balance due.", filters: ["from", "to", "customerId"], run: customerBalanceSummary },
  { key: "receivable_summary", name: "Receivable Summary", category: "Receivables", description: "One overall total invoiced / received / outstanding figure.", filters: ["from", "to", "customerId"], run: receivableSummary },
  { key: "receivable_details", name: "Receivable Details", category: "Receivables", description: "Every invoice that still has a balance due, oldest due date first.", filters: ["from", "to", "customerId"], run: receivableDetails },
  { key: "ar_aging_summary", name: "AR Aging Summary", category: "Receivables", description: "Outstanding balance bucketed by how overdue it is, as of today.", filters: ["customerId"], run: arAgingSummary },
  { key: "ar_aging_details", name: "AR Aging Details", category: "Receivables", description: "Every unpaid invoice with its own aging bucket, as of today.", filters: ["customerId"], run: arAgingDetails },
  { key: "payments_received", name: "Payments Received", category: "Payments Received", description: "Every payment recorded against an invoice.", filters: ["from", "to", "customerId"], run: paymentsReceived },
  { key: "credit_note_details", name: "Credit Note Details", category: "Payments Received", description: "Every credit note issued.", filters: ["from", "to", "customerId"], run: creditNoteDetails },
  { key: "purchases_by_vendor", name: "Purchases by Vendor", category: "Purchases and Expenses", description: "Total purchased per vendor. Not a payable balance — this software doesn't yet track how much of a bill is paid.", filters: ["from", "to", "vendorId"], run: purchasesByVendor },
  { key: "bill_details", name: "Bill Details", category: "Purchases and Expenses", description: "Every purchase/bill logged against a vendor.", filters: ["from", "to", "vendorId"], run: billDetails },
];

export function getReportDef(key) {
  return REPORTS_CATALOG.find((r) => r.key === key);
}

export function runReport(key, businessId, filters) {
  const def = getReportDef(key);
  if (!def) return null;
  return def.run(businessId, filters);
}
