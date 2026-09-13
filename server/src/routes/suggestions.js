import express from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

// Kept in sync with client/src/components/SuggestionBox.jsx's dropdown —
// a fixed, small list so the review page can group by area at a glance
// instead of everything landing in one undifferentiated pile.
export const SUGGESTION_CATEGORIES = [
  "Invoices", "Quotes", "Credit Notes", "Customers", "Items",
  "Vendors & Purchases", "Payments", "Reports", "Settings", "Other",
];

// Any logged-in role (Owner, Admin, or Cashier) can submit a suggestion —
// this is meant to capture feedback from whoever actually uses the software
// day to day, not just the business owner.
router.post("/", (req, res) => {
  const { message, category } = req.body;
  if (!message || !message.trim()) return res.status(400).json({ error: "message is required" });
  const finalCategory = SUGGESTION_CATEGORIES.includes(category) ? category : "Other";
  const user = db.prepare("SELECT name FROM users WHERE id = ?").get(req.auth.userId);
  const result = db
    .prepare(`INSERT INTO suggestions (business_id, user_id, user_name, message, category) VALUES (?, ?, ?, ?, ?)`)
    .run(req.auth.businessId, req.auth.userId, user?.name || null, message.trim(), finalCategory);
  res.status(201).json(db.prepare("SELECT * FROM suggestions WHERE id = ?").get(result.lastInsertRowid));
});

// Reviewing the list is Owner/Admin only — same as every other "runs the
// business" view (Reports, Vendors, Purchases).
router.get("/", requireRole("owner", "admin"), (req, res) => {
  const rows = db
    .prepare("SELECT * FROM suggestions WHERE business_id = ? ORDER BY created_at DESC")
    .all(req.auth.businessId);
  res.json(rows);
});

router.put("/:id/status", requireRole("owner", "admin"), (req, res) => {
  const { status } = req.body;
  if (!["open", "done"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  db.prepare("UPDATE suggestions SET status = ? WHERE id = ? AND business_id = ?").run(status, req.params.id, req.auth.businessId);
  const updated = db.prepare("SELECT * FROM suggestions WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

router.delete("/:id", requireRole("owner", "admin"), (req, res) => {
  db.prepare("DELETE FROM suggestions WHERE id = ? AND business_id = ?").run(req.params.id, req.auth.businessId);
  res.status(204).end();
});

export default router;
