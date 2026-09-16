import express from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { renderDocumentPdf, sendDocumentEmail, renderEmailHtml, SmtpNotConfiguredError } from "../lib/mailer.js";
import { formatDate } from "../lib/formatDate.js";
import { nextInvoiceNumber } from "../lib/invoiceNumbering.js";
import { applyGstTreatment, adjustLineAmountsForTreatment } from "../lib/gst.js";
import { getTemplate, mergeTemplate } from "../lib/emailTemplates.js";
import { upiQrForInvoice, upiQrPngBufferForInvoice } from "../lib/upiQr.js";
import { computeProjectProgress } from "../lib/projectProgress.js";
import { printPrefix } from "../lib/currency.js";

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
        (invoices.status <> 'cancelled' AND invoices.balance_due > 0 AND invoices.due_date IS NOT NULL AND invoices.due_date < date('now')) AS is_overdue
       FROM invoices LEFT JOIN customers ON customers.id = invoices.customer_id
       WHERE invoices.business_id = ? ORDER BY invoices.created_at DESC`
    )
    .all(req.auth.businessId);
  res.json(rows);
});

// Full invoice with line items + customer + business, shaped for the print/PDF view
router.get("/:id", async (req, res) => {
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
  const isOverdue = !!(invoice.status !== "cancelled" && invoice.balance_due > 0 && invoice.due_date && invoice.due_date < new Date().toISOString().slice(0, 10));
  const upiQr = await upiQrForInvoice(business, invoice);
  const projectProgress = computeProjectProgress(invoice);

  res.json({ ...invoice, ...projectProgress, is_overdue: isOverdue, lineItems, customer, business, payments, upi_qr_data_url: upiQr?.dataUrl || null });
});

// Create an invoice with its line items in one call. Server computes all totals —
// the client sends qty/rate/discount/tax_rate per line, never trusts client-side amounts.
router.post("/", (req, res) => {
  const {
    customer_id, invoice_date, due_date, terms, reference, subject, gstin, notes, lineItems, gst_treatment,
    eway_bill_number, eway_transporter_name, eway_transporter_id, eway_vehicle_number, eway_distance_km,
    currency, project_name, milestone_label, project_total_amount,
  } = req.body;
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return res.status(400).json({ error: "At least one line item is required" });
  }
  // A "walk-in / no customer" invoice made no sense for BillItUp's actual
  // users (services businesses billing under GST) — every invoice needs a
  // real customer on it, enforced here too, not just by removing the option
  // from the New Invoice form (2026-09-15).
  if (!customer_id) {
    return res.status(400).json({ error: "A customer is required" });
  }

  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  const { invoiceNumber, commit: commitInvoiceNumber } = nextInvoiceNumber(business);

  const customer = customer_id ? db.prepare("SELECT * FROM customers WHERE id = ?").get(customer_id) : null;
  const { computedLines: rawComputedLines, subTotal, discountTotal, taxTotal: rawTaxTotal } = computeLineTotals(lineItems);
  const { treatment, taxTotal, cgst, sgst, igst, total } = applyGstTreatment({
    subTotal, discountTotal, taxTotal: rawTaxTotal, treatment: gst_treatment,
    businessState: business.state, customerState: customer?.state,
  });
  const computedLines = adjustLineAmountsForTreatment(rawComputedLines, treatment);

  // E-Way Bill details are a premium-only manual tracker (see db.js) — a
  // free-plan business gets these dropped even if it somehow sends them
  // (the UI never shows the fields to begin with), rather than trusting the
  // client to have honoured the plan gate itself.
  const isPremium = business.plan === "premium";
  const ewayBillNumber = isPremium ? eway_bill_number || null : null;
  const ewayTransporterName = isPremium ? eway_transporter_name || null : null;
  const ewayTransporterId = isPremium ? eway_transporter_id || null : null;
  const ewayVehicleNumber = isPremium ? eway_vehicle_number || null : null;
  const ewayDistanceKm = isPremium && eway_distance_km ? Number(eway_distance_km) : null;
  const invoiceCurrency = currency || business.default_currency || "INR";

  const insertInvoice = db.prepare(
    `INSERT INTO invoices
      (business_id, customer_id, invoice_number, invoice_date, due_date, terms, reference, subject, gstin, status,
       sub_total, discount, tax_total, total, balance_due, notes, public_token, gst_treatment, cgst, sgst, igst,
       eway_bill_number, eway_transporter_name, eway_transporter_id, eway_vehicle_number, eway_distance_km,
       currency, project_name, milestone_label, project_total_amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertLine = db.prepare(
    `INSERT INTO invoice_line_items (invoice_id, item_id, description, qty, rate, discount, tax_rate, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const invoiceId = db.transaction(() => {
    const result = insertInvoice.run(
      req.auth.businessId, customer_id || null, invoiceNumber,
      invoice_date || new Date().toISOString().slice(0, 10), due_date || null,
      terms || null, reference || null, subject || null, gstin || null,
      subTotal, discountTotal, taxTotal, total, total, notes || null,
      randomUUID().replace(/-/g, ""), treatment, cgst, sgst, igst,
      ewayBillNumber, ewayTransporterName, ewayTransporterId, ewayVehicleNumber, ewayDistanceKm,
      invoiceCurrency, project_name || null, milestone_label || null,
      project_total_amount ? Number(project_total_amount) : null
    );
    const id = result.lastInsertRowid;
    for (const line of computedLines) {
      insertLine.run(id, line.item_id || null, line.description, line.qty, line.rate, line.discount, line.tax_rate, line.amount);
    }
    commitInvoiceNumber();
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

  const {
    customer_id, invoice_date, due_date, terms, reference, subject, gstin, notes, lineItems, gst_treatment,
    eway_bill_number, eway_transporter_name, eway_transporter_id, eway_vehicle_number, eway_distance_km,
    currency, project_name, milestone_label, project_total_amount,
  } = req.body;
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return res.status(400).json({ error: "At least one line item is required" });
  }
  if (!customer_id) {
    return res.status(400).json({ error: "A customer is required" });
  }

  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  const customer = customer_id ? db.prepare("SELECT * FROM customers WHERE id = ?").get(customer_id) : null;
  const existingLineItems = db.prepare("SELECT * FROM invoice_line_items WHERE invoice_id = ?").all(invoice.id);
  const { computedLines: rawComputedLines, subTotal, discountTotal, taxTotal: rawTaxTotal } = computeLineTotals(lineItems);
  const { treatment, taxTotal, cgst, sgst, igst, total } = applyGstTreatment({
    subTotal, discountTotal, taxTotal: rawTaxTotal, treatment: gst_treatment || invoice.gst_treatment,
    businessState: business.state, customerState: customer?.state,
  });
  const computedLines = adjustLineAmountsForTreatment(rawComputedLines, treatment);

  // Same premium gate as create — a free-plan business keeps whatever it
  // already had (which, since create also gates this, will always be null)
  // rather than picking up e-way bill details from a client that skipped the
  // UI gate.
  const isPremium = business.plan === "premium";
  const ewayBillNumber = isPremium ? eway_bill_number || null : null;
  const ewayTransporterName = isPremium ? eway_transporter_name || null : null;
  const ewayTransporterId = isPremium ? eway_transporter_id || null : null;
  const ewayVehicleNumber = isPremium ? eway_vehicle_number || null : null;
  const ewayDistanceKm = isPremium && eway_distance_km ? Number(eway_distance_km) : null;

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
        sub_total = ?, discount = ?, tax_total = ?, total = ?, balance_due = ?, status = ?,
        gst_treatment = ?, cgst = ?, sgst = ?, igst = ?,
        eway_bill_number = ?, eway_transporter_name = ?, eway_transporter_id = ?, eway_vehicle_number = ?, eway_distance_km = ?,
        currency = ?, project_name = ?, milestone_label = ?, project_total_amount = ?
       WHERE id = ?`
    ).run(
      customer_id || null, invoice_date || invoice.invoice_date, due_date || null,
      terms || null, reference || null, subject || null, gstin || null, notes || null,
      subTotal, discountTotal, taxTotal, total, newBalanceDue, newStatus,
      treatment, cgst, sgst, igst,
      ewayBillNumber, ewayTransporterName, ewayTransporterId, ewayVehicleNumber, ewayDistanceKm,
      currency || invoice.currency || "INR", project_name || null, milestone_label || null,
      project_total_amount ? Number(project_total_amount) : null,
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
  if (!["draft", "sent", "paid", "partially_paid", "overdue", "cancelled"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const invoice = db.prepare("SELECT * FROM invoices WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!invoice) return res.status(404).json({ error: "Not found" });

  // Cancelling only makes sense for an invoice nobody has paid against yet —
  // once money has changed hands, a credit note is the correct way to
  // reverse it, so the financial trail stays intact instead of a cancelled
  // invoice quietly still holding a real payment.
  if (status === "cancelled") {
    const amountPaid = invoice.total - invoice.balance_due;
    if (amountPaid > 0) {
      return res.status(400).json({ error: "This invoice has a payment recorded against it — issue a credit note instead of cancelling it" });
    }
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
  const isReceipt = !!(req.body && req.body.receipt);
  const templateType = isReceipt ? "receipt" : isReminder ? "reminder" : "invoice";

  // Vars are pre-formatted strings, not raw numbers/dates — the template
  // merge itself stays a dumb string replace (see lib/emailTemplates.js).
  // amount_paid/status_line only matter for the receipt template, but there's
  // no harm computing them unconditionally — a template that doesn't
  // reference a placeholder just never sees it.
  const prefix = printPrefix(invoice.currency);
  const templateVars = {
    business_name: business.name || "",
    customer_name: customer?.name || "there",
    document_number: invoice.invoice_number,
    amount: Number(invoice.total).toFixed(2),
    balance_due: Number(invoice.balance_due).toFixed(2),
    due_date: invoice.due_date ? ` (due ${formatDate(invoice.due_date, business.date_format)})` : "",
    amount_paid: Number(invoice.total - invoice.balance_due).toFixed(2),
    status_line: invoice.balance_due > 0
      ? ` A balance of ${prefix} ${Number(invoice.balance_due).toFixed(2)} is still outstanding.`
      : " Your invoice is now fully paid.",
  };
  const template = getTemplate(business, templateType);
  // The send popup in the app always sends its own edited subject/message —
  // this template merge is really the fallback for any caller that doesn't
  // (a future integration, or a request made directly against the API).
  const subject = (req.body && req.body.subject) || mergeTemplate(template.subject, templateVars);
  const bodyText = (req.body && req.body.message) || mergeTemplate(template.body, templateVars);

  try {
    const upiQrPngBuffer = await upiQrPngBufferForInvoice(business, invoice);
    const projectProgress = computeProjectProgress(invoice);
    const pdfBuffer = await renderDocumentPdf({
      docLabel: "Invoice", docNumber: invoice.invoice_number, docDate: formatDate(invoice.invoice_date, business.date_format),
      headlineLabel: "Balance Due", headlineValue: `${prefix} ${Number(invoice.balance_due).toFixed(2)}`,
      business, party: customer, partyLabel: "Bill To", lineItems,
      totals: { ...invoice, ...projectProgress }, notes: invoice.notes, upiQrPngBuffer,
    });
    // Invoices have a public no-login share link (public_token) — quotes and
    // credit notes don't, so only invoice emails get a "View Invoice" button.
    const ctaUrl = invoice.public_token ? `${req.protocol}://${req.get("host")}/view/invoice/${invoice.public_token}` : null;
    const html = renderEmailHtml({
      business, bodyText, ctaUrl, ctaLabel: "View Invoice",
      summaryRows: isReceipt
        ? [
            ["Invoice Number", invoice.invoice_number],
            ["Amount Paid", `${prefix} ${templateVars.amount_paid}`],
            ...(invoice.balance_due > 0 ? [["Balance Due", `${prefix} ${Number(invoice.balance_due).toFixed(2)}`]] : []),
          ]
        : [
            ["Invoice Number", invoice.invoice_number],
            ["Amount", `${prefix} ${Number(invoice.total).toFixed(2)}`],
            ...(invoice.balance_due > 0 ? [["Balance Due", `${prefix} ${Number(invoice.balance_due).toFixed(2)}`]] : []),
            ...(invoice.due_date ? [["Due Date", formatDate(invoice.due_date, business.date_format)]] : []),
          ],
    });
    await sendDocumentEmail({
      business, to, subject, text: bodyText, html,
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
