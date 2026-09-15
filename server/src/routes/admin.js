import express from "express";
import { db } from "../db.js";

// A tiny manual lever for moving a business between the free and premium
// plans. There's no payment processor wired up yet — Naveen gets paid
// directly (bank transfer, UPI, etc.) and then flips the plan by hand with
// one command. Guarded by ADMIN_SECRET (set in server/.env) rather than a
// user login, since this is meant to be run from a terminal, not the app —
// and it works the same way no matter which business or login is involved.
//
// If ADMIN_SECRET isn't set on this server, every request here is refused —
// there is no default secret and no way to use this route until one is set.
const router = express.Router();

function checkAdminSecret(req, res) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    res.status(503).json({ error: "ADMIN_SECRET is not set on this server. Add it to server/.env and restart before using this." });
    return false;
  }
  const provided = req.headers["x-admin-secret"];
  if (!provided || provided !== adminSecret) {
    res.status(401).json({ error: "Invalid admin secret" });
    return false;
  }
  return true;
}

// Lists every business with its id and current plan, plus enough activity
// context (how many users/invoices it has, and when someone last actually
// logged in) that Naveen can tell a real, active install apart from a dead
// signup without opening the database directly.
router.get("/businesses", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  const rows = db
    .prepare(
      `SELECT b.id, b.name, b.plan, b.created_at,
              (SELECT COUNT(*) FROM users u WHERE u.business_id = b.id) AS user_count,
              (SELECT COUNT(*) FROM invoices i WHERE i.business_id = b.id) AS invoice_count,
              (SELECT MAX(le.logged_in_at) FROM login_events le WHERE le.business_id = b.id) AS last_login_at
       FROM businesses b
       ORDER BY b.created_at DESC`
    )
    .all();
  res.json(rows);
});

// One glance at how the whole install is doing — every business, whether
// people are actually signing in, and how much feedback is waiting to be
// read. Naveen asked for "a place to see all" logged-in users and how the
// software is being used; this is that place.
router.get("/stats", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  const count = (sql, ...params) => db.prepare(sql).get(...params).n;
  res.json({
    totalBusinesses: count("SELECT COUNT(*) AS n FROM businesses"),
    newBusinesses7d: count("SELECT COUNT(*) AS n FROM businesses WHERE created_at >= datetime('now', '-7 days')"),
    totalUsers: count("SELECT COUNT(*) AS n FROM users"),
    totalInvoices: count("SELECT COUNT(*) AS n FROM invoices"),
    loginsToday: count("SELECT COUNT(*) AS n FROM login_events WHERE date(logged_in_at) = date('now')"),
    loginsThisWeek: count("SELECT COUNT(*) AS n FROM login_events WHERE logged_in_at >= datetime('now', '-7 days')"),
    activeBusinesses30d: count(
      "SELECT COUNT(DISTINCT business_id) AS n FROM login_events WHERE logged_in_at >= datetime('now', '-30 days')"
    ),
    openSuggestions: count("SELECT COUNT(*) AS n FROM suggestions WHERE status = 'open'"),
  });
});

// Every suggestion from every business in one feed, newest first, with the
// business name attached — the per-business /api/suggestions route (see
// routes/suggestions.js) only ever shows one business its own feedback, so
// this is the only place Naveen can read what everyone is saying at once.
router.get("/suggestions", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  const rows = db
    .prepare(
      `SELECT s.*, b.name AS business_name
       FROM suggestions s
       JOIN businesses b ON b.id = s.business_id
       ORDER BY s.created_at DESC`
    )
    .all();
  res.json(rows);
});

router.put("/suggestions/:id/status", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  const { status } = req.body || {};
  if (!["open", "done"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  db.prepare("UPDATE suggestions SET status = ? WHERE id = ?").run(status, req.params.id);
  const updated = db
    .prepare(
      `SELECT s.*, b.name AS business_name FROM suggestions s JOIN businesses b ON b.id = s.business_id WHERE s.id = ?`
    )
    .get(req.params.id);
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

router.delete("/suggestions/:id", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  db.prepare("DELETE FROM suggestions WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

router.post("/set-plan", (req, res) => {
  if (!checkAdminSecret(req, res)) return;

  const { businessId, plan } = req.body || {};
  if (!businessId || !["free", "premium"].includes(plan)) {
    return res.status(400).json({ error: "businessId and plan ('free' or 'premium') are required" });
  }

  const business = db.prepare("SELECT id FROM businesses WHERE id = ?").get(businessId);
  if (!business) return res.status(404).json({ error: "No business with that id" });

  db.prepare("UPDATE businesses SET plan = ? WHERE id = ?").run(plan, businessId);
  const updated = db.prepare("SELECT id, name, plan FROM businesses WHERE id = ?").get(businessId);
  res.json({ ok: true, business: updated });
});

export default router;
