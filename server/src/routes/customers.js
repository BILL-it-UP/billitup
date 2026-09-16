import express from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { sendPortalInviteEmail } from "./portalAuth.js";
import { SmtpNotConfiguredError } from "../lib/mailer.js";
import { normalizeEmail } from "../lib/normalizeEmail.js";

const router = express.Router();
router.use(requireAuth);

// portal_password_hash never leaves the server — everything else about
// portal status is collapsed into one status string the client can just
// display, instead of every page re-deriving it from three raw columns:
//   no_email — can't turn the portal on, there's nowhere to send the invite
//   off      — turned off (or never turned on); portal_password_hash may
//              still be set underneath from before, which is exactly why
//              turning it back on doesn't ask the client to set a new one
//   invited  — on, but the client hasn't set a password yet
//   active   — on, and the client can log in
function portalStatus(customer) {
  if (customer.portal_enabled) return customer.portal_password_hash ? "active" : "invited";
  return customer.email ? "off" : "no_email";
}

function withPortalStatus(customer) {
  const { portal_password_hash, ...rest } = customer;
  return { ...rest, portal_status: portalStatus(customer) };
}

router.get("/", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM customers WHERE business_id = ? ORDER BY name")
    .all(req.auth.businessId);
  res.json(rows.map(withPortalStatus));
});

