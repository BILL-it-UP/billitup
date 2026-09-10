import express from "express";
import { db } from "../db.js";
import { renderDocumentPdf } from "../lib/mailer.js";

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
    terms_and_conditions, signature_data_url, signature_name,
  } = business;
  return {
    name, address, phone, email, website, gstin, logo_data_url,
    bank_account_name, bank_name, bank_account_number, bank_ifsc, bank_upi_id,
    terms_and_conditions, signature_data_url, signature_name,
  };
}

function loadInvoiceByToken(token) {
  const invoice = db.prepare("SELECT * FROM invoices WHERE public_token = ?").get(token);
  if (!invoice) return null;
  const lineItems = db.prepare("SELECT * FROM invoice_line_items WHERE invoice_id = ?").all(invoice.id);
  const customer = invoice.customer_id ? db.prepare("SELECT * FROM customers WHERE id = ?").get(invoice.customer_id) : null;
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(invoice.business_id);
  return { invoice, lineItems, customer, business };
}

router.get("/invoices/:token", (req, res) => {
  const found = loadInvoiceByToken(req.params.token);
  if (!found) return res.status(404).json({ error: "Not found" });
  const { invoice, lineItems, customer, business } = found;
  res.json({ ...invoice, lineItems, customer, business: publicBusinessFields(business) });
});

router.get("/invoices/:token/pdf", async (req, res) => {
  const found = loadInvoiceByToken(req.params.token);
  if (!found) return res.status(404).json({ error: "Not found" });
  const { invoice, lineItems, customer, business } = found;
  try {
    const pdfBuffer = await renderDocumentPdf({
      docLabel: "Invoice", docNumber: invoice.invoice_number, docDate: invoice.invoice_date,
      headlineLabel: "Balance Due", headlineValue: `Rs ${Number(invoice.balance_due).toFixed(2)}`,
      business: publicBusinessFields(business), party: customer, partyLabel: "Bill To",
      lineItems, totals: invoice, notes: invoice.notes,
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
