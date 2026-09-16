import express from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);
// Vendor/purchase data is spend information, not something a cashier needs
// day to day — kept at the same sensitivity tier as Reports (owner/admin
// only), rather than the customers/items pattern of "everyone can read".
router.use(requireRole("owner", "admin"));

router.get("/", (req, res) => {
  const rows = db.prepare("SELECT * FROM vendors WHERE business_id = ? ORDER BY name").all(req.auth.businessId);
  res.json(rows);
});

router.post("/", (req, res) => {
  const { name, phone, email, address, pincode, country, gstin, state, notes, is_msme, has_written_agreement } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const result = db
    .prepare(
      `INSERT INTO vendors (business_id, name, phone, email, address, pincode, country, gstin, state, notes, is_msme, has_written_agreement)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.auth.businessId, name, phone || null, email || null, address || null, pincode || null, country || "India",
      gstin || null, state || null, notes || null, is_msme ? 1 : 0, has_written_agreement ? 1 : 0
    );
  res.status(201).json(db.prepare("SELECT * FROM vendors WHERE id = ?").get(result.lastInsertRowid));
});

router.put("/:id", (req, res) => {
  const { name, phone, email, address, pincode, country, gstin, state, notes, is_msme, has_written_agreement } = req.body;
  db.prepare(
    `UPDATE vendors SET
      name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email),
      address = COALESCE(?, address), pincode = COALESCE(?, pincode), country = COALESCE(?, country),
      gstin = COALESCE(?, gstin), state = COALESCE(?, state), notes = COALESCE(?, notes),
      is_msme = COALESCE(?, is_msme), has_written_agreement = COALESCE(?, has_written_agreement)
     WHERE id = ? AND business_id = ?`
  ).run(
    name, phone, email, address, pincode, country, gstin, state, notes,
    is_msme === undefined ? undefined : (is_msme ? 1 : 0),
    has_written_agreement === undefined ? undefined : (has_written_agreement ? 1 : 0),
    req.params.id, req.auth.businessId
  );
  const updated = db.prepare("SELECT * FROM vendors WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM vendors WHERE id = ? AND business_id = ?").run(req.params.id, req.auth.businessId);
  res.status(204).end();
});

export default router;
