import express from "express";
import { db } from "../db.js";
import { renderDocumentPdf } from "../lib/mailer.js";
import { formatDate } from "../lib/formatDate.js";
import { upiQrForInvoice, upiQrPngBufferForInvoice } from "../lib/upiQr.js";
import { computeProjectProgress } from "../lib/projectProgress.js";
import { printPrefix } from "../lib/currency.js";

// Unauthenticated routes for the "Copy shareable link" feature on an
// invoice — a customer with the link can view (and download a PDF of)
// exactly that one invoice, with no login. Looked up by a long random
// public_token rather than the numeric id, so a link can't be guessed by
// walking ids, and nothing else about the business (other invoices,
// customers, settings) is reachable through it.
const router = express.Router();

// Only the fields a shared invoice should actually show — same as what's
// already printed on the emailed PDF, minus anything private to the
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

function loadInvoiceByToken(token) {
  const invoice = db.prepare("SELECT * FROM invoices WHERE public_token = ? AND deleted_at IS NULL").get(token);
  if (!invoice) return null;
  const lineItems = db.prepare("SELECT * FROM invoice_line_items WHERE invoice_id = ?").all(invoice.id);
  const customer = invoice.customer_id ? db.prepare("SELECT * FROM customers WHERE id = ?").get(invoice.customer_id) : null;
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(invoice.business_id);
  return { invoice, lineItems, customer, business };
}

// The customer portal used to live here as a no-login link. It's now a real
// login (email + password, turned on/off per customer) — see
// routes/portalAuth.js (set password / log in) and routes/portal.js (the
// logged-in view), both behind requireCustomerAuth so access can actually
// be revoked, which a plain link could never do.

// A client actually loading this page is what "viewed by client" means (see
// db.js) — stamped here rather than only on the /pdf route, since most
// clients open the link and read it on-screen without ever downloading a
// PDF. first_viewed_at is set once; last_viewed_at updates every time.
function markViewed(invoiceId) {
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE invoices SET first_viewed_at = COALESCE(first_viewed_at, ?), last_viewed_at = ? WHERE id = ?"
  ).run(now, now, invoiceId);
}

router.get("/invoices/:token", async (req, res) => {
  const found = loadInvoiceByToken(req.params.token);
  if (!found) return res.status(404).json({ error: "Not found" });
  const { invoice, lineItems, customer, business } = found;
  markViewed(invoice.id);
  const upiQr = await upiQrForInvoice(business, invoice);
  const projectProgress = computeProjectProgress(invoice);
  res.json({ ...invoice, ...projectProgress, lineItems, customer, business: publicBusinessFields(business), upi_qr_data_url: upiQr?.dataUrl || null });
});

router.get("/invoices/:token/pdf", async (req, res) => {
  const found = loadInvoiceByToken(req.params.token);
  if (!found) return res.status(404).json({ error: "Not found" });
  const { invoice, lineItems, customer, business } = found;
  markViewed(invoice.id);
  try {
    const upiQrPngBuffer = await upiQrPngBufferForInvoice(business, invoice);
    const projectProgress = computeProjectProgress(invoice);
    const pdfBuffer = await renderDocumentPdf({
      docLabel: "Invoice", docNumber: invoice.invoice_number, docDate: formatDate(invoice.invoice_date, business.date_format),
      headlineLabel: "Balance Due", headlineValue: `${printPrefix(invoice.currency)} ${Number(invoice.balance_due).toFixed(2)}`,
      business: publicBusinessFields(business), party: customer, partyLabel: "Bill To",
      lineItems, totals: { ...invoice, ...projectProgress }, notes: invoice.notes, upiQrPngBuffer,
      termsAndConditions: invoice.terms_and_conditions,
    });
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `inline; filename="${invoice.invoice_number}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

export default router;
