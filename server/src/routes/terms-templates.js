import express from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

// Anyone who can create an invoice needs to read the template list (to fill
// the Terms & Conditions picker), but only Owner/Admin maintain it — same
// split as items.js.
router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM terms_templates WHERE business_id = ? ORDER BY is_default DESC, title")
    .all(req.auth.businessId);
  res.json(rows);
});

// Clearing every other default before setting a new one keeps "at most one
// default per business" true without a partial unique index — cheap since a
// business only ever has a handful of templates.
function clearOtherDefaults(businessId, keepId) {
  db.prepare("UPDATE terms_templates SET is_default = 0 WHERE business_id = ? AND id <> ?").run(businessId, keepId || 0);
}

router.post("/", requireRole("owner", "admin"), (req, res) => {
  const { title, content, is_default } = req.body;
  if (!title || !title.trim()) return res.status(400).json({ error: "Title is required" });
  if (!content || !content.trim()) return res.status(400).json({ error: "Content is required" });
  const result = db
    .prepare("INSERT INTO terms_templates (business_id, title, content, is_default) VALUES (?, ?, ?, ?)")
    .run(req.auth.businessId, title.trim(), content, is_default ? 1 : 0);
  const id = result.lastInsertRowid;
  if (is_default) clearOtherDefaults(req.auth.businessId, id);
  const created = db.prepare("SELECT * FROM terms_templates WHERE id = ?").get(id);
  res.status(201).json(created);
});

router.put("/:id", requireRole("owner", "admin"), (req, res) => {
  const existing = db.prepare("SELECT * FROM terms_templates WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  const { title, content, is_default } = req.body;
  db.prepare(
    "UPDATE terms_templates SET title = COALESCE(?, title), content = COALESCE(?, content), is_default = ? WHERE id = ? AND business_id = ?"
  ).run(
    title != null ? title.trim() : null,
    content != null ? content : null,
    is_default ? 1 : existing.is_default,
    req.params.id, req.auth.businessId
  );
  if (is_default) clearOtherDefaults(req.auth.businessId, req.params.id);
  const updated = db.prepare("SELECT * FROM terms_templates WHERE id = ?").get(req.params.id);
  res.json(updated);
});

router.delete("/:id", requireRole("owner", "admin"), (req, res) => {
  db.prepare("DELETE FROM terms_templates WHERE id = ? AND business_id = ?").run(req.params.id, req.auth.businessId);
  res.status(204).end();
});

export default router;
