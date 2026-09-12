import express from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { renderDocumentPdf, sendDocumentEmail, SmtpNotConfiguredError } from "../lib/mailer.js";

const router = express.Router();
router.use(requireAuth);

// Shared by both create (POST /) and edit (PUT /:id) so the two can never
// compute totals differently — the server always recomputes from qty/rate/
// discount/tax_rate, never trusts a client-sent amount.
function computeLineTotals(lineItems) {
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
  return { computedLines, subTotal, discountTotal, taxTotal, total };
}

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
  const { customer_id, invoice_date, due_date, terms, reference, subject, gstin, notes, lineItems } = req.body;
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return res.status(400).json({ error: "At least one line item is required" });
  }

  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  const invoiceNumber = `${business.invoice_prefix || "INV-"}${String(business.next_invoice_number).padStart(6, "0")}`;

  const { computedLines, subTotal, discountTotal, taxTotal, total } = computeLineTotals(lineItems);

  const insertInvoice = db.prepare(
    `INSERT INTO invoices
      (business_id, customer_id, invoice_number, invoice_date, due_date, terms, reference, subject, gstin, status,
       sub_total, discount, tax_total, total, balance_due, notes, public_token)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`
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
      terms || null, reference || null, subject || null, gstin || null,
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

// Edit an already-created invoice's header fields and line items — Owner/Admin
// only, matching every other write on customers/items. Never a silent
// overwrite: the invoice's state right before this edit (header + line items)
// is snapshotted into invoice_edit_history first, so a previous version can
// always be looked back at later, however the numbers changed.
router.put("/:id", requireRole("owner", "admin"), (req, res) => {
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!invoice) return res.status(404).json({ error: "Not found" });

  const { customer_id, invoice_date, due_date, terms, reference, subject, gstin, notes, lineItems } = req.body;
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return res.status(400).json({ error: "At least one line item is required" });
  }

  const existingLineItems = db.prepare("SELECT * FROM invoice_line_items WHERE invoice_id = ?").all(invoice.id);
  const { computedLines, subTotal, discountTotal, taxTotal, total } = computeLineTotals(lineItems);

  // Editing a line item never touches payments already recorded — it only
  // changes what's owed. Re-derive balance_due/status from the amount
  // actually paid so far (not from the old balance_due, which was relative
  // to the OLD total) rather than just overwriting it with the new total.
  const amountPaid = invoice.total - invoice.balance_due;
  const newBalanceDue = Math.max(0, total - amountPaid);
  let newStatus = invoice.status;
  if (amountPaid > 0) {
    newStatus = newBalanceDue === 0 ? "paid" : "partially_paid";
  }

  const editorUser = db.prepare("SELECT name FROM users WHERE id = ?").get(req.auth.userId);

  const insertLine = db.prepare(
    `INSERT INTO invoice_line_items (invoice_id, item_id, description, qty, rate, discount, tax_rate, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  db.transaction(() => {
    db.prepare(
      `INSERT INTO invoice_edit_history
        (invoice_id, business_id, edited_by_user_id, edited_by_name, previous_total, new_total, snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      invoice.id, req.auth.businessId, req.auth.userId, editorUser?.name || null,
      invoice.total, total,
      JSON.stringify({
        invoice: {
          customer_id: invoice.customer_id, invoice_date: invoice.invoice_date, due_date: invoice.due_date,
          terms: invoice.terms, reference: invoice.reference, subject: invoice.subject, gstin: invoice.gstin,
          notes: invoice.notes,
        },
        lineItems: existingLineItems,
      })
    );

    db.prepare(
      `UPDATE invoices SET
        customer_id = ?, invoice_date = ?, due_date = ?, terms = ?, reference = ?, subject = ?, gstin = ?, notes = ?,
        sub_total = ?, discount = ?, tax_total = ?, total = ?, balance_due = ?, status = ?
       WHERE id = ?`
    ).run(
      customer_id || null, invoice_date || invoice.invoice_date, due_date || null,
      terms || null, reference || null, subject || null, gstin || null, notes || null,
      subTotal, discountTotal, taxTotal, total, newBalanceDue, newStatus,
      invoice.id
    );

    db.prepare("DELETE FROM invoice_line_items WHERE invoice_id = ?").run(invoice.id);
    for (const line of computedLines) {
      insertLine.run(invoice.id, line.item_id || null, line.description, line.qty, line.rate, line.discount, line.tax_rate, line.amount);
    }
  })();

  const updated = db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoice.id);
  res.json(updated);
});

// Edit history — who changed this invoice, when, and what the totals were
// before/after, plus the full previous line items so an owner/admin can see
// exactly what an earlier version said. Owner/Admin only, same sensitivity
// level as Staff Logins' login-activity list.
router.get("/:id/history", requireRole("owner", "admin"), (req, res) => {
  const invoice = db.prepare("SELECT id FROM invoices WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!invoice) return res.status(404).json({ error: "Not found" });

  const rows = db
    .prepare("SELECT * FROM invoice_edit_history WHERE invoice_id = ? ORDER BY created_at DESC")
    .all(invoice.id);
  res.json(rows.map((row) => ({ ...row, snapshot: JSON.parse(row.snapshot) })));
});

router.post("/:id/payments", (req, res) => {
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!invoice) return res.status(404).json({ error: "Not found" });

  const { amount, mode, notes, paid_at } = req.body;
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: "amount must be a positive number" });

  db.transaction(() => {
    if (paid_at) {
      db.prepare("INSERT INTO payments (invoice_id, amount, mode, notes, paid_at) VALUES (?, ?, ?, ?, ?)")
        .run(invoice.id, amt, mode || "cash", notes || null, paid_at);
    } else {
      db.prepare("INSERT INTO payments (invoice_id, amount, mode, notes) VALUES (?, ?, ?, ?)")
        .run(invoice.id, amt, mode || "cash", notes || null);
    }
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
