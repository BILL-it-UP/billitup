import express from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);
// A consolidated feed of every payment across every customer is business-wide
// financial oversight, same sensitivity tier as Reports — owner/admin only.
// Recording a payment against one specific invoice (POST /api/invoices/:id/payments)
// is unaffected and stays open to whichever role can already open that invoice.
router.use(requireRole("owner", "admin"));

// Every payment ever recorded against an invoice for this business, most
// recent first — the "Payments Timeline" Naveen asked for after comparing
// against Swipe. Deliberately no server-side filtering: the app's other list
// pages (Customers, Items, Quotes...) all filter client-side over the full
// list, and a self-hosted single business's payment history is small enough
// that this stays fast without adding query-param plumbing.
router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT payments.id, payments.amount, payments.mode, payments.paid_at, payments.notes,
        invoices.id AS invoice_id, invoices.invoice_number, invoices.gst_treatment,
        customers.name AS customer_name
       FROM payments
       JOIN invoices ON invoices.id = payments.invoice_id
       LEFT JOIN customers ON customers.id = invoices.customer_id
       WHERE invoices.business_id = ?
       ORDER BY payments.paid_at DESC, payments.id DESC
       LIMIT 5000`
    )
    .all(req.auth.businessId);
  res.json(rows);
});

export default router;
