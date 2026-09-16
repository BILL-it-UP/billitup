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
  if (b.open_error_count > 0) reasons.push("has_errors");
  if (b.open_ticket_count > 0) reasons.push("has_open_ticket");
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
              END AS cloud_backup_status,
              (SELECT COUNT(*) FROM error_log e WHERE e.business_id = b.id AND e.status = 'open') AS open_error_count,
              (SELECT COUNT(*) FROM support_tickets t WHERE t.business_id = b.id AND t.status != 'resolved') AS open_ticket_count
       FROM businesses b
       ORDER BY b.created_at DESC`
    )
    .all();
  res.json(rows.map((b) => ({ ...b, attention: attentionReasons(b) })));
});

// One business's full profile for the Business Health page — includes the
// logo (Naveen asked to see uploaded images so a business is recognizable
// at a glance while diagnosing), and the same activity/contact figures the
// businesses list shows, so this one page is genuinely "the entire thing"
// for a business and the separate "Details" row on the list can go away
// (2026-09-16). Never anything from their actual client data (customers,
// invoices, and so on stay off this route as real rows — only the counts).
router.get("/businesses/:id", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  const business = db
    .prepare(
      `SELECT b.id, b.name, b.plan, b.created_at,
              b.email AS owner_email, b.phone AS owner_phone, b.gstin, b.state,
              b.logo_data_url, b.signature_data_url,
              (SELECT COUNT(*) FROM customers c WHERE c.business_id = b.id) AS customer_count,
              (SELECT COUNT(*) FROM invoices i WHERE i.business_id = b.id) AS invoice_count,
              (SELECT COALESCE(SUM(i.total), 0) FROM invoices i WHERE i.business_id = b.id) AS invoiced_total,
              (SELECT MAX(le.logged_in_at) FROM login_events le WHERE le.business_id = b.id) AS last_login_at,
              CASE
                WHEN EXISTS(SELECT 1 FROM cloud_backup_connections cbc WHERE cbc.business_id = b.id AND cbc.last_upload_status = 'error') THEN 'error'
                WHEN EXISTS(SELECT 1 FROM cloud_backup_connections cbc WHERE cbc.business_id = b.id) THEN 'connected'
                ELSE 'none'
              END AS cloud_backup_status,
              (SELECT COUNT(*) FROM error_log e WHERE e.business_id = b.id AND e.status = 'open') AS open_error_count,
              (SELECT COUNT(*) FROM support_tickets t WHERE t.business_id = b.id AND t.status != 'resolved') AS open_ticket_count
       FROM businesses b WHERE b.id = ?`
    )
    .get(req.params.id);
  if (!business) return res.status(404).json({ error: "Not found" });
  res.json({ ...business, attention: attentionReasons(business) });
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

// The "doctor's chart" for one business — every technical error tied to
// their requests, newest first, never anything from the error's own request
// body or a stack trace (see lib/errorLog.js for why). This is what the
// Business Health page's Errors section reads.
router.get("/businesses/:id/errors", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  const rows = db
    .prepare("SELECT * FROM error_log WHERE business_id = ? ORDER BY created_at DESC")
    .all(req.params.id);
  res.json(rows);
});

// Marking an error resolved (with an optional note on how) is the "history
// of problem, status, and how we solved it" Naveen asked for — the row
// itself becomes that history entry rather than needing a separate log.
router.put("/errors/:id", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  const { status, resolution_notes } = req.body || {};
  if (!["open", "resolved"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  db.prepare(
    `UPDATE error_log SET status = ?, resolution_notes = ?, resolved_at = CASE WHEN ? = 'resolved' THEN datetime('now') ELSE NULL END
     WHERE id = ?`
  ).run(status, resolution_notes || null, status, req.params.id);
  const updated = db.prepare("SELECT * FROM error_log WHERE id = ?").get(req.params.id);
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

// One business's own support thread(s) — shown on their Business Health
// page alongside the error log, so Naveen sees both what broke and what
// they actually told him about it in one place.
router.get("/businesses/:id/tickets", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  const rows = db
    .prepare(
      `SELECT t.*,
              (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id
                AND m.sender = 'business' AND m.created_at > COALESCE(t.admin_last_seen_at, '1970-01-01')) AS unread_count
       FROM support_tickets t WHERE t.business_id = ? ORDER BY t.updated_at DESC`
    )
    .all(req.params.id);
  res.json(rows);
});

// Every open conversation across every business, in one feed — the admin
// equivalent of a support inbox, so Naveen doesn't have to open each
// business's page just to see who's waiting on a reply.
router.get("/support/tickets", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  const rows = db
    .prepare(
      `SELECT t.*, b.name AS business_name,
              (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id
                AND m.sender = 'business' AND m.created_at > COALESCE(t.admin_last_seen_at, '1970-01-01')) AS unread_count,
              (SELECT message FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
       FROM support_tickets t JOIN businesses b ON b.id = t.business_id
       ORDER BY t.updated_at DESC`
    )
    .all();
  res.json(rows);
});

router.get("/support/tickets/:id/messages", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  const messages = db
    .prepare("SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY created_at ASC")
    .all(req.params.id);
  db.prepare("UPDATE support_tickets SET admin_last_seen_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json(messages);
});

router.post("/support/tickets/:id/messages", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  const { message } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ error: "message is required" });
  const ticket = db.prepare("SELECT id FROM support_tickets WHERE id = ?").get(req.params.id);
  if (!ticket) return res.status(404).json({ error: "Not found" });
  db.prepare(`INSERT INTO support_messages (ticket_id, sender, sender_name, message) VALUES (?, 'admin', 'Naveen', ?)`)
    .run(ticket.id, message.trim());
  // A reply usually means work has started, not that it's already resolved
  // — Naveen sets that explicitly with the status route below once it is.
  db.prepare("UPDATE support_tickets SET status = CASE WHEN status = 'open' THEN 'in_progress' ELSE status END, updated_at = datetime('now'), admin_last_seen_at = datetime('now') WHERE id = ?")
    .run(ticket.id);
  const messages = db.prepare("SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY created_at ASC").all(ticket.id);
  res.status(201).json(messages);
});

router.put("/support/tickets/:id/status", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  const { status } = req.body || {};
  if (!["open", "in_progress", "resolved"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  db.prepare("UPDATE support_tickets SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
  const updated = db.prepare("SELECT * FROM support_tickets WHERE id = ?").get(req.params.id);
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

// Announcements — Naveen writes one here, every business sees it as a
// popup on their next visit (see routes/announcements.js for their side).
router.get("/announcements", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  res.json(db.prepare("SELECT * FROM announcements ORDER BY created_at DESC").all());
});

router.post("/announcements", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  const { title, message } = req.body || {};
  if (!title || !title.trim()) return res.status(400).json({ error: "title is required" });
  if (!message || !message.trim()) return res.status(400).json({ error: "message is required" });
  const result = db
    .prepare("INSERT INTO announcements (title, message) VALUES (?, ?)")
    .run(title.trim(), message.trim());
  res.status(201).json(db.prepare("SELECT * FROM announcements WHERE id = ?").get(result.lastInsertRowid));
});

router.delete("/announcements/:id", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  db.prepare("DELETE FROM announcements WHERE id = ?").run(req.params.id);
  res.status(204).end();
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
    openErrors: count("SELECT COUNT(*) AS n FROM error_log WHERE status = 'open'"),
    openSupportTickets: count("SELECT COUNT(*) AS n FROM support_tickets WHERE status != 'resolved'"),
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
