import express from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

// Simple manual time logging — a consultant logs hours against a customer,
// then pulls any not-yet-billed entries onto an invoice as line items from
// the New Invoice page (see db.js's time_entries table, and routes/invoices.js
// where time_entry_ids gets marked billed). Deliberately no start/stop
// timer UI — just a plain date + hours entry, matching how the rest of
// BillItUp favors a quick form over a stateful widget. Open to any logged-in
// role, same tier as recording a payment, since a Cashier may well be the
// one actually doing the billable work.
const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const rows = db
    .prepare(
      `SELECT time_entries.*, customers.name AS customer_name
       FROM time_entries LEFT JOIN customers ON customers.id = time_entries.customer_id
       WHERE time_entries.business_id = ? ORDER BY time_entries.entry_date DESC, time_entries.id DESC`
    )
    .all(req.auth.businessId);
  res.json(rows);
});

// Unbilled entries for one customer — used by the New Invoice page's "Add
// unbilled hours" picker.
router.get("/unbilled", (req, res) => {
  const { customer_id } = req.query;
  if (!customer_id) return res.status(400).json({ error: "customer_id is required" });
  const rows = db
    .prepare(
      `SELECT * FROM time_entries
       WHERE business_id = ? AND customer_id = ? AND billed = 0
       ORDER BY entry_date DESC`
    )
    .all(req.auth.businessId, customer_id);
  res.json(rows);
});

router.post("/", (req, res) => {
  const { customer_id, project_name, description, entry_date, hours, rate } = req.body;
  if (!entry_date) return res.status(400).json({ error: "entry_date is required" });
  const hrs = Number(hours) || 0;
  if (hrs <= 0) return res.status(400).json({ error: "hours must be a positive number" });

  const result = db
    .prepare(
      `INSERT INTO time_entries (business_id, customer_id, project_name, description, entry_date, hours, rate)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.auth.businessId, customer_id || null, project_name || null, description || null, entry_date, hrs, Number(rate) || 0);
  res.status(201).json(db.prepare("SELECT * FROM time_entries WHERE id = ?").get(result.lastInsertRowid));
});

// Only an entry that hasn't been billed yet can be edited/deleted — once
// it's on an invoice, that invoice's own line item is the record of it.
router.put("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM time_entries WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.billed) return res.status(400).json({ error: "This entry has already been billed on an invoice." });

  const { customer_id, project_name, description, entry_date, hours, rate } = req.body;
  db.prepare(
    `UPDATE time_entries SET
      customer_id = ?, project_name = ?, description = ?, entry_date = COALESCE(?, entry_date),
      hours = ?, rate = ?
     WHERE id = ?`
  ).run(
    customer_id === undefined ? existing.customer_id : (customer_id || null),
    project_name === undefined ? existing.project_name : project_name,
    description === undefined ? existing.description : description,
    entry_date,
    hours === undefined ? existing.hours : Number(hours) || 0,
    rate === undefined ? existing.rate : Number(rate) || 0,
    req.params.id
  );
  res.json(db.prepare("SELECT * FROM time_entries WHERE id = ?").get(req.params.id));
});

router.delete("/:id", (req, res) => {
  const existing = db.prepare("SELECT * FROM time_entries WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.billed) return res.status(400).json({ error: "This entry has already been billed on an invoice." });
  db.prepare("DELETE FROM time_entries WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

export default router;
