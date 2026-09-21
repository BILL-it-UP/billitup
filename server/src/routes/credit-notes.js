import express from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { renderDocumentPdf, sendDocumentEmail, renderEmailHtml, SmtpNotConfiguredError } from "../lib/mailer.js";
import { formatDate } from "../lib/formatDate.js";
import { applyGstTreatment, adjustLineAmountsForTreatment } from "../lib/gst.js";
import { getTemplate, mergeTemplate } from "../lib/emailTemplates.js";

const router = express.Router();
router.use(requireAuth);

// Shared by create (POST /) and edit (PUT /:id) so the two always compute
// totals the same way (2026-09-20, matching the same pattern on invoices/quotes).
function computeLineTotals(lineItems) {
  let subTotal = 0, rawTaxTotal = 0, discountTotal = 0;
  const computedLines = lineItems.map((line) => {
    // A section header (Zoho's own "Insert New Header", 2026-09-21) is a
    // plain text divider, never a billable line. Every numeric field is
    // forced to 0 here regardless of whatever a client sends.
    if (line.line_type === "header") {
      return { ...line, line_type: "header", item_id: null, qty: 0, rate: 0, discount: 0, tax_rate: 0, amount: 0 };
    }
    const qty = Number(line.qty) || 0;
    const rate = Number(line.rate) || 0;
    const discount = Number(line.discount) || 0;
    const taxRate = Number(line.tax_rate) || 0;
    const lineBase = qty * rate - discount;
    const lineTax = lineBase * (taxRate / 100);
    subTotal += qty * rate;
    discountTotal += discount;
    rawTaxTotal += lineTax;
    return { ...line, line_type: "item", qty, rate, discount, tax_rate: taxRate, amount: lineBase + lineTax };
  });
  return { computedLines, subTotal, discountTotal, taxTotal: rawTaxTotal };
}

// A credit note against an invoice reduces that invoice's balance_due the
// moment it's created (like a negative payment). Trashing or editing away a
// credit note has to undo that, and restoring or re-creating one has to
// redo it — these two are the one place both directions of that effect
// live, so trash/restore/edit can never drift from what create already does
// (2026-09-20). Both are no-ops when there's no invoice_id, or the invoice
// it pointed at is gone or itself trashed — there's nothing safe left to
// adjust in that case, so the credit note's own row is still trashed/
// restored/edited, just without touching an invoice that isn't there.
function applyCreditNoteEffect(invoiceId, total) {
  if (!invoiceId) return;
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL").get(invoiceId);
  if (!invoice) return;
  const newBalance = Math.max(0, invoice.balance_due - total);
  const newStatus = newBalance === 0 ? "paid" : invoice.status === "draft" ? "draft" : "partially_paid";
  db.prepare("UPDATE invoices SET balance_due = ?, status = ? WHERE id = ?").run(newBalance, newStatus, invoice.id);
}

