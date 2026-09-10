import express from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM customers WHERE business_id = ? ORDER BY name")
    .all(req.auth.businessId);
  res.json(rows);
});

// Cashiers can look up customers to bill against, but only Owner/Admin
// maintain the customer master list (edits here affect every future invoice).
router.post("/", requireRole("owner", "admin"), (req, res) => {
  const { name, phone, email, billing_address, shipping_address, gstin } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const result = db
    .prepare(
      `INSERT INTO customers (business_id, name, phone, email, billing_address, shipping_address, gstin)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.auth.businessId, name, phone, email, billing_address, shipping_address, gstin);
  res.status(201).json({ id: result.lastInsertRowid, name, phone, email, billing_address, shipping_address, gstin });
});

router.put("/:id", requireRole("owner", "admin"), (req, res) => {
  const { name, phone, email, billing_address, shipping_address, gstin } = req.body;
  db.prepare(
    `UPDATE customers SET
      name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email),
      billing_address = COALESCE(?, billing_address), shipping_address = COALESCE(?, shipping_address),
      gstin = COALESCE(?, gstin)
     WHERE id = ? AND business_id = ?`
  ).run(name, phone, email, billing_address, shipping_address, gstin, req.params.id, req.auth.businessId);
  const updated = db.prepare("SELECT * FROM customers WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

router.delete("/:id", requireRole("owner", "admin"), (req, res) => {
  db.prepare("DELETE FROM customers WHERE id = ? AND business_id = ?").run(req.params.id, req.auth.businessId);
  res.status(204).end();
});

export default router;
