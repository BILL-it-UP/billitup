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

  res.json({ ...totals, topCustomers, topItems, statusBreakdown });
});

export default router;