function reverseCreditNoteEffect(invoiceId, total) {
  if (!invoiceId) return;
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL").get(invoiceId);
  if (!invoice) return;
  const newBalance = Math.min(invoice.total, invoice.balance_due + total);
  const newStatus = newBalance <= 0 ? "paid" : newBalance >= invoice.total ? (invoice.status === "cancelled" ? "cancelled" : "sent") : "partially_paid";
  db.prepare("UPDATE invoices SET balance_due = ?, status = ? WHERE id = ?").run(newBalance, newStatus, invoice.id);
}

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT credit_notes.*, customers.name AS customer_name, invoices.invoice_number
       FROM credit_notes
       LEFT JOIN customers ON customers.id = credit_notes.customer_id
       LEFT JOIN invoices ON invoices.id = credit_notes.invoice_id
       WHERE credit_notes.business_id = ? AND credit_notes.deleted_at IS NULL ORDER BY credit_notes.created_at DESC`
    )
    .all(req.auth.businessId);
  res.json(rows);
});

// Trash — see items.js and db.js's deleted_at comment for the shared
// pattern. Registered before GET /:id so the literal path "/trash" isn't
// swallowed by the :id wildcard. Trashing a credit note reverses whatever it
// did to its invoice's balance (the same way deleting a payment would), and
// restoring it below redoes that — see applyCreditNoteEffect/
// reverseCreditNoteEffect above. Nothing else references a credit note row
// by id, so the permanent delete further down never needs a foreign-key
// safety catch, and by the time a credit note reaches it, its balance
// effect has already been undone here.
router.get("/trash", requireRole("owner", "admin"), (req, res) => {
  const rows = db
    .prepare(
      `SELECT credit_notes.*, customers.name AS customer_name, invoices.invoice_number
       FROM credit_notes
       LEFT JOIN customers ON customers.id = credit_notes.customer_id
       LEFT JOIN invoices ON invoices.id = credit_notes.invoice_id
       WHERE credit_notes.business_id = ? AND credit_notes.deleted_at IS NOT NULL ORDER BY credit_notes.deleted_at DESC`
    )
    .all(req.auth.businessId);
  res.json(rows);
});

router.get("/:id", (req, res) => {
  const creditNote = db.prepare("SELECT * FROM credit_notes WHERE id = ? AND business_id = ? AND deleted_at IS NULL").get(req.params.id, req.auth.businessId);
  if (!creditNote) return res.status(404).json({ error: "Not found" });

  const lineItems = db.prepare("SELECT * FROM credit_note_line_items WHERE credit_note_id = ? ORDER BY id ASC").all(creditNote.id);
  const customer = creditNote.customer_id ? db.prepare("SELECT * FROM customers WHERE id = ?").get(creditNote.customer_id) : null;
  const invoice = creditNote.invoice_id ? db.prepare("SELECT * FROM invoices WHERE id = ?").get(creditNote.invoice_id) : null;
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);

  res.json({ ...creditNote, lineItems, customer, invoice, business });
});

// Create a credit note. If it references an invoice, its total is applied
// against that invoice's balance_due immediately (like a negative payment) —
// clamped at zero, and the invoice is marked paid once fully credited.
router.post("/", (req, res) => {
  const { customer_id, invoice_id, credit_note_date, reason, notes, lineItems, gst_treatment } = req.body;
  // A section header alone doesn't count as a line item (2026-09-21). See
  // the matching comment on the invoices route.
  if (!Array.isArray(lineItems) || lineItems.filter((l) => l.line_type !== "header").length === 0) {
    return res.status(400).json({ error: "At least one line item is required" });
  }

  let invoice = null;
  if (invoice_id) {
    invoice = db.prepare("SELECT * FROM invoices WHERE id = ? AND business_id = ? AND deleted_at IS NULL").get(invoice_id, req.auth.businessId);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  }

  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  const customer = customer_id
    ? db.prepare("SELECT * FROM customers WHERE id = ?").get(customer_id)
    : (invoice?.customer_id ? db.prepare("SELECT * FROM customers WHERE id = ?").get(invoice.customer_id) : null);
  const creditNoteNumber = `${business.credit_note_prefix || "CN-"}${String(business.next_credit_note_number).padStart(6, "0")}`;

  const { computedLines: rawComputedLines, subTotal, discountTotal, taxTotal: rawTaxTotal } = computeLineTotals(lineItems);
  const { treatment, taxTotal, cgst, sgst, igst, total } = applyGstTreatment({
    subTotal, discountTotal, taxTotal: rawTaxTotal, treatment: gst_treatment || invoice?.gst_treatment,
    businessState: business.state, customerState: customer?.state,
  });
  const computedLines = adjustLineAmountsForTreatment(rawComputedLines, treatment);

  const insertCreditNote = db.prepare(
    `INSERT INTO credit_notes
      (business_id, customer_id, invoice_id, credit_note_number, credit_note_date, reason,
       sub_total, discount, tax_total, total, notes, gst_treatment, cgst, sgst, igst)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertLine = db.prepare(
    `INSERT INTO credit_note_line_items (credit_note_id, item_id, description, qty, rate, discount, tax_rate, amount, line_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const bumpCreditNoteNumber = db.prepare("UPDATE businesses SET next_credit_note_number = next_credit_note_number + 1 WHERE id = ?");

  const creditNoteId = db.transaction(() => {
    const result = insertCreditNote.run(
      req.auth.businessId, customer_id || invoice?.customer_id || null, invoice_id || null,
      creditNoteNumber, credit_note_date || new Date().toISOString().slice(0, 10),
      reason || null, subTotal, discountTotal, taxTotal, total, notes || null,
      treatment, cgst, sgst, igst
    );
    const id = result.lastInsertRowid;
    for (const line of computedLines) {
      insertLine.run(id, line.item_id || null, line.description, line.qty, line.rate, line.discount, line.tax_rate, line.amount, line.line_type || "item");
    }
    bumpCreditNoteNumber.run(req.auth.businessId);
    if (invoice) applyCreditNoteEffect(invoice.id, total);
    return id;
  })();

  res.status(201).json(db.prepare("SELECT * FROM credit_notes WHERE id = ?").get(creditNoteId));
});

// Full edit — Owner/Admin only, matching the same tier as an invoice edit.
// The invoice-balance effect can't just be recomputed in place, since the
// credit note might now point at a different invoice (or none at all): the
// OLD effect is reversed off the OLD invoice first, then the NEW effect is
// applied to the NEW invoice, so moving a credit note between invoices (or
// detaching it) always leaves both balances correct (2026-09-20).
router.put("/:id", requireRole("owner", "admin"), (req, res) => {
  const creditNote = db.prepare("SELECT * FROM credit_notes WHERE id = ? AND business_id = ? AND deleted_at IS NULL").get(req.params.id, req.auth.businessId);
  if (!creditNote) return res.status(404).json({ error: "Not found" });

  const { customer_id, invoice_id, credit_note_date, reason, notes, lineItems, gst_treatment } = req.body;
  // A section header alone doesn't count as a line item (2026-09-21). See
  // the matching comment on the invoices route.
  if (!Array.isArray(lineItems) || lineItems.filter((l) => l.line_type !== "header").length === 0) {
    return res.status(400).json({ error: "At least one line item is required" });
  }

  let invoice = null;
  if (invoice_id) {
    invoice = db.prepare("SELECT * FROM invoices WHERE id = ? AND business_id = ? AND deleted_at IS NULL").get(invoice_id, req.auth.businessId);
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
  }

  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  const customer = customer_id
    ? db.prepare("SELECT * FROM customers WHERE id = ?").get(customer_id)
    : (invoice?.customer_id ? db.prepare("SELECT * FROM customers WHERE id = ?").get(invoice.customer_id) : null);

  const { computedLines: rawComputedLines, subTotal, discountTotal, taxTotal: rawTaxTotal } = computeLineTotals(lineItems);
  const { treatment, taxTotal, cgst, sgst, igst, total } = applyGstTreatment({
    subTotal, discountTotal, taxTotal: rawTaxTotal, treatment: gst_treatment || invoice?.gst_treatment || creditNote.gst_treatment,
    businessState: business.state, customerState: customer?.state,
  });
  const computedLines = adjustLineAmountsForTreatment(rawComputedLines, treatment);

  const insertLine = db.prepare(
    `INSERT INTO credit_note_line_items (credit_note_id, item_id, description, qty, rate, discount, tax_rate, amount, line_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  db.transaction(() => {
    // Undo the old effect before anything else changes — it has to run
    // against the OLD invoice_id/total, which is why this happens first.
    reverseCreditNoteEffect(creditNote.invoice_id, creditNote.total);

    db.prepare(
      `UPDATE credit_notes SET
        customer_id = ?, invoice_id = ?, credit_note_date = ?, reason = ?, notes = ?,
        sub_total = ?, discount = ?, tax_total = ?, total = ?, gst_treatment = ?, cgst = ?, sgst = ?, igst = ?
       WHERE id = ?`
    ).run(
      customer_id || invoice?.customer_id || null, invoice_id || null,
      credit_note_date || creditNote.credit_note_date, reason || null, notes || null,
      subTotal, discountTotal, taxTotal, total, treatment, cgst, sgst, igst,
      creditNote.id
    );
    db.prepare("DELETE FROM credit_note_line_items WHERE credit_note_id = ?").run(creditNote.id);
    for (const line of computedLines) {
      insertLine.run(creditNote.id, line.item_id || null, line.description, line.qty, line.rate, line.discount, line.tax_rate, line.amount, line.line_type || "item");
    }

    if (invoice) applyCreditNoteEffect(invoice.id, total);
  })();

  res.json(db.prepare("SELECT * FROM credit_notes WHERE id = ?").get(creditNote.id));
});

