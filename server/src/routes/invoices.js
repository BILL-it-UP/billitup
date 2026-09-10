import express from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { renderDocumentPdf, sendDocumentEmail, SmtpNotConfiguredError } from "../lib/mailer.js";

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT invoices.*, customers.name AS customer_name,
        (invoices.balance_due > 0 AND invoices.due_date IS NOT NULL AND invoices.due_date < date('now')) AS is_overdue
       FROM invoices LEFT JOIN customers ON customers.id = invoices.customer_id
       WHERE invoices.business_id = ? ORDER BY invoices.created_at DESC`
    )
    .all(req.auth.businessId);
  res.json(rows);
});

// Full invoice with line items + customer + business, shaped for the print/PDF view
router.get("/:id", (req, res) => {
  const invoice = db
    .prepare("SELECT * FROM invoices WHERE id = ? AND business_id = ?")
    .get(req.params.id, req.auth.businessId);
  if (!invoice) return res.status(404).json({ error: "Not found" });

  const lineItems = db
    .prepare("SELECT * FROM invoice_line_items WHERE invoice_id = ?")
    .all(invoice.id);
  const customer = invoice.customer_id
    ? db.prepare("SELECT * FROM customers WHERE id = ?").get(invoice.customer_id)
    : null;
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  const payments = db.prepare("SELECT * FROM payments WHERE invoice_id = ?").all(invoice.id);
  const isOverdue = !!(invoice.balance_due > 0 && invoice.due_date && invoice.due_date < new Date().toISOString().slice(0, 10));

  res.json({ ...invoice, is_overdue: isOverdue, lineItems, customer, business, payments });
});

// Create an invoice with its line items in one call. Server computes all totals —
// the client sends qty/rate/discount/tax_rate per line, never trusts client-side amounts.
router.post("/", (req, res) => {
  const { customer_id, invoice_date, due_date, terms, reference, notes, lineItems } = req.body;
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return res.status(400).json({ error: "At least one line item is required" });
  }

  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  const invoiceNumber = `${business.invoice_prefix || "INV-"}${String(business.next_invoice_number).padStart(6, "0")}`;

  let subTotal = 0;
  let taxTotal = 0;
  let discountTotal = 0;
  const computedLines = lineItems.map((line) => {
    const qty = Number(line.qty) || 0;
    const rate = Number(line.rate) || 0;
    const discount = Number(line.discount) || 0;
    const taxRate = Number(line.tax_rate) || 0;
    const lineBase = qty * rate - discount;
    const lineTax = lineBase * (taxRate / 100);
    const amount = lineBase + lineTax;
    subTotal += qty * rate;
    discountTotal += discount;
    taxTotal += lineTax;
    return { ...line, qty, rate, discount, tax_rate: taxRate, amount };
  });
  const total = subTotal - discountTotal + taxTotal;

  const insertInvoice = db.prepare(
    `INSERT INTO invoices
      (business_id, customer_id, invoice_number, invoice_date, due_date, terms, reference, status,
       sub_total, discount, tax_total, total, balance_due, notes, public_token)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertLine = db.prepare(
    `INSERT INTO invoice_line_items (invoice_id, item_id, description, qty, rate, discount, tax_rate, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const bumpInvoiceNumber = db.prepare(
    "UPDATE businesses SET next_invoice_number = next_invoice_number + 1 WHERE id = ?"
  );

  const invoiceId = db.transaction(() => {
    const result = insertInvoice.run(
      req.auth.businessId, customer_id || null, invoiceNumber,
      invoice_date || new Date().toISOString().slice(0, 10), due_date || null,
      terms || null, reference || null,
      subTotal, discountTotal, taxTotal, total, total, notes || null,
      randomUUID().replace(/-/g, "")
    );
    const id = result.lastInsertRowid;
    for (const line of computedLines) {
      insertLine.run(id, line.item_id || null, line.description, line.qty, line.rate, line.discount, line.tax_rate, line.amount);
    }
    bumpInvoiceNumber.run(req.auth.businessId);
    return id;
  })();

  const created = db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId);
  res.status(201).json(created);
});

router.post("/:id/payments", (req, res) => {
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!invoice) return res.status(404).json({ error: "Not found" });

  const { amount, mode, notes } = req.body;
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: "amount must be a positive number" });

  db.transaction(() => {
    db.prepare("INSERT INTO payments (invoice_id, amount, mode, notes) VALUES (?, ?, ?, ?)")
      .run(invoice.id, amt, mode || "cash", notes || null);
    const newBalance = Math.max(0, invoice.balance_due - amt);
    const newStatus = newBalance === 0 ? "paid" : "partially_paid";
    db.prepare("UPDATE invoices SET balance_due = ?, status = ? WHERE id = ?")
      .run(newBalance, newStatus, invoice.id);
  })();

  const updated = db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoice.id);
  res.status(201).json(updated);
});

router.put("/:id/status", (req, res) => {
  const { status } = req.body;
  if (!["draft", "sent", "paid", "partially_paid", "overdue"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  db.prepare("UPDATE invoices SET status = ? WHERE id = ? AND business_id = ?").run(status, req.params.id, req.auth.businessId);
  const updated = db.prepare("SELECT * FROM invoices WHERE id = ?").get(req.params.id);
  res.json(updated);
});

// Email the invoice to the customer (or an override address) as a PDF attachment.
router.post("/:id/send", async (req, res) => {
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!invoice) return res.status(404).json({ error: "Not found" });

  const lineItems = db.prepare("SELECT * FROM invoice_line_items WHERE invoice_id = ?").all(invoice.id);
  const customer = invoice.customer_id ? db.prepare("SELECT * FROM customers WHERE id = ?").get(invoice.customer_id) : null;
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);

  const to = (req.body && req.body.to) || customer?.email;
  if (!to) return res.status(400).json({ error: "No recipient email — add one to the customer or enter one to send to" });
  const isReminder = !!(req.body && req.body.reminder);

  try {
    const pdfBuffer = await renderDocumentPdf({
      docLabel: "Invoice", docNumber: invoice.invoice_number, docDate: invoice.invoice_date,
      headlineLabel: "Balance Due", headlineValue: `Rs ${Number(invoice.balance_due).toFixed(2)}`,
      business, party: customer, partyLabel: "Bill To", lineItems, totals: invoice, notes: invoice.notes,
    });
    await sendDocumentEmail({
      business, to,
      subject: isReminder
        ? `Payment Reminder: Invoice ${invoice.invoice_number} from ${business.name}`
        : `Invoice ${invoice.invoice_number} from ${business.name}`,
      text: isReminder
        ? `Hi,\n\nThis is a reminder that invoice ${invoice.invoice_number}${invoice.due_date ? ` (due ${invoice.due_date})` : ""} for Rs ${Number(invoice.total).toFixed(2)} has a balance of Rs ${Number(invoice.balance_due).toFixed(2)} still outstanding. The invoice is attached again for reference.\n\nThanks,\n${business.name}`
        : `Hi,\n\nPlease find attached invoice ${invoice.invoice_number} for Rs ${Number(invoice.total).toFixed(2)}.\n\nThanks,\n${business.name}`,
      pdfBuffer, pdfFilename: `${invoice.invoice_number}.pdf`,
    });
    if (invoice.status === "draft") {
      db.prepare("UPDATE invoices SET status = 'sent' WHERE id = ?").run(invoice.id);
    }
    res.json({ ok: true, sentTo: to });
  } catch (err) {
    if (err instanceof SmtpNotConfiguredError) return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Failed to send email — check your SMTP settings" });
  }
});

export default router;
