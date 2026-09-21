import express from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM items WHERE business_id = ? AND deleted_at IS NULL ORDER BY name")
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
     WHERE id = ? AND business_id = ? AND deleted_at IS NULL`
  ).run(
    name, description, unit, rate, tax_rate, hsn_sac_code, type, sales_account, purchase_account,
    cost_price === "" || cost_price == null ? null : Number(cost_price), purchase_description,
    req.params.id, req.auth.businessId
  );
  const updated = db.prepare("SELECT * FROM items WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

// Trash — items move here instead of vanishing outright, so a misclick can
// always be undone. See routes/vendors.js and db.js's deleted_at comment for
// the same pattern repeated across every deletable resource (2026-09-20).
router.get("/trash", requireRole("owner", "admin"), (req, res) => {
  const rows = db
    .prepare("SELECT * FROM items WHERE business_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC")
    .all(req.auth.businessId);
  res.json(rows);
});

router.delete("/:id", requireRole("owner", "admin"), (req, res) => {
  const result = db
    .prepare("UPDATE items SET deleted_at = datetime('now') WHERE id = ? AND business_id = ? AND deleted_at IS NULL")
    .run(req.params.id, req.auth.businessId);
  if (result.changes === 0) return res.status(404).json({ error: "Item not found." });
  res.status(204).end();
});

router.post("/:id/restore", requireRole("owner", "admin"), (req, res) => {
  const result = db
    .prepare("UPDATE items SET deleted_at = NULL WHERE id = ? AND business_id = ? AND deleted_at IS NOT NULL")
    .run(req.params.id, req.auth.businessId);
  if (result.changes === 0) return res.status(404).json({ error: "Not found in trash" });
  res.json(db.prepare("SELECT * FROM items WHERE id = ?").get(req.params.id));
});

// The real, unrecoverable delete — only ever reachable from the Trash page,
// on an item that's already been soft deleted above. Keeps the exact same
// "used elsewhere" safety net the old plain delete had: the foreign key from
// invoice_line_items (and purchases, time entries, and the old
// stock_adjustments table) to items is enforced (db.js turns foreign keys
// on), so permanently deleting an item that's ever been billed throws a raw
// SQLite constraint error rather than actually deleting anything — that
// would otherwise strand those existing documents' line items. Caught here
// and turned into an honest, actionable message instead of a generic
// "Request failed (500)" (2026-09-17, moved into /permanent 2026-09-20).
router.delete("/:id/permanent", requireRole("owner", "admin"), (req, res) => {
  try {
    const result = db
      .prepare("DELETE FROM items WHERE id = ? AND business_id = ? AND deleted_at IS NOT NULL")
      .run(req.params.id, req.auth.businessId);
    if (result.changes === 0) return res.status(404).json({ error: "Not found in trash" });
    res.status(204).end();
  } catch (err) {
    // SQLite's real extended error code for this is "SQLITE_CONSTRAINT_FOREIGNKEY"
    // (no underscore between FOREIGN and KEY). An earlier round checked for
    // "SQLITE_CONSTRAINT_FOREIGN_KEY" instead, which never matched, so this
    // catch silently never fired and the raw constraint error kept reaching
    // the client (and the error log) as a generic 500. Fixed 2026-09-20,
    // caught from Naveen's own Master Admin error feed still showing the raw
    // message after this fix was supposedly already live.
    if (err.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return res.status(409).json({
        error:
          "This item has already been used on an invoice, quote, or purchase, so it can't be permanently deleted, that would break those existing documents. Rename it or change its price instead if something needs updating.",
      });
    }
    throw err;
  }
});

export default router;