// Cashiers can look up customers to bill against, but only Owner/Admin
// maintain the customer master list (edits here affect every future invoice).
router.post("/", requireRole("owner", "admin"), (req, res) => {
  const { name, phone, billing_address, shipping_address, pincode, country, gstin, state } = req.body;
  // Normalized (trimmed + lowercased) before it's ever stored — see
  // lib/normalizeEmail.js. Without this, a stray trailing space or a
  // capital letter here silently breaks the customer's portal login later,
  // since login matches on this exact stored value.
  const email = normalizeEmail(req.body.email);
  if (!name) return res.status(400).json({ error: "name is required" });
  const portalToken = randomUUID().replace(/-/g, "");
  const result = db
    .prepare(
      `INSERT INTO customers (business_id, name, phone, email, billing_address, shipping_address, pincode, country, gstin, state, portal_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.auth.businessId, name, phone, email, billing_address, shipping_address, pincode || null, country || "India", gstin, state || null, portalToken);
  const created = db.prepare("SELECT * FROM customers WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(withPortalStatus(created));
});

router.put("/:id", requireRole("owner", "admin"), (req, res) => {
  const { name, phone, billing_address, shipping_address, pincode, country, gstin, state } = req.body;
  const email = normalizeEmail(req.body.email);
  db.prepare(
    `UPDATE customers SET
      name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email),
      billing_address = COALESCE(?, billing_address), shipping_address = COALESCE(?, shipping_address),
      pincode = COALESCE(?, pincode), country = COALESCE(?, country),
      gstin = COALESCE(?, gstin), state = COALESCE(?, state)
     WHERE id = ? AND business_id = ?`
  ).run(name, phone, email, billing_address, shipping_address, pincode, country, gstin, state, req.params.id, req.auth.businessId);
  const updated = db.prepare("SELECT * FROM customers WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(withPortalStatus(updated));
});

router.delete("/:id", requireRole("owner", "admin"), (req, res) => {
  db.prepare("DELETE FROM customers WHERE id = ? AND business_id = ?").run(req.params.id, req.auth.businessId);
  res.status(204).end();
});

// Turn a customer's portal access on or off. Turning it on when they don't
// have a password yet regenerates their one-time link and emails it;
// turning it on when they already have one (they had access before and it
// was switched off) just restores access immediately, no email needed —
// same password as before. Turning it off doesn't touch the password hash
// at all, it only flips the switch that requireCustomerAuth checks on every
// portal request, so an already-logged-in client is cut off right away.
router.put("/:id/portal", requireRole("owner", "admin"), async (req, res) => {
  const { enabled } = req.body;
  const customer = db.prepare("SELECT * FROM customers WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!customer) return res.status(404).json({ error: "Not found" });

  if (!enabled) {
    db.prepare("UPDATE customers SET portal_enabled = 0 WHERE id = ?").run(customer.id);
    return res.json(withPortalStatus({ ...customer, portal_enabled: 0 }));
  }

  if (!customer.email) {
    return res.status(400).json({ error: "Add an email address for this customer first." });
  }

  if (customer.portal_password_hash) {
    // Already had a password from before — just switch access back on.
    db.prepare("UPDATE customers SET portal_enabled = 1 WHERE id = ?").run(customer.id);
    return res.json(withPortalStatus({ ...customer, portal_enabled: 1 }));
  }

  const inviteToken = randomUUID().replace(/-/g, "");
  db.prepare("UPDATE customers SET portal_enabled = 1, portal_token = ? WHERE id = ?").run(inviteToken, customer.id);
  const updated = { ...customer, portal_enabled: 1, portal_token: inviteToken };
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);

  try {
    await sendPortalInviteEmail({ business, customer, token: inviteToken, isReset: false });
    res.json(withPortalStatus(updated));
  } catch (err) {
    // Portal access is still turned on even if the email couldn't be sent —
    // most likely SMTP just isn't configured yet on a fresh self-hosted
    // install. Hand back the raw link so it can be shared by hand instead of
    // silently leaving the customer with no way to actually get in.
    const inviteLink = `${(process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "")}/portal/set-password/${inviteToken}`;
    if (err instanceof SmtpNotConfiguredError) {
      res.json({ ...withPortalStatus(updated), invite_link: inviteLink, email_warning: "Portal access is on, but email isn't set up yet — share this link with the customer yourself." });
    } else {
      console.error("Failed to send portal invite email:", err);
      res.json({ ...withPortalStatus(updated), invite_link: inviteLink, email_warning: "Portal access is on, but the invite email failed to send — share this link with the customer yourself." });
    }
  }
});

// Re-send the set/reset-password link — for a pending invite that never
// arrived, or as a "forgot password" reset for a customer who's already
// active. Regenerates the token either way, invalidating any earlier link.
router.post("/:id/portal/resend-invite", requireRole("owner", "admin"), async (req, res) => {
  const customer = db.prepare("SELECT * FROM customers WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!customer) return res.status(404).json({ error: "Not found" });
  if (!customer.portal_enabled) return res.status(400).json({ error: "Turn portal access on first." });
  if (!customer.email) return res.status(400).json({ error: "This customer has no email address." });

  const inviteToken = randomUUID().replace(/-/g, "");
  db.prepare("UPDATE customers SET portal_token = ? WHERE id = ?").run(inviteToken, customer.id);
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  const isReset = !!customer.portal_password_hash;

  try {
    await sendPortalInviteEmail({ business, customer, token: inviteToken, isReset });
    res.json({ message: "Invite sent." });
  } catch (err) {
    const inviteLink = `${(process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "")}/portal/set-password/${inviteToken}`;
    if (err instanceof SmtpNotConfiguredError) {
      res.json({ invite_link: inviteLink, email_warning: "Email isn't set up yet — share this link with the customer yourself." });
    } else {
      console.error("Failed to send portal invite email:", err);
      res.json({ invite_link: inviteLink, email_warning: "The invite email failed to send — share this link with the customer yourself." });
    }
  }
});

// Manually add or deduct from a customer's prepaid retainer balance — e.g.
// when they pay a retainer invoice, or as a correction. A future invoice
// can then draw down against this via invoices.retainer_applied (see
// routes/invoices.js). Deliberately manual rather than trying to auto-link
// this to a specific invoice's payment, since a retainer top-up doesn't
// have to come from an invoice at all (2026-09-16).
router.post("/:id/retainer", requireRole("owner", "admin"), (req, res) => {
  const customer = db.prepare("SELECT * FROM customers WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!customer) return res.status(404).json({ error: "Not found" });
  const { amount, type, note } = req.body;
  const amt = Math.abs(Number(amount) || 0);
  if (!amt) return res.status(400).json({ error: "amount must be a positive number" });
  if (!["credit", "debit"].includes(type)) return res.status(400).json({ error: "type must be 'credit' or 'debit'" });

  const delta = type === "credit" ? amt : -amt;
  db.transaction(() => {
    db.prepare("UPDATE customers SET retainer_balance = retainer_balance + ? WHERE id = ?").run(delta, customer.id);
    db.prepare(
      "INSERT INTO retainer_transactions (business_id, customer_id, amount, type, note) VALUES (?, ?, ?, ?, ?)"
    ).run(req.auth.businessId, customer.id, amt, type, note || null);
  })();

  const updated = db.prepare("SELECT * FROM customers WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  res.json(withPortalStatus(updated));
});

router.get("/:id/retainer-transactions", requireRole("owner", "admin"), (req, res) => {
  const customer = db.prepare("SELECT id FROM customers WHERE id = ? AND business_id = ?").get(req.params.id, req.auth.businessId);
  if (!customer) return res.status(404).json({ error: "Not found" });
  const rows = db
    .prepare("SELECT * FROM retainer_transactions WHERE customer_id = ? ORDER BY created_at DESC")
    .all(customer.id);
  res.json(rows);
});

export default router;
