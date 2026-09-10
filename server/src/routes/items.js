import express from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM items WHERE business_id = ? ORDER BY name")
    .all(req.auth.businessId);
  res.json(rows);
});

router.post("/", (req, res) => {
  const { name, description, unit, rate, tax_rate, hsn_sac_code } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const result = db
    .prepare(
      `INSERT INTO items (business_id, name, description, unit, rate, tax_rate, hsn_sac_code)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.auth.businessId, name, description || null, unit || "pcs", rate || 0, tax_rate || 0, hsn_sac_code || null);
  const created = db.prepare("SELECT * FROM items WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(created);
});

router.put("/:id", (req, res) => {
  const { name, description, unit, rate, tax_rate, hsn_sac_code } = req.body;
  db.prepare(
    `UPDATE items SET
      name = COALESCE(?, name), description = COALESCE(?, description), unit = COALESCE(?, unit),
      rate = COALESCE(?, rate), tax_rate = COALESCE(?, tax_rate), hsn_sac_code = COALESCE(?, hsn_sac_code)
     WHERE id = ? AND business_id = ?`
  ).run(name, description, unit, rate, tax_rate, hsn_sac_code, req.params.id, req.auth.businessId);
  const updated = db.prepare("SELECT * FROM items WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM items WHERE id = ? AND business_id = ?").run(req.params.id, req.auth.businessId);
  res.status(204).end();
});

export default router;
