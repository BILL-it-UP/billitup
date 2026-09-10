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
  const { name, description, unit, rate, tax_rate, hsn_sac_code, stock_qty, low_stock_threshold } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const result = db
    .prepare(
      `INSERT INTO items (business_id, name, description, unit, rate, tax_rate, hsn_sac_code, stock_qty, low_stock_threshold)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.auth.businessId, name, description || null, unit || "pcs",
      rate || 0, tax_rate || 0, hsn_sac_code || null,
      stock_qty === undefined || stock_qty === "" ? null : stock_qty,
      low_stock_threshold === undefined || low_stock_threshold === "" ? null : low_stock_threshold
    );
  const created = db.prepare("SELECT * FROM items WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(created);
});

router.put("/:id", (req, res) => {
  const { name, description, unit, rate, tax_rate, hsn_sac_code, stock_qty, low_stock_threshold } = req.body;
  db.prepare(
    `UPDATE items SET
      name = COALESCE(?, name), description = COALESCE(?, description), unit = COALESCE(?, unit),
      rate = COALESCE(?, rate), tax_rate = COALESCE(?, tax_rate),
      hsn_sac_code = COALESCE(?, hsn_sac_code), stock_qty = COALESCE(?, stock_qty),
      low_stock_threshold = COALESCE(?, low_stock_threshold)
     WHERE id = ? AND business_id = ?`
  ).run(name, description, unit, rate, tax_rate, hsn_sac_code, stock_qty, low_stock_threshold, req.params.id, req.auth.businessId);
  const updated = db.prepare("SELECT * FROM items WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

// Manual stock adjustment (restock, damage, stock-take correction, etc.) — logs
// an audit trail row and updates the running stock_qty in one transaction.
router.post("/:id/adjust-stock", (req, res) => {
  const item = db.prepare("SELECT * FROM items WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!item) return res.status(404).json({ error: "Not found" });

  const delta = Number(req.body?.delta);
  if (!delta) return res.status(400).json({ error: "delta must be a non-zero number" });
  const reason = req.body?.reason || null;

  const updated = db.transaction(() => {
    db.prepare("INSERT INTO stock_adjustments (business_id, item_id, delta, reason) VALUES (?, ?, ?, ?)")
      .run(req.auth.businessId, item.id, delta, reason);
    db.prepare("UPDATE items SET stock_qty = COALESCE(stock_qty, 0) + ? WHERE id = ?").run(delta, item.id);
    return db.prepare("SELECT * FROM items WHERE id = ?").get(item.id);
  })();

  res.json(updated);
});

router.delete("/:id", (req, res) => {
  db.prepare("DELETE FROM items WHERE id = ? AND business_id = ?").run(req.params.id, req.auth.businessId);
  res.status(204).end();
});

export default router;
