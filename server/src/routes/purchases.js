import express from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);
router.use(requireRole("owner", "admin"));

function withVendorName(row) {
  if (!row) return row;
  const vendor = row.vendor_id ? db.prepare("SELECT name, is_msme, has_written_agreement FROM vendors WHERE id = ?").get(row.vendor_id) : null;
  const customer = row.billable_customer_id ? db.prepare("SELECT name FROM customers WHERE id = ?").get(row.billable_customer_id) : null;
  return {
    ...row,
    vendor_name: vendor?.name || null,
    vendor_is_msme: !!vendor?.is_msme,
    vendor_has_written_agreement: !!vendor?.has_written_agreement,
    billable_customer_name: customer?.name || null,
  };
}

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT purchases.*, vendors.name AS vendor_name, vendors.is_msme AS vendor_is_msme,
              vendors.has_written_agreement AS vendor_has_written_agreement,
              customers.name AS billable_customer_name
       FROM purchases
       LEFT JOIN vendors ON vendors.id = purchases.vendor_id
       LEFT JOIN customers ON customers.id = purchases.billable_customer_id
       WHERE purchases.business_id = ? AND purchases.deleted_at IS NULL
       ORDER BY purchases.purchase_date DESC, purchases.id DESC`
    )
    .all(req.auth.businessId);
  res.json(rows.map((r) => ({ ...r, vendor_is_msme: !!r.vendor_is_msme, vendor_has_written_agreement: !!r.vendor_has_written_agreement })));
});

// Unbilled expenses flagged billable to one customer — used by the New
// Invoice page's "Add billable expenses" picker (2026-09-16).
router.get("/billable", (req, res) => {
  const { customer_id } = req.query;
  if (!customer_id) return res.status(400).json({ error: "customer_id is required" });
  const rows = db
    .prepare(
      `SELECT * FROM purchases
       WHERE business_id = ? AND billable_customer_id = ? AND billed_invoice_id IS NULL AND deleted_at IS NULL
       ORDER BY purchase_date DESC`
    )
    .all(req.auth.businessId, customer_id);
  res.json(rows);
});

// Trash — see items.js and db.js's deleted_at comment for the shared
// pattern. Nothing else references a purchase row by id, so a permanent
// delete below never needs a foreign-key safety catch the way items/vendors/
// customers do (2026-09-20).
router.get("/trash", (req, res) => {
  const rows = db
    .prepare(
      `SELECT purchases.*, vendors.name AS vendor_name, customers.name AS billable_customer_name
       FROM purchases
       LEFT JOIN vendors ON vendors.id = purchases.vendor_id
       LEFT JOIN customers ON customers.id = purchases.billable_customer_id
       WHERE purchases.business_id = ? AND purchases.deleted_at IS NOT NULL
       ORDER BY purchases.deleted_at DESC`
    )
    .all(req.auth.businessId);
  res.json(rows);
});

router.post("/", (req, res) => {
  const { vendor_id, purchase_date, bill_number, description, amount, tax_rate, notes, paid_date, billable_customer_id } = req.body;
  if (!purchase_date) return res.status(400).json({ error: "purchase_date is required" });
  const baseAmount = Number(amount) || 0;
  const rate = Number(tax_rate) || 0;
  const taxAmount = Math.round(baseAmount * (rate / 100) * 100) / 100;
  const total = Math.round((baseAmount + taxAmount) * 100) / 100;

  const result = db
    .prepare(
      `INSERT INTO purchases (business_id, vendor_id, purchase_date, bill_number, description, amount, tax_rate, tax_amount, total, notes, paid_date, billable_customer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.auth.businessId, vendor_id || null, purchase_date, bill_number || null, description || null, baseAmount, rate, taxAmount, total, notes || null,
      paid_date || null, billable_customer_id || null
    );
  res.status(201).json(withVendorName(db.prepare("SELECT * FROM purchases WHERE id = ?").get(result.lastInsertRowid)));
});

router.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM purchases WHERE id = ? AND business_id = ? AND deleted_at IS NULL").get(req.params.id, req.auth.businessId);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { vendor_id, purchase_date, bill_number, description, amount, tax_rate, notes, paid_date, billable_customer_id } = req.body;
  const baseAmount = amount === undefined ? existing.amount : Number(amount) || 0;
  const rate = tax_rate === undefined ? existing.tax_rate : Number(tax_rate) || 0;
  const taxAmount = Math.round(baseAmount * (rate / 100) * 100) / 100;
  const total = Math.round((baseAmount + taxAmount) * 100) / 100;

  db.prepare(
    `UPDATE purchases SET
      vendor_id = ?, purchase_date = COALESCE(?, purchase_date), bill_number = ?, description = ?,
      amount = ?, tax_rate = ?, tax_amount = ?, total = ?, notes = ?, paid_date = ?, billable_customer_id = ?
     WHERE id = ? AND business_id = ?`
  ).run(
    vendor_id === undefined ? existing.vendor_id : (vendor_id || null),
    purchase_date, bill_number === undefined ? existing.bill_number : bill_number,
    description === undefined ? existing.description : description,
    baseAmount, rate, taxAmount, total,
    notes === undefined ? existing.notes : notes,
    paid_date === undefined ? existing.paid_date : (paid_date || null),
    billable_customer_id === undefined ? existing.billable_customer_id : (billable_customer_id || null),
    req.params.id, req.auth.businessId
  );
  res.json(withVendorName(db.prepare("SELECT * FROM purchases WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId)));
});

router.delete("/:id", (req, res) => {
  const result = db
    .prepare("UPDATE purchases SET deleted_at = datetime('now') WHERE id = ? AND business_id = ? AND deleted_at IS NULL")
    .run(req.params.id, req.auth.businessId);
  if (result.changes === 0) return res.status(404).json({ error: "Purchase not found." });
  res.status(204).end();
});

router.post("/:id/restore", (req, res) => {
  const result = db
    .prepare("UPDATE purchases SET deleted_at = NULL WHERE id = ? AND business_id = ? AND deleted_at IS NOT NULL")
    .run(req.params.id, req.auth.businessId);
  if (result.changes === 0) return res.status(404).json({ error: "Not found in trash" });
  res.json(withVendorName(db.prepare("SELECT * FROM purchases WHERE id = ?").get(req.params.id)));
});

router.delete("/:id/permanent", (req, res) => {
  const result = db
    .prepare("DELETE FROM purchases WHERE id = ? AND business_id = ? AND deleted_at IS NOT NULL")
    .run(req.params.id, req.auth.businessId);
  if (result.changes === 0) return res.status(404).json({ error: "Not found in trash" });
  res.status(204).end();
});

export default router;
