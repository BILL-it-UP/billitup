import express from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

// Read own business profile/settings
router.get("/me", (req, res) => {
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  res.json(business);
});

// Onboarding / settings update: business type, inventory toggle, tax, paper size, branding
router.put("/me", requireRole("owner", "admin"), (req, res) => {
  const {
    name, business_type, address, phone, email, website, gstin,
    invoice_prefix, default_paper_size, inventory_enabled,
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
      default_paper_size = COALESCE(?, default_paper_size),
      inventory_enabled = COALESCE(?, inventory_enabled)
    WHERE id = ?`
  ).run(
    name, business_type, address, phone, email, website, gstin,
    invoice_prefix, default_paper_size,
    inventory_enabled === undefined ? undefined : (inventory_enabled ? 1 : 0),
    req.auth.businessId
  );

  const updated = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  res.json(updated);
});

export default router;