router.delete("/:id", requireRole("owner", "admin"), (req, res) => {
  const creditNote = db.prepare("SELECT * FROM credit_notes WHERE id = ? AND business_id = ? AND deleted_at IS NULL").get(req.params.id, req.auth.businessId);
  if (!creditNote) return res.status(404).json({ error: "Credit note not found." });
  db.transaction(() => {
    reverseCreditNoteEffect(creditNote.invoice_id, creditNote.total);
    db.prepare("UPDATE credit_notes SET deleted_at = datetime('now') WHERE id = ?").run(creditNote.id);
  })();
  res.status(204).end();
});

router.post("/:id/restore", requireRole("owner", "admin"), (req, res) => {
  const creditNote = db.prepare("SELECT * FROM credit_notes WHERE id = ? AND business_id = ? AND deleted_at IS NOT NULL").get(req.params.id, req.auth.businessId);
  if (!creditNote) return res.status(404).json({ error: "Not found in trash" });
  db.transaction(() => {
    db.prepare("UPDATE credit_notes SET deleted_at = NULL WHERE id = ?").run(creditNote.id);
    applyCreditNoteEffect(creditNote.invoice_id, creditNote.total);
  })();
  res.json(db.prepare("SELECT * FROM credit_notes WHERE id = ?").get(creditNote.id));
});

