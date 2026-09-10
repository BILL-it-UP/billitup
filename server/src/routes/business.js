import express from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

// Read own business profile/settings. Open to all roles (cashiers need e.g.
// inventory_enabled/default_paper_size), but SMTP credentials are stripped
// for anyone who isn't owner/admin — a cashier login has no reason to see
// the business's mail password.
router.get("/me", (req, res) => {
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  if (!business) return res.status(404).json({ error: "Not found" });
  if (req.auth.role !== "owner" && req.auth.role !== "admin") {
    const { smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from_name, smtp_from_email, ...safe } = business;
    return res.json(safe);
  }
  res.json(business);
});

// Onboarding / settings update: business type, inventory toggle, tax, paper size, branding
router.put("/me", requireRole("owner", "admin"), (req, res) => {
  const {
    name, business_type, address, phone, email, website, gstin,
    invoice_prefix, quote_prefix, credit_note_prefix, default_paper_size, inventory_enabled,
    smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from_name, smtp_from_email,
  } = req.body;

  db.prepare(
    `UPDATE businesses SET
      name = COALESCE(?, name),
      business_type = COALESCE(?, business_type),
      address = COALESCE(?, address),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      website = COALESCE(?, website),
      gstin = COALESCE(?, gstin),
      invoice_prefix = COALESCE(?, invoice_prefix),
      quote_prefix = COALESCE(?, quote_prefix),
      credit_note_prefix = COALESCE(?, credit_note_prefix),
      default_paper_size = COALESCE(?, default_paper_size),
      inventory_enabled = COALESCE(?, inventory_enabled),
      smtp_host = COALESCE(?, smtp_host),
      smtp_port = COALESCE(?, smtp_port),
      smtp_secure = COALESCE(?, smtp_secure),
      smtp_user = COALESCE(?, smtp_user),
      smtp_pass = COALESCE(?, smtp_pass),
      smtp_from_name = COALESCE(?, smtp_from_name),
      smtp_from_email = COALESCE(?, smtp_from_email)
    WHERE id = ?`
  ).run(
    name, business_type, address, phone, email, website, gstin,
    invoice_prefix, quote_prefix, credit_note_prefix, default_paper_size,
    inventory_enabled === undefined ? undefined : (inventory_enabled ? 1 : 0),
    smtp_host, smtp_port === undefined || smtp_port === "" ? smtp_port : Number(smtp_port),
    smtp_secure === undefined ? undefined : (smtp_secure ? 1 : 0),
    smtp_user, smtp_pass, smtp_from_name, smtp_from_email,
    req.auth.businessId
  );

  const updated = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  res.json(updated);
});

export default router;
