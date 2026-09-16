import express from "express";
import { db } from "../db.js";
import { requireCustomerAuth } from "../middleware/auth.js";
import { upiQrForInvoice } from "../lib/upiQr.js";

// The logged-in customer portal — everything here runs behind
// requireCustomerAuth, which re-checks on every request that this
// customer's portal access is still turned on (see middleware/auth.js).
// Deliberately its own tiny router (not routes/customers.js) since it's a
// different identity entirely: a client, not a business user.
const router = express.Router();
router.use(requireCustomerAuth);

// Same "public safe" business fields as the no-login invoice share link —
// everything printed on a shared invoice, minus anything private to the
// business's own login (SMTP credentials above all).
function publicBusinessFields(business) {
  const {
    name, address, phone, email, website, gstin, logo_data_url,
    bank_account_name, bank_name, bank_account_number, bank_ifsc, bank_upi_id,
    terms_and_conditions, signature_data_url, signature_name, date_format,
  } = business;
  return {
    name, address, phone, email, website, gstin, logo_data_url,
    bank_account_name, bank_name, bank_account_number, bank_ifsc, bank_upi_id,
    terms_and_conditions, signature_data_url, signature_name, date_format,
  };
}

router.get("/me", async (req, res) => {
  const customer = req.customer;
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(customer.business_id);
  const invoices = db
    .prepare(
      `SELECT id, invoice_number, invoice_date, due_date, status, total, balance_due, public_token
       FROM invoices WHERE business_id = ? AND customer_id = ? AND status <> 'cancelled'
       ORDER BY invoice_date DESC, id DESC`
    )
    .all(customer.business_id, customer.id);

  // A QR per unpaid invoice, generated only for the ones that actually still
  // have something owing — a paid-off invoice never needs one, and this
  // keeps the /me response from generating a QR for every invoice a
  // long-standing client has ever received (2026-09-15).
  const invoicesWithQr = await Promise.all(
    invoices.map(async (inv) => ({
      ...inv,
      upi_qr_data_url: (await upiQrForInvoice(business, inv))?.dataUrl || null,
    }))
  );

  res.json({
    // The portal's own Profile tab (2026-09-15) — a client's saved details,
    // so they can see what's on file without having to ask the business.
    customer: {
      name: customer.name, email: customer.email, phone: customer.phone,
      billing_address: customer.billing_address, gstin: customer.gstin,
      state: customer.state, pincode: customer.pincode, country: customer.country,
    },
    business: publicBusinessFields(business),
    invoices: invoicesWithQr,
  });
});

// Every payment recorded against any of this customer's own invoices,
// newest first — the portal's Payment History tab (2026-09-15). Joined with
// the invoice number/token so each row can still link back to that invoice.
router.get("/payments", (req, res) => {
  const customer = req.customer;
  const rows = db
    .prepare(
      `SELECT payments.id, payments.amount, payments.mode, payments.notes, payments.paid_at,
              invoices.invoice_number, invoices.public_token
       FROM payments
       JOIN invoices ON invoices.id = payments.invoice_id
       WHERE invoices.business_id = ? AND invoices.customer_id = ?
       ORDER BY payments.paid_at DESC, payments.id DESC`
    )
    .all(customer.business_id, customer.id);
  res.json(rows);
});

// The customer side of an invoice's comment thread — see routes/invoices.js
// for the matching business-side read/post. Scoped to invoices that
// actually belong to this logged-in customer, same as every other portal
// route (2026-09-16).
router.get("/invoices/:invoiceId/comments", (req, res) => {
  const customer = req.customer;
  const invoice = db.prepare("SELECT id FROM invoices WHERE id = ? AND customer_id = ? AND business_id = ?")
    .get(req.params.invoiceId, customer.id, customer.business_id);
  if (!invoice) return res.status(404).json({ error: "Not found" });
  const rows = db.prepare("SELECT * FROM invoice_comments WHERE invoice_id = ? ORDER BY created_at ASC").all(invoice.id);
  res.json(rows);
});

router.post("/invoices/:invoiceId/comments", (req, res) => {
  const customer = req.customer;
  const invoice = db.prepare("SELECT id FROM invoices WHERE id = ? AND customer_id = ? AND business_id = ?")
    .get(req.params.invoiceId, customer.id, customer.business_id);
  if (!invoice) return res.status(404).json({ error: "Not found" });
  const message = (req.body?.message || "").trim();
  if (!message) return res.status(400).json({ error: "message is required" });
  const result = db.prepare(
    "INSERT INTO invoice_comments (invoice_id, business_id, author_type, author_name, message) VALUES (?, ?, 'customer', ?, ?)"
  ).run(invoice.id, customer.business_id, customer.name || "Customer", message);
  res.status(201).json(db.prepare("SELECT * FROM invoice_comments WHERE id = ?").get(result.lastInsertRowid));
});

export default router;