router.delete("/:id/permanent", requireRole("owner", "admin"), (req, res) => {
  const result = db
    .prepare("DELETE FROM credit_notes WHERE id = ? AND business_id = ? AND deleted_at IS NOT NULL")
    .run(req.params.id, req.auth.businessId);
  if (result.changes === 0) return res.status(404).json({ error: "Not found in trash" });
  res.status(204).end();
});

router.post("/:id/send", async (req, res) => {
  const creditNote = db.prepare("SELECT * FROM credit_notes WHERE id = ? AND business_id = ? AND deleted_at IS NULL").get(req.params.id, req.auth.businessId);
  if (!creditNote) return res.status(404).json({ error: "Not found" });

  const lineItems = db.prepare("SELECT * FROM credit_note_line_items WHERE credit_note_id = ? ORDER BY id ASC").all(creditNote.id);
  const customer = creditNote.customer_id ? db.prepare("SELECT * FROM customers WHERE id = ?").get(creditNote.customer_id) : null;
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);

  const to = (req.body && req.body.to) || customer?.email;
  if (!to) return res.status(400).json({ error: "No recipient email — add one to the customer or enter one to send to" });

  const templateVars = {
    business_name: business.name || "",
    customer_name: customer?.name || "there",
    document_number: creditNote.credit_note_number,
    amount: Number(creditNote.total).toFixed(2),
    balance_due: "",
    due_date: "",
  };
  const template = getTemplate(business, "credit_note");
  const subject = (req.body && req.body.subject) || mergeTemplate(template.subject, templateVars);
  const bodyText = (req.body && req.body.message) || mergeTemplate(template.body, templateVars);

  try {
    const pdfBuffer = await renderDocumentPdf({
      docLabel: "Credit Note", docNumber: creditNote.credit_note_number, docDate: formatDate(creditNote.credit_note_date, business.date_format),
      extraMeta: creditNote.reason ? [`Reason: ${creditNote.reason}`] : [],
      headlineLabel: "Total Credit", headlineValue: `Rs ${Number(creditNote.total).toFixed(2)}`,
      business, party: customer, partyLabel: "To", lineItems, totals: creditNote, notes: creditNote.notes,
    });
    const html = renderEmailHtml({
      business, bodyText, ctaUrl: null,
      summaryRows: [
        ["Credit Note Number", creditNote.credit_note_number],
        ["Amount", `Rs ${Number(creditNote.total).toFixed(2)}`],
      ],
    });
    await sendDocumentEmail({
      business, to, subject, text: bodyText, html,
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
