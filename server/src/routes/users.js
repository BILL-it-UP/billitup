import express from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth, requireRole("owner", "admin"));

// List staff logins for the business (never returns password hashes)
router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT id, name, email, role, last_login_at, created_at FROM users WHERE business_id = ? ORDER BY created_at")
    .all(req.auth.businessId);
  res.json(rows);
});

// Recent login activity across the business — who logged in, when, and from
// where. Owner/Admin only (same gate as the rest of this router), so a
// business can see its own login history without any separate "master"
// tooling — useful on its own today, and the same shape a future admin
// dashboard could reuse.
router.get("/login-events", (req, res) => {
  const rows = db
    .prepare(
      `SELECT login_events.id, login_events.logged_in_at, login_events.ip_address, login_events.user_agent,
              users.id AS user_id, users.name, users.email, users.role
       FROM login_events
       JOIN users ON users.id = login_events.user_id
       WHERE login_events.business_id = ?
       ORDER BY login_events.logged_in_at DESC
       LIMIT 100`
    )
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
  db.prepare("INSERT INTO memberships (user_id, business_id, role) VALUES (?, ?, ?)")
    .run(result.lastInsertRowid, req.auth.businessId, role);
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
