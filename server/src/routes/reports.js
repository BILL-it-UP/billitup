import express from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

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
       FROM invoices WHERE business_id = ?`
    )
    .get(businessId);

  const topCustomers = db
    .prepare(
      `SELECT customers.name, SUM(invoices.total) AS total
       FROM invoices JOIN customers ON customers.id = invoices.customer_id
       WHERE invoices.business_id = ?
       GROUP BY invoices.customer_id ORDER BY total DESC LIMIT 5`
    )
    .all(businessId);

  const topItems = db
    .prepare(
      `SELECT invoice_line_items.description, SUM(invoice_line_items.qty) AS qty, SUM(invoice_line_items.amount) AS total
       FROM invoice_line_items JOIN invoices ON invoices.id = invoice_line_items.invoice_id
       WHERE invoices.business_id = ?
       GROUP BY invoice_line_items.description ORDER BY total DESC LIMIT 5`
    )
    .all(businessId);

  const statusBreakdown = db
    .prepare(
      `SELECT status, COUNT(*) AS count FROM invoices WHERE business_id = ? GROUP BY status`
    )
    .all(businessId);

  const totalCredited = db
    .prepare(`SELECT COALESCE(SUM(total), 0) AS total FROM credit_notes WHERE business_id = ?`)
    .get(businessId).total;

  // An invoice is overdue once its due date has passed and it's not fully
  // paid — computed live off due_date rather than a stored status, so it's
  // always accurate without a background job to keep it in sync.
  const overdueInvoices = db
    .prepare(
      `SELECT invoices.id, invoices.invoice_number, invoices.due_date, invoices.balance_due, customers.name AS customer_name
       FROM invoices LEFT JOIN customers ON customers.id = invoices.customer_id
       WHERE invoices.business_id = ? AND invoices.balance_due > 0
         AND invoices.due_date IS NOT NULL AND invoices.due_date < date('now')
       ORDER BY invoices.due_date ASC`
    )
    .all(businessId);
  const overdueAmount = overdueInvoices.reduce((sum, inv) => sum + inv.balance_due, 0);

  res.json({ ...totals, topCustomers, topItems, statusBreakdown, totalCredited, overdueInvoices, overdueAmount });
});

export default router;
