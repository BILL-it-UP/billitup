import express from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { renderDocumentPdf, sendDocumentEmail, SmtpNotConfiguredError } from "../lib/mailer.js";

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT quotes.*, customers.name AS customer_name
       FROM quotes LEFT JOIN customers ON customers.id = quotes.customer_id
       WHERE quotes.business_id = ? ORDER BY quotes.created_at DESC`
    )
    .all(req.auth.businessId);
  res.json(rows);
});

router.get("/:id", (req, res) => {
  const quote = db.prepare("SELECT * FROM quotes WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!quote) return res.status(404).json({ error: "Not found" });

  const lineItems = db.prepare("SELECT * FROM quote_line_items WHERE quote_id = ?").all(quote.id);
  const customer = quote.customer_id ? db.prepare("SELECT * FROM customers WHERE id = ?").get(quote.customer_id) : null;
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);

  res.json({ ...quote, lineItems, customer, business });
});

router.post("/", (req, res) => {
  const { customer_id, quote_date, expiry_date, reference, notes, lineItems } = req.body;
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return res.status(400).json({ error: "At least one line item is required" });
  }

  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  const quoteNumber = `${business.quote_prefix || "QUO-"}${String(business.next_quote_number).padStart(6, "0")}`;

  let subTotal = 0, taxTotal = 0, discountTotal = 0;
  const computedLines = lineItems.map((line) => {
    const qty = Number(line.qty) || 0;
    const rate = Number(line.rate) || 0;
    const discount = Number(line.discount) || 0;
    const taxRate = Number(line.tax_rate) || 0;
    const lineBase = qty * rate - discount;
    const lineTax = lineBase * (taxRate / 100);
    subTotal += qty * rate;
    discountTotal += discount;
    taxTotal += lineTax;
    return { ...line, qty, rate, discount, tax_rate: taxRate, amount: lineBase + lineTax };
  });
  const total = subTotal - discountTotal + taxTotal;

  const insertQuote = db.prepare(
    `INSERT INTO quotes
      (business_id, customer_id, quote_number, quote_date, expiry_date, reference, status,
       sub_total, discount, tax_total, total, notes)
     VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?)`
  );
  const insertLine = db.prepare(
    `INSERT INTO quote_line_items (quote_id, item_id, description, qty, rate, discount, tax_rate, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const bumpQuoteNumber = db.prepare("UPDATE businesses SET next_quote_number = next_quote_number + 1 WHERE id = ?");

  const quoteId = db.transaction(() => {
    const result = insertQuote.run(
      req.auth.businessId, customer_id || null, quoteNumber,
      quote_date || new Date().toISOString().slice(0, 10), expiry_date || null,
      reference || null, subTotal, discountTotal, taxTotal, total, notes || null
    );
    const id = result.lastInsertRowid;
    for (const line of computedLines) {
      insertLine.run(id, line.item_id || null, line.description, line.qty, line.rate, line.discount, line.tax_rate, line.amount);
    }
    bumpQuoteNumber.run(req.auth.businessId);
    return id;
  })();

  res.status(201).json(db.prepare("SELECT * FROM quotes WHERE id = ?").get(quoteId));
});

router.put("/:id/status", (req, res) => {
  const { status } = req.body;
  if (!["draft", "sent", "accepted", "declined"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  db.prepare("UPDATE quotes SET status = ? WHERE id = ? AND business_id = ?").run(status, req.params.id, req.auth.businessId);
  res.json(db.prepare("SELECT * FROM quotes WHERE id = ?").get(req.params.id));
});

// Convert an accepted quote into a real invoice — copies line items across,
// re-numbers using the invoice sequence, and marks the quote as converted
// so it can't be converted twice.
router.post("/:id/convert", (req, res) => {
  const quote = db.prepare("SELECT * FROM quotes WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!quote) return res.status(404).json({ error: "Not found" });
  if (quote.converted_invoice_id) return res.status(400).json({ error: "This quote was already converted to an invoice" });

  const lineItems = db.prepare("SELECT * FROM quote_line_items WHERE quote_id = ?").all(quote.id);
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  const invoiceNumber = `${business.invoice_prefix || "INV-"}${String(business.next_invoice_number).padStart(6, "0")}`;

  const insertInvoice = db.prepare(
    `INSERT INTO invoices
      (business_id, customer_id, invoice_number, invoice_date, reference, status,
       sub_total, discount, tax_total, total, balance_due, notes)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`
  );
  const insertLine = db.prepare(
    `INSERT INTO invoice_line_items (invoice_id, item_id, description, qty, rate, discount, tax_rate, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const bumpInvoiceNumber = db.prepare("UPDATE businesses SET next_invoice_number = next_invoice_number + 1 WHERE id = ?");
  const markConverted = db.prepare("UPDATE quotes SET status = 'converted', converted_invoice_id = ? WHERE id = ?");

  const invoiceId = db.transaction(() => {
    const result = insertInvoice.run(
      req.auth.businessId, quote.customer_id, invoiceNumber,
      new Date().toISOString().slice(0, 10), `Converted from ${quote.quote_number}`,
      quote.sub_total, quote.discount, quote.tax_total, quote.total, quote.total, quote.notes
    );
    const id = result.lastInsertRowid;
    for (const line of lineItems) {
      insertLine.run(id, line.item_id, line.description, line.qty, line.rate, line.discount, line.tax_rate, line.amount);
    }
    bumpInvoiceNumber.run(req.auth.businessId);
    markConverted.run(id, quote.id);
    return id;
  })();

  res.status(201).json(db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId));
});

// Email the quote to the customer (or an override address) as a PDF attachment.
router.post("/:id/send", async (req, res) => {
  const quote = db.prepare("SELECT * FROM quotes WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!quote) return res.status(404).json({ error: "Not found" });

  const lineItems = db.prepare("SELECT * FROM quote_line_items WHERE quote_id = ?").all(quote.id);
  const customer = quote.customer_id ? db.prepare("SELECT * FROM customers WHERE id = ?").get(quote.customer_id) : null;
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);

  const to = (req.body && req.body.to) || customer?.email;
  if (!to) return res.status(400).json({ error: "No recipient email — add one to the customer or enter one to send to" });

  try {
    const pdfBuffer = await renderDocumentPdf({
      docLabel: "Quote", docNumber: quote.quote_number, docDate: quote.quote_date,
      extraMeta: quote.expiry_date ? [`Valid Until: ${quote.expiry_date}`] : [],
      business, party: customer, partyLabel: "To", lineItems, totals: quote, notes: quote.notes,
    });
    await sendDocumentEmail({
      business, to,
      subject: `Quote ${quote.quote_number} from ${business.name}`,
      text: `Hi,\n\nPlease find attached quote ${quote.quote_number} for Rs ${Number(quote.total).toFixed(2)}.\n\nThanks,\n${business.name}`,
      pdfBuffer, pdfFilename: `${quote.quote_number}.pdf`,
    });
    if (quote.status === "draft") {
      db.prepare("UPDATE quotes SET status = 'sent' WHERE id = ?").run(quote.id);
    }
    res.json({ ok: true, sentTo: to });
  } catch (err) {
    if (err instanceof SmtpNotConfiguredError) return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Failed to send email — check your SMTP settings" });
  }
});

export default router;
