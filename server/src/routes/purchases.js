import express from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);
router.use(requireRole("owner", "admin"));

function withVendorName(row) {
  if (!row) return row;
  const vendor = row.vendor_id ? db.prepare("SELECT name FROM vendors WHERE id = ?").get(row.vendor_id) : null;
  return { ...row, vendor_name: vendor?.name || null };
}

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT purchases.*, vendors.name AS vendor_name
       FROM purchases LEFT JOIN vendors ON vendors.id = purchases.vendor_id
       WHERE purchases.business_id = ? ORDER BY purchases.purchase_date DESC, purchases.id DESC`
    )
    .all(req.auth.businessId);
  res.json(rows);
});

router.post("/", (req, res) => {
  const { vendor_id, purchase_date, bill_number, description, amount, tax_rate, notes } = req.body;
  if (!purchase_date) return res.status(400).json({ error: "purchase_date is required" });
  const baseAmount = Number(amount) || 0;
  const rate = Number(tax_rate) || 0;
  const taxAmount = Math.round(baseAmount * (rate / 100) * 100) / 100;
  const total = Math.round((baseAmount + taxAmount) * 100) / 100;

  const result = db
    .prepare(
      `INSERT INTO purchases (business_id, vendor_id, purchase_date, bill_number, description, amount, tax_rate, tax_amount, total, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.auth.businessId, vendor_id || null, purchase_date, bill_number || null, description || null, baseAmount, rate, taxAmount, total, notes || null);
  res.status(201).json(withVendorName(db.prepare("SELECT * FROM purchases WHERE id = ?").get(result.lastInsertRowid)));
});

router.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM purchases WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { vendor_id, purchase_date, bill_number, description, amount, tax_rate, notes } = req.body;
  const baseAmount = amount === undefined ? existing.amount : Number(amount) || 0;
  const rate = tax_rate === undefined ? existing.tax_rate : Number(tax_rate) || 0;
  const taxAmount = Math.round(baseAmount * (rate / 100) * 100) / 100;
  const total = Math.round((baseAmount + taxAmount) * 100) / 100;

  db.prepare(
    `UPDATE purchases SET
      vendor_id = ?, purchase_date = COALESCE(?, purchase_date), bill_number = ?, description = ?,
      amount = ?, tax_rate = ?, tax_amount = ?, total = ?, notes = ?
     WHERE id = ? AND business_id = ?`
  ).run(
    vendor_id === undefined ? existing.vendor_id : (vendor_id || null),
    purchase_date, bill_number === undefined ? existing.bill_number : bill_number,
    description === undefined ? existing.description : description,
    baseAmount, rate, taxAmount, total,
    notes === undefined ? existing.notes : notes,
    req.params.id, req.auth.businessId
  );
  res.json(withVendorName(db.prepare("SELECT * FROM purchases WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId)));
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM purchases WHERE id = ? AND business_id = ?").run(req.params.id, req.auth.businessId);
  res.status(204).end();
});

export default router;
