import express from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

const FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"];

// Advances a YYYY-MM-DD date string by one cadence step. Uses UTC date math
// so it isn't affected by the server's local timezone, and lets JS's own
// month/year rollover handle edge cases (e.g. a monthly invoice starting on
// the 31st rolls into early the following month once the current month is
// shorter — an accepted simplification for v1).
export function addInterval(dateStr, frequency, intervalCount = 1) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const n = Math.max(1, Number(intervalCount) || 1);
  if (frequency === "weekly") date.setUTCDate(date.getUTCDate() + 7 * n);
  else if (frequency === "quarterly") date.setUTCMonth(date.getUTCMonth() + 3 * n);
  else if (frequency === "yearly") date.setUTCFullYear(date.getUTCFullYear() + n);
  else date.setUTCMonth(date.getUTCMonth() + n); // monthly (and default)
  return date.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + Number(days));
  return date.toISOString().slice(0, 10);
}

// Turns one recurring profile into a real invoice: computes totals from its
// template line items exactly like a normal invoice creation would, inserts
// the invoice, then advances the profile to its next due date (or ends it,
// if that would run past end_date). Shared by the manual "Generate now"
// button and the background scheduler in index.js so both paths behave
// identically.
export function generateInvoiceFromRecurring(recurringId) {
  const recurring = db.prepare("SELECT * FROM recurring_invoices WHERE id = ?").get(recurringId);
  if (!recurring) throw new Error("Recurring invoice not found");

  const templateLines = db.prepare("SELECT * FROM recurring_invoice_line_items WHERE recurring_invoice_id = ?").all(recurring.id);
  if (templateLines.length === 0) throw new Error("This recurring invoice has no line items to bill");

  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(recurring.business_id);
  const invoiceNumber = `${business.invoice_prefix || "INV-"}${String(business.next_invoice_number).padStart(6, "0")}`;
  const invoiceDate = recurring.next_invoice_date;
  const dueDate = recurring.due_in_days ? addDays(invoiceDate, recurring.due_in_days) : null;

  let subTotal = 0, taxTotal = 0, discountTotal = 0;
  const computedLines = templateLines.map((line) => {
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

  const insertInvoice = db.prepare(
    `INSERT INTO invoices
      (business_id, customer_id, invoice_number, invoice_date, due_date, terms, reference, status,
       sub_total, discount, tax_total, total, balance_due, notes, public_token, recurring_invoice_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertLine = db.prepare(
    `INSERT INTO invoice_line_items (invoice_id, item_id, description, qty, rate, discount, tax_rate, amount)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const bumpInvoiceNumber = db.prepare("UPDATE businesses SET next_invoice_number = next_invoice_number + 1 WHERE id = ?");

  const nextDate = addInterval(recurring.next_invoice_date, recurring.frequency, recurring.interval_count);
  const hasEnded = recurring.end_date && nextDate > recurring.end_date;

  const invoiceId = db.transaction(() => {
    const result = insertInvoice.run(
      recurring.business_id, recurring.customer_id, invoiceNumber, invoiceDate, dueDate,
      recurring.terms || null, recurring.reference || null,
      subTotal, discountTotal, taxTotal, total, total, recurring.notes || null,
      randomUUID().replace(/-/g, ""), recurring.id
    );
    const id = result.lastInsertRowid;
    for (const line of computedLines) {
      insertLine.run(id, line.item_id || null, line.description, line.qty, line.rate, line.discount, line.tax_rate, line.amount);
    }
    bumpInvoiceNumber.run(recurring.business_id);
    db.prepare(
      `UPDATE recurring_invoices SET
        next_invoice_date = ?, last_generated_invoice_id = ?, last_generated_at = datetime('now'),
        status = CASE WHEN ? THEN 'ended' ELSE status END
       WHERE id = ?`
    ).run(nextDate, id, hasEnded ? 1 : 0, recurring.id);
    return id;
  })();

  return invoiceId;
}

// Runs at server startup and on an interval (see index.js) — generates every
// active recurring invoice whose next_invoice_date has arrived. Safe to call
// often: a profile is only ever due once until its next_invoice_date moves
// forward, which generateInvoiceFromRecurring always does before returning.
export function runDueRecurringInvoices() {
  const due = db
    .prepare("SELECT id FROM recurring_invoices WHERE status = 'active' AND next_invoice_date <= date('now')")
    .all();
  const generated = [];
  for (const row of due) {
    try {
      generated.push(generateInvoiceFromRecurring(row.id));
    } catch (err) {
      console.error(`Failed to generate recurring invoice #${row.id}:`, err.message);
    }
  }
  return generated;
}

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT recurring_invoices.*, customers.name AS customer_name
       FROM recurring_invoices LEFT JOIN customers ON customers.id = recurring_invoices.customer_id
       WHERE recurring_invoices.business_id = ? ORDER BY recurring_invoices.created_at DESC`
    )
    .all(req.auth.businessId);
  res.json(rows);
});

router.get("/:id", (req, res) => {
  const recurring = db.prepare("SELECT * FROM recurring_invoices WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!recurring) return res.status(404).json({ error: "Not found" });
  const lineItems = db.prepare("SELECT * FROM recurring_invoice_line_items WHERE recurring_invoice_id = ?").all(recurring.id);
  const customer = recurring.customer_id ? db.prepare("SELECT * FROM customers WHERE id = ?").get(recurring.customer_id) : null;
  res.json({ ...recurring, lineItems, customer });
});

router.post("/", requireRole("owner", "admin"), (req, res) => {
  const {
    customer_id, frequency, interval_count, start_date, end_date,
    due_in_days, reference, terms, notes, lineItems,
  } = req.body;

  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return res.status(400).json({ error: "At least one line item is required" });
  }
  if (!FREQUENCIES.includes(frequency)) {
    return res.status(400).json({ error: `frequency must be one of: ${FREQUENCIES.join(", ")}` });
  }
  if (!start_date) return res.status(400).json({ error: "start_date is required" });

  const insertRecurring = db.prepare(
    `INSERT INTO recurring_invoices
      (business_id, customer_id, frequency, interval_count, start_date, next_invoice_date, end_date,
       due_in_days, reference, terms, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertLine = db.prepare(
    `INSERT INTO recurring_invoice_line_items (recurring_invoice_id, item_id, description, qty, rate, discount, tax_rate)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  const recurringId = db.transaction(() => {
    const result = insertRecurring.run(
      req.auth.businessId, customer_id || null, frequency, Number(interval_count) || 1,
      start_date, start_date, end_date || null,
      due_in_days === undefined || due_in_days === "" ? null : Number(due_in_days),
      reference || null, terms || null, notes || null
    );
    const id = result.lastInsertRowid;
    for (const line of lineItems) {
      insertLine.run(
        id, line.item_id || null, line.description,
        Number(line.qty) || 0, Number(line.rate) || 0, Number(line.discount) || 0, Number(line.tax_rate) || 0
      );
    }
    return id;
  })();

  res.status(201).json(db.prepare("SELECT * FROM recurring_invoices WHERE id = ?").get(recurringId));
});

router.put("/:id/status", requireRole("owner", "admin"), (req, res) => {
  const { status } = req.body;
  if (!["active", "paused", "ended"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  db.prepare("UPDATE recurring_invoices SET status = ? WHERE id = ? AND business_id = ?").run(status, req.params.id, req.auth.businessId);
  const updated = db.prepare("SELECT * FROM recurring_invoices WHERE id = ?").get(req.params.id);
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

// Generate the next invoice right now, regardless of next_invoice_date —
// useful right after creating a profile, or to catch up manually on a
// self-hosted install where the server wasn't running when it came due.
router.post("/:id/generate-now", requireRole("owner", "admin"), (req, res) => {
  const recurring = db.prepare("SELECT * FROM recurring_invoices WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!recurring) return res.status(404).json({ error: "Not found" });
  try {
    const invoiceId = generateInvoiceFromRecurring(recurring.id);
    res.status(201).json(db.prepare("SELECT * FROM invoices WHERE id = ?").get(invoiceId));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:id", requireRole("owner", "admin"), (req, res) => {
  db.prepare("DELETE FROM recurring_invoices WHERE id = ? AND business_id = ?").run(req.params.id, req.auth.businessId);
  res.status(204).end();
});

export default router;
