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

// SQLite stores these as "datetime('now')" strings — space-separated, UTC,
// no timezone marker. Same parsing rule the client's formatDateTime uses, so
// "how long ago" comes out the same everywhere.
function parseDbDate(value) {
  if (!value) return null;
  const iso = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

// Naveen asked for issues to be "easy to point out" rather than something he
// has to read every row to notice (2026-09-15). Computed once here, server
// side, so the businesses list and any future admin view agree on exactly
// what counts as "needs attention" instead of each screen guessing its own
// rule. Three reasons for now: no way to reach the business at all, gone
// quiet (never logged in past their first few days, or not in 30+), and a
// connected cloud backup that's actually failing (worse than not connecting
// one at all, since it looks safe but isn't).
function attentionReasons(b) {
  const reasons = [];
  if (!b.owner_email && !b.owner_phone) reasons.push("no_contact");
  const lastLoginMs = parseDbDate(b.last_login_at);
  const createdMs = parseDbDate(b.created_at);
  const now = Date.now();
  const wentQuiet = lastLoginMs == null
    ? createdMs != null && now - createdMs > THREE_DAYS_MS
    : now - lastLoginMs > THIRTY_DAYS_MS;
  if (wentQuiet) reasons.push("inactive");
  if (b.cloud_backup_status === "error") reasons.push("backup_error");
  return reasons;
}

// Lists every business with its id and current plan, plus enough context —
// contact details, activity, and how much real invoicing they've actually
// done — that Naveen can tell a real, active business apart from a dead
// signup, and reach out to one, without opening the database directly.
// Expanded 2026-09-15 (previously just id/name/plan/created_at/user_count/
// invoice_count/last_login_at — Naveen said he had "very few details" about
// who's using the software): the contact fields already exist on every
// business (set in Settings > Business Profile), they just weren't surfaced
// here before. owner_email/owner_phone fall back to null for a business
// whose owner never filled in Business Profile, same as before.
router.get("/businesses", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  const rows = db
    .prepare(
      `SELECT b.id, b.name, b.plan, b.created_at,
              b.email AS owner_email, b.phone AS owner_phone, b.gstin, b.state,
              (SELECT COUNT(*) FROM users u WHERE u.business_id = b.id) AS user_count,
              (SELECT COUNT(*) FROM customers c WHERE c.business_id = b.id) AS customer_count,
              (SELECT COUNT(*) FROM invoices i WHERE i.business_id = b.id) AS invoice_count,
              (SELECT COALESCE(SUM(i.total), 0) FROM invoices i WHERE i.business_id = b.id) AS invoiced_total,
              (SELECT MAX(le.logged_in_at) FROM login_events le WHERE le.business_id = b.id) AS last_login_at,
              CASE
                WHEN EXISTS(SELECT 1 FROM cloud_backup_connections cbc WHERE cbc.business_id = b.id AND cbc.last_upload_status = 'error') THEN 'error'
                WHEN EXISTS(SELECT 1 FROM cloud_backup_connections cbc WHERE cbc.business_id = b.id) THEN 'connected'
                ELSE 'none'
              END AS cloud_backup_status
       FROM businesses b
       ORDER BY b.created_at DESC`
    )
    .all();
  res.json(rows.map((b) => ({ ...b, attention: attentionReasons(b) })));
});

// One business's own users — who's actually logging in under that business,
// not just how many. Naveen asked for more detail than the aggregate
// user_count on the businesses list gives; this is the drill-down.
router.get("/businesses/:id/users", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  const rows = db
    .prepare(
      `SELECT id, name, email, role, last_login_at, created_at
       FROM users WHERE business_id = ? ORDER BY created_at ASC`
    )
    .all(req.params.id);
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
