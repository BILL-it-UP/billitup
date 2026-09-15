import express from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

// A business's own side of the support chat with Naveen (2026-09-15) — the
// admin side of the same tables lives in routes/admin.js. Any logged-in
// role can raise a problem and reply, same as Suggestions, since anyone
// using the software day to day might be the one who hits something wrong.
const router = express.Router();
router.use(requireAuth);

function ticketWithCounts(ticketId) {
  return db
    .prepare(
      `SELECT t.*,
              (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id
                AND m.sender = 'admin' AND m.created_at > COALESCE(t.business_last_seen_at, '1970-01-01')) AS unread_count
       FROM support_tickets t WHERE t.id = ?`
    )
    .get(ticketId);
}

// Every ticket this business has raised, newest activity first, with how
// many of Naveen's replies haven't been seen yet.
router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*,
              (SELECT COUNT(*) FROM support_messages m WHERE m.ticket_id = t.id
                AND m.sender = 'admin' AND m.created_at > COALESCE(t.business_last_seen_at, '1970-01-01')) AS unread_count,
              (SELECT message FROM support_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS last_message
       FROM support_tickets t WHERE t.business_id = ? ORDER BY t.updated_at DESC`
    )
    .all(req.auth.businessId);
  res.json(rows);
});

// Raising a problem creates the ticket and its first message in one go —
// nobody wants to fill in a subject, save, then type the actual problem on
// a second screen.
router.post("/", (req, res) => {
  const { subject, message } = req.body || {};
  if (!subject || !subject.trim()) return res.status(400).json({ error: "subject is required" });
  if (!message || !message.trim()) return res.status(400).json({ error: "message is required" });

  const user = db.prepare("SELECT name FROM users WHERE id = ?").get(req.auth.userId);
  const result = db
    .prepare(`INSERT INTO support_tickets (business_id, subject) VALUES (?, ?)`)
    .run(req.auth.businessId, subject.trim());
  const ticketId = result.lastInsertRowid;
  db.prepare(`INSERT INTO support_messages (ticket_id, sender, sender_name, message) VALUES (?, 'business', ?, ?)`)
    .run(ticketId, user?.name || null, message.trim());
  res.status(201).json(ticketWithCounts(ticketId));
});

function loadOwnTicket(req, res) {
  const ticket = db
    .prepare("SELECT * FROM support_tickets WHERE id = ? AND business_id = ?")
    .get(req.params.id, req.auth.businessId);
  if (!ticket) {
    res.status(404).json({ error: "Not found" });
    return null;
  }
  return ticket;
}

// Opening the thread also marks it seen — the same "checked fresh, not
// cached" reasoning as everywhere else unread counts appear in BillItUp.
router.get("/:id/messages", (req, res) => {
  const ticket = loadOwnTicket(req, res);
  if (!ticket) return;
  const messages = db
    .prepare("SELECT * FROM support_messages WHERE ticket_id = ? ORDER BY created_at ASC")
    .all(ticket.id);
  db.prepare("UPDATE support_tickets SET business_last_seen_at = datetime('now') WHERE id = ?").run(ticket.id);
  res.json(messages);
});

// Replying to a ticket that Naveen had already marked resolved reopens it —
// he closed it because it looked handled; a new message from the business
// means it wasn't, and it shouldn't get lost in a "resolved" filter.
router.post("/:id/messages", (req, res) => {
  const ticket = loadOwnTicket(req, res);
  if (!ticket) return;
  const { message } = req.body || {};
  if (!message || !message.trim()) return res.status(400).json({ error: "message is required" });

  const user = db.prepare("SELECT name FROM users WHERE id = ?").get(req.auth.userId);
  db.prepare(`INSERT INTO support_messages (ticket_id, sender, sender_name, message) VALUES (?, 'business', ?, ?)`)
    .run(ticket.id, user?.name || null, message.trim());
  const nextStatus = ticket.status === "resolved" ? "open" : ticket.status;
  db.prepare("UPDATE support_tickets SET status = ?, updated_at = datetime('now'), business_last_seen_at = datetime('now') WHERE id = ?")
    .run(nextStatus, ticket.id);
  res.status(201).json(ticketWithCounts(ticket.id));
});

export default router;
