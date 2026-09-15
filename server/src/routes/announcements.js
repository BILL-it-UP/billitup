import express from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";

// The business side of announcements Naveen posts from Master Admin
// (2026-09-15) — creating one lives in routes/admin.js. Tracked per login
// (announcement_reads keyed on user_id), not per business, so each staff
// member sees a new announcement once on their own next visit rather than
// one person dismissing it for the whole firm.
const router = express.Router();
router.use(requireAuth);

router.get("/unread", (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.* FROM announcements a
       WHERE NOT EXISTS (
         SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = ?
       )
       ORDER BY a.created_at ASC`
    )
    .all(req.auth.userId);
  res.json(rows);
});

router.post("/:id/read", (req, res) => {
  db.prepare("INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)")
    .run(req.params.id, req.auth.userId);
  res.status(204).end();
});

export default router;
