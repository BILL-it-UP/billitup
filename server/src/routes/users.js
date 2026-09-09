import express from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth, requireRole("owner", "admin"));

// List staff logins for the business (never returns password hashes)
router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT id, name, email, role, created_at FROM users WHERE business_id = ? ORDER BY created_at")
    .all(req.auth.businessId);
  res.json(rows);
});

// Owner/Admin creates an Admin or Cashier login. Not self-serve signup —
// staff never register themselves, matching how Zoho Books and similar tools gate this.
router.post("/", (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email and password are required" });
  }
  if (!["admin", "cashier"].includes(role)) {
    return res.status(400).json({ error: "role must be 'admin' or 'cashier'" });
  }
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(409).json({ error: "An account with that email already exists" });

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare("INSERT INTO users (business_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)")
    .run(req.auth.businessId, name, email, passwordHash, role);
  res.status(201).json({ id: result.lastInsertRowid, name, email, role });
});

router.delete("/:id", (req, res) => {
  const target = db.prepare("SELECT * FROM users WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!target) return res.status(404).json({ error: "Not found" });
  if (target.role === "owner") return res.status(400).json({ error: "The Owner login cannot be removed" });
  db.prepare("DELETE FROM users WHERE id = ?").run(target.id);
  res.status(204).end();
});

export default router;
