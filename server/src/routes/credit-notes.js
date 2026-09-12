import express from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { renderDocumentPdf, sendDocumentEmail, SmtpNotConfiguredError } from "../lib/mailer.js";
import { formatDate } from "../lib/formatDate.js";

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT credit_notes.*, customers.name AS customer_name, invoices.invoice_number
       FROM credit_notes
       LEFT JOIN customers ON customers.id = credit_notes.customer_id
       LEFT JOIN invoices ON invoices.id = credit_notes.invoice_id
       WHERE credit_notes.business_id = ? ORDER BY credit_notes.created_at DESC`
    )
    .all(req.auth.businessId);
  res.json(rows);
});

router.get("/:id", (req, res) => {
  const creditNote = db.prepare("SELECT * FROM credit_notes WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!creditNote) return res.status(404).json({ error: "Not found" });

  const lineItems = db.prepare("SELECT * FROM credit_note_line_items WHERE credit_note_id = ?").all(creditNote.id);
  const customer = creditNote.customer_id ? db.prepare("SELECT * FROM customers WHERE id = ?").get(creditNote.customer_id) : null;
  const invoice = creditNote.invoice_id ? db.prepare("SELECT * FROM invoices WHERE id = ?").get(creditNote.invoice_id) : null;
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);

  res.json({ ...creditNote, lineItems, customer, invoice, business });
});

// Create a credit note. If it references an invoice, its total is applied
// against that invoice's balance_due immediately (like a negative payment) —
// clamped at zero, and the invoice is marked paid once fully credited.
router.post("/", (req, res) => {
  const { customer_id, invoice_id, credit_note_date, reason, notes, lineItems } = req.body;
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return res.status(400).json({ error: "At least one line item is required" });
  }

  let invoice = null;
  if (invoice_id) {
    invoice = db.prepare("SELECT * FROM invoices WHERE id = ? AND business_id = ?").get(invoice_id, req.auth.businessId);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  }

  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  const creditNoteNumber = `${business.credit_note_prefix || "CN-"}${String(business.next_credit_note_number).padStart(6, "0")}`;

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

  const insertCreditNote = db.prepare(
    `INSERT INTO credit_notes
      (business_id, customer_id, invoice_id, credit_note_number, credit_note_date, reason,
       sub_total, discount, tax_total, total, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertLine = db.prepare(
    `INSERT INTO credit_note_line_items (credit_note_id, item_id, description, qty, rate, discount, tax_rate, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const bumpCreditNoteNumber = db.prepare("UPDATE businesses SET next_credit_note_number = next_credit_note_number + 1 WHERE id = ?");

  const creditNoteId = db.transaction(() => {
    const result = insertCreditNote.run(
      req.auth.businessId, customer_id || invoice?.customer_id || null, invoice_id || null,
      creditNoteNumber, credit_note_date || new Date().toISOString().slice(0, 10),
      reason || null, subTotal, discountTotal, taxTotal, total, notes || null
    );
    const id = result.lastInsertRowid;
    for (const line of computedLines) {
      insertLine.run(id, line.item_id || null, line.description, line.qty, line.rate, line.discount, line.tax_rate, line.amount);
    }
    bumpCreditNoteNumber.run(req.auth.businessId);

    if (invoice) {
      const newBalance = Math.max(0, invoice.balance_due - total);
      const newStatus = newBalance === 0 ? "paid" : invoice.status === "draft" ? "draft" : "partially_paid";
      db.prepare("UPDATE invoices SET balance_due = ?, status = ? WHERE id = ?").run(newBalance, newStatus, invoice.id);
    }
    return id;
  })();

  res.status(201).json(db.prepare("SELECT * FROM credit_notes WHERE id = ?").get(creditNoteId));
});

router.post("/:id/send", async (req, res) => {
  const creditNote = db.prepare("SELECT * FROM credit_notes WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!creditNote) return res.status(404).json({ error: "Not found" });

  const lineItems = db.prepare("SELECT * FROM credit_note_line_items WHERE credit_note_id = ?").all(creditNote.id);
  const customer = creditNote.customer_id ? db.prepare("SELECT * FROM customers WHERE id = ?").get(creditNote.customer_id) : null;
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);

  const to = (req.body && req.body.to) || customer?.email;
  if (!to) return res.status(400).json({ error: "No recipient email — add one to the customer or enter one to send to" });

  try {
    const pdfBuffer = await renderDocumentPdf({
      docLabel: "Credit Note", docNumber: creditNote.credit_note_number, docDate: formatDate(creditNote.credit_note_date, business.date_format),
      extraMeta: creditNote.reason ? [`Reason: ${creditNote.reason}`] : [],
      headlineLabel: "Total Credit", headlineValue: `Rs ${Number(creditNote.total).toFixed(2)}`,
      business, party: customer, partyLabel: "To", lineItems, totals: creditNote, notes: creditNote.notes,
    });
    await sendDocumentEmail({
      business, to,
      subject: `Credit Note ${creditNote.credit_note_number} from ${business.name}`,
      text: `Hi,\n\nPlease find attached credit note ${creditNote.credit_note_number} for Rs ${Number(creditNote.total).toFixed(2)}.\n\nThanks,\n${business.name}`,
      pdfBuffer, pdfFilename: `${creditNote.credit_note_number}.pdf`,
    });
    res.json({ ok: true, sentTo: to });
  } catch (err) {
    if (err instanceof SmtpNotConfiguredError) return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Failed to send email — check your SMTP settings" });
  }
});

export default router;
