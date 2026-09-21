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
  const rows = db.prepare("SELECT * FROM vendors WHERE business_id = ? AND deleted_at IS NULL ORDER BY name").all(req.auth.businessId);
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
     WHERE id = ? AND business_id = ? AND deleted_at IS NULL`
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

// Trash — see items.js and db.js's deleted_at comment for the shared
// pattern: a plain delete now just hides the vendor, GET /trash lists what's
// hidden, /restore brings it back, and /permanent is the only route that
// actually removes the row (2026-09-20).
router.get("/trash", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM vendors WHERE business_id = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC")
    .all(req.auth.businessId);
  res.json(rows);
});

router.delete("/:id", (req, res) => {
  const result = db
    .prepare("UPDATE vendors SET deleted_at = datetime('now') WHERE id = ? AND business_id = ? AND deleted_at IS NULL")
    .run(req.params.id, req.auth.businessId);
  if (result.changes === 0) return res.status(404).json({ error: "Vendor not found." });
  res.status(204).end();
});

router.post("/:id/restore", (req, res) => {
  const result = db
    .prepare("UPDATE vendors SET deleted_at = NULL WHERE id = ? AND business_id = ? AND deleted_at IS NOT NULL")
    .run(req.params.id, req.auth.businessId);
  if (result.changes === 0) return res.status(404).json({ error: "Not found in trash" });
  res.json(db.prepare("SELECT * FROM vendors WHERE id = ?").get(req.params.id));
});

// Foreign keys are enforced (db.js turns them on), and purchases.vendor_id
// references vendors(id) with no ON DELETE rule — so a vendor that already
// has a purchase bill logged against them can't actually be permanently
// deleted; the query below throws instead. Caught here and turned into an
// honest message (2026-09-17, moved into /permanent 2026-09-20).
router.delete("/:id/permanent", (req, res) => {
  try {
    const result = db
      .prepare("DELETE FROM vendors WHERE id = ? AND business_id = ? AND deleted_at IS NOT NULL")
      .run(req.params.id, req.auth.businessId);
    if (result.changes === 0) return res.status(404).json({ error: "Not found in trash" });
    res.status(204).end();
  } catch (err) {
    // Same fix as items.js's permanent-delete route: the real SQLite extended
    // code is "SQLITE_CONSTRAINT_FOREIGNKEY" (no underscore before KEY), not
    // "SQLITE_CONSTRAINT_FOREIGN_KEY". This check never matched before, so
    // the friendly message below never actually fired (2026-09-20).
    if (err.code === "SQLITE_CONSTRAINT_FOREIGNKEY") {
      return res.status(409).json({
        error: "This vendor has purchase bills logged against them, so they can't be permanently deleted, that would break those existing records. Edit their details instead if something needs correcting.",
      });
    }
    throw err;
  }
});

export default router;
