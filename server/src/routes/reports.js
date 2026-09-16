import express from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { buildGstr1Report } from "../lib/gstr1.js";
import { buildGstr3bSummary } from "../lib/gstr3b.js";

const router = express.Router();
router.use(requireAuth);

router.get("/summary", (req, res) => {
  const businessId = req.auth.businessId;

  const totals = db
    .prepare(
      `SELECT
        COUNT(*) AS invoice_count,
        COALESCE(SUM(total), 0) AS total_invoiced,
        COALESCE(SUM(total - balance_due), 0) AS total_received,
        COALESCE(SUM(balance_due), 0) AS total_outstanding
       FROM invoices WHERE business_id = ? AND status <> 'cancelled'`
    )
    .get(businessId);

  const topCustomers = db
    .prepare(
      `SELECT customers.name, SUM(invoices.total) AS total
       FROM invoices JOIN customers ON customers.id = invoices.customer_id
       WHERE invoices.business_id = ? AND invoices.status <> 'cancelled'
       GROUP BY invoices.customer_id ORDER BY total DESC LIMIT 5`
    )
    .all(businessId);

  const topItems = db
    .prepare(
      `SELECT invoice_line_items.description, SUM(invoice_line_items.qty) AS qty, SUM(invoice_line_items.amount) AS total
       FROM invoice_line_items JOIN invoices ON invoices.id = invoice_line_items.invoice_id
       WHERE invoices.business_id = ? AND invoices.status <> 'cancelled'
       GROUP BY invoice_line_items.description ORDER BY total DESC LIMIT 5`
    )
    .all(businessId);

  // Full (uncapped) versions of the two lists above, for the Reports Center
  // section further down the page rather than the top-of-page highlight tiles.
  const salesByCustomer = db
    .prepare(
      `SELECT customers.name, SUM(invoices.total) AS total, COUNT(*) AS invoice_count
       FROM invoices JOIN customers ON customers.id = invoices.customer_id
       WHERE invoices.business_id = ? AND invoices.status <> 'cancelled'
       GROUP BY invoices.customer_id ORDER BY total DESC LIMIT 200`
    )
    .all(businessId);

  const salesByItem = db
    .prepare(
      `SELECT invoice_line_items.description, SUM(invoice_line_items.qty) AS qty, SUM(invoice_line_items.amount) AS total
       FROM invoice_line_items JOIN invoices ON invoices.id = invoice_line_items.invoice_id
       WHERE invoices.business_id = ? AND invoices.status <> 'cancelled'
       GROUP BY invoice_line_items.description ORDER BY total DESC LIMIT 200`
    )
    .all(businessId);

  // Per-customer running balance — who owes what, in one place, rather than
  // paging through every invoice to add it up by hand.
  const customerBalances = db
    .prepare(
      `SELECT customers.id, customers.name,
        COALESCE(SUM(invoices.total), 0) AS total_invoiced,
        COALESCE(SUM(invoices.total - invoices.balance_due), 0) AS total_received,
        COALESCE(SUM(invoices.balance_due), 0) AS balance_due
       FROM customers LEFT JOIN invoices
         ON invoices.customer_id = customers.id AND invoices.business_id = customers.business_id AND invoices.status <> 'cancelled'
       WHERE customers.business_id = ?
       GROUP BY customers.id
       HAVING total_invoiced > 0
       ORDER BY balance_due DESC, total_invoiced DESC`
    )
    .all(businessId);

  // Every payment recorded against an invoice for this business, most recent first.
  const paymentsReceived = db
    .prepare(
      `SELECT payments.id, payments.amount, payments.mode, payments.paid_at,
        invoices.id AS invoice_id, invoices.invoice_number, customers.name AS customer_name
       FROM payments
       JOIN invoices ON invoices.id = payments.invoice_id
       LEFT JOIN customers ON customers.id = invoices.customer_id
       WHERE invoices.business_id = ?
       ORDER BY payments.paid_at DESC LIMIT 200`
    )
    .all(businessId);

  // Cash flow — total payments received per month, always the 6 most recent
  // CALENDAR months (this one plus the five before it), not just whichever
  // months happen to have a payment in them. A business with only one or
  // two months of history used to get a chart with only one or two bars in
  // it, floating in an otherwise-empty box — filling in the quiet months at
  // ₹0 makes it read as a normal 6-month chart instead of looking broken or
  // sparse (2026-09-16).
  const cashFlowRows = db
    .prepare(
      `SELECT strftime('%Y-%m', payments.paid_at) AS month, SUM(payments.amount) AS total
       FROM payments JOIN invoices ON invoices.id = payments.invoice_id
       WHERE invoices.business_id = ?
       GROUP BY month`
    )
    .all(businessId);
  const cashFlowByMonth = Object.fromEntries(cashFlowRows.map((r) => [r.month, r.total]));
  const cashFlow = [];
  const cashFlowNow = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(cashFlowNow.getFullYear(), cashFlowNow.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    cashFlow.push({ month: key, total: cashFlowByMonth[key] || 0 });
  }

  // AR aging — every unpaid invoice bucketed by how many days past its due
  // date it is. An invoice with no due date set, or not yet due, counts as
  // "Current" — there's no separate accounting-style "not yet due" bucket
  // since BillItUp doesn't do double-entry accounting, just aged receivables.
  const unpaidWithDueDate = db
    .prepare(
      `SELECT balance_due, CAST(julianday('now') - julianday(due_date) AS INTEGER) AS days_overdue
       FROM invoices WHERE business_id = ? AND status <> 'cancelled' AND balance_due > 0 AND due_date IS NOT NULL`
    )
    .all(businessId);
  const unpaidNoDueDate = db
    .prepare(`SELECT COALESCE(SUM(balance_due), 0) AS total FROM invoices WHERE business_id = ? AND status <> 'cancelled' AND balance_due > 0 AND due_date IS NULL`)
    .get(businessId).total;
  const arAging = { current: unpaidNoDueDate, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0 };
  for (const row of unpaidWithDueDate) {
    if (row.days_overdue <= 0) arAging.current += row.balance_due;
    else if (row.days_overdue <= 30) arAging.days1to30 += row.balance_due;
    else if (row.days_overdue <= 60) arAging.days31to60 += row.balance_due;
    else if (row.days_overdue <= 90) arAging.days61to90 += row.balance_due;
    else arAging.days90plus += row.balance_due;
  }

  const statusBreakdown = db
    .prepare(
      `SELECT status, COUNT(*) AS count FROM invoices WHERE business_id = ? GROUP BY status`
    )
    .all(businessId);

  const totalCredited = db
    .prepare(`SELECT COALESCE(SUM(total), 0) AS total FROM credit_notes WHERE business_id = ?`)
    .get(businessId).total;

  // "Average No. of Days for Getting Paid" — same metric Zoho shows on its
  // Invoices page. For every fully paid invoice, the gap between its
  // invoice date and its last payment date (the payment that actually
  // brought it to paid, whether that was one payment or several); averaged
  // across every paid invoice this business has (2026-09-16).
  const avgDaysToPayRow = db
    .prepare(
      `SELECT AVG(days_to_pay) AS avg_days FROM (
         SELECT julianday(MAX(payments.paid_at)) - julianday(invoices.invoice_date) AS days_to_pay
         FROM invoices JOIN payments ON payments.invoice_id = invoices.id
         WHERE invoices.business_id = ? AND invoices.status = 'paid'
         GROUP BY invoices.id
       )`
    )
    .get(businessId);
  const avgDaysToPay = avgDaysToPayRow?.avg_days != null ? Math.round(avgDaysToPayRow.avg_days) : null;

  // An invoice is overdue once its due date has passed and it's not fully
  // paid — computed live off due_date rather than a stored status, so it's
  // always accurate without a background job to keep it in sync.
  const overdueInvoices = db
    .prepare(
      `SELECT invoices.id, invoices.invoice_number, invoices.due_date, invoices.balance_due, customers.name AS customer_name
       FROM invoices LEFT JOIN customers ON customers.id = invoices.customer_id
       WHERE invoices.business_id = ? AND invoices.status <> 'cancelled' AND invoices.balance_due > 0
         AND invoices.due_date IS NOT NULL AND invoices.due_date < date('now')
       ORDER BY invoices.due_date ASC`
    )
    .all(businessId);
  const overdueAmount = overdueInvoices.reduce((sum, inv) => sum + inv.balance_due, 0);

  // Mirrors the "Total Receivables" split (Current vs Overdue) shown on a
  // typical accounting dashboard — both numbers come out of total_outstanding.
  const receivables = { current: totals.total_outstanding - overdueAmount, overdue: overdueAmount };

  res.json({
    ...totals, topCustomers, topItems, statusBreakdown, totalCredited, overdueInvoices, overdueAmount,
    receivables, cashFlow, arAging, salesByCustomer, salesByItem, customerBalances, paymentsReceived, avgDaysToPay,
  });
});

// A GSTR-1-style breakdown of one month's outward invoices, for Naveen to
// hand to his tax advisor or copy into the GST portal — see lib/gstr1.js for
// exactly what this does and doesn't cover. month is "YYYY-MM".
router.get("/gstr1", (req, res) => {
  const month = req.query.month;
  if (!/^\d{4}-\d{2}$/.test(month || "")) {
    return res.status(400).json({ error: "month is required, as YYYY-MM" });
  }
  res.json(buildGstr1Report(req.auth.businessId, month));
});

// A GSTR-3B-style summary for one month — outward tax collected (excluding
// reverse-charge, which the recipient pays) plus a candidate input tax
// credit figure from the Purchases log. See lib/gstr3b.js for exactly what
// this does and doesn't cover.
router.get("/gstr3b", (req, res) => {
  const month = req.query.month;
  if (!/^\d{4}-\d{2}$/.test(month || "")) {
    return res.status(400).json({ error: "month is required, as YYYY-MM" });
  }
  res.json(buildGstr3bSummary(req.auth.businessId, month));
});

export default router;
