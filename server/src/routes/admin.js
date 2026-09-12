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

// Lists every business with its id and current plan, so you can look up
// which id to use for set-plan below without opening the database directly.
router.get("/businesses", (req, res) => {
  if (!checkAdminSecret(req, res)) return;
  const rows = db.prepare("SELECT id, name, plan, created_at FROM businesses ORDER BY created_at DESC").all();
  res.json(rows);
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
