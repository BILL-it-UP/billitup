import express from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM items WHERE business_id = ? ORDER BY name")
    .all(req.auth.businessId);
  res.json(rows);
});

// Cashiers pick items/rates while billing, but only Owner/Admin maintain
// the price list itself — a cashier editing rates would affect every future invoice.
router.post("/", requireRole("owner", "admin"), (req, res) => {
  const {
    name, description, unit, rate, tax_rate, hsn_sac_code, type,
    sales_account, purchase_account, cost_price, purchase_description,
  } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const result = db
    .prepare(
      `INSERT INTO items (
        business_id, name, description, unit, rate, tax_rate, hsn_sac_code, type,
        sales_account, purchase_account, cost_price, purchase_description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.auth.businessId, name, description || null, unit || "pcs", rate || 0, tax_rate || 0, hsn_sac_code || null,
      type === "service" ? "service" : "goods",
      sales_account || "Sales", purchase_account || "Cost of Goods Sold",
      cost_price === "" || cost_price == null ? null : Number(cost_price), purchase_description || null
    );
  const created = db.prepare("SELECT * FROM items WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(created);
});

router.put("/:id", requireRole("owner", "admin"), (req, res) => {
  const {
    name, description, unit, rate, tax_rate, hsn_sac_code, type,
    sales_account, purchase_account, cost_price, purchase_description,
  } = req.body;
  db.prepare(
    `UPDATE items SET
      name = COALESCE(?, name), description = COALESCE(?, description), unit = COALESCE(?, unit),
      rate = COALESCE(?, rate), tax_rate = COALESCE(?, tax_rate), hsn_sac_code = COALESCE(?, hsn_sac_code),
      type = COALESCE(?, type), sales_account = COALESCE(?, sales_account),
      purchase_account = COALESCE(?, purchase_account), cost_price = ?, purchase_description = COALESCE(?, purchase_description)
     WHERE id = ? AND business_id = ?`
  ).run(
    name, description, unit, rate, tax_rate, hsn_sac_code, type, sales_account, purchase_account,
    cost_price === "" || cost_price == null ? null : Number(cost_price), purchase_description,
    req.params.id, req.auth.businessId
  );
  const updated = db.prepare("SELECT * FROM items WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

// Items has a real "used elsewhere" problem a plain delete doesn't: the
// foreign key from invoice_line_items (and purchases, time entries, and the
// old stock_adjustments table) to items is enforced (db.js turns foreign
// keys on), so deleting an item that's ever been billed throws a raw SQLite
// constraint error rather than actually deleting anything — deleting it
// would otherwise strand those existing documents' line items. Caught here
// and turned into an honest, actionable message instead of a generic
// "Request failed (500)" (2026-09-17).
router.delete("/:id", requireRole("owner", "admin"), (req, res) => {
  try {
    const result = db
      .prepare("DELETE FROM items WHERE id = ? AND business_id = ?")
      .run(req.params.id, req.auth.businessId);
    if (result.changes === 0) return res.status(404).json({ error: "Item not found." });
    res.status(204).end();
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_FOREIGN_KEY") {
      return res.status(409).json({
        error:
          "This item has already been used on an invoice, quote, or purchase, so it can't be deleted, that would break those existing documents. Rename it or change its price instead if something needs updating.",
      });
    }
    throw err;
  }
});

export default router;
