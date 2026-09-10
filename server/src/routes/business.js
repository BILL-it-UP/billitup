import express from "express";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();
router.use(requireAuth);

// Read own business profile/settings. Open to all roles (staff need the
// branding/prefix fields to raise invoices), but SMTP credentials are
// stripped for anyone who isn't owner/admin — staff have no reason to see
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

// Settings update: profile, tax, numbering prefixes, SMTP, and invoice branding.
router.put("/me", requireRole("owner", "admin"), (req, res) => {
  const {
    name, address, phone, email, website, gstin,
    invoice_prefix, quote_prefix, credit_note_prefix,
    smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from_name, smtp_from_email,
    logo_data_url, bank_account_name, bank_name, bank_account_number, bank_ifsc, bank_upi_id,
    terms_and_conditions, signature_data_url, signature_name,
  } = req.body;

  db.prepare(
    `UPDATE businesses SET
      name = COALESCE(?, name),
      address = COALESCE(?, address),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      website = COALESCE(?, website),
      gstin = COALESCE(?, gstin),
      invoice_prefix = COALESCE(?, invoice_prefix),
      quote_prefix = COALESCE(?, quote_prefix),
      credit_note_prefix = COALESCE(?, credit_note_prefix),
      smtp_host = COALESCE(?, smtp_host),
      smtp_port = COALESCE(?, smtp_port),
      smtp_secure = COALESCE(?, smtp_secure),
      smtp_user = COALESCE(?, smtp_user),
      smtp_pass = COALESCE(?, smtp_pass),
      smtp_from_name = COALESCE(?, smtp_from_name),
      smtp_from_email = COALESCE(?, smtp_from_email),
      logo_data_url = COALESCE(?, logo_data_url),
      bank_account_name = COALESCE(?, bank_account_name),
      bank_name = COALESCE(?, bank_name),
      bank_account_number = COALESCE(?, bank_account_number),
      bank_ifsc = COALESCE(?, bank_ifsc),
      bank_upi_id = COALESCE(?, bank_upi_id),
      terms_and_conditions = COALESCE(?, terms_and_conditions),
      signature_data_url = COALESCE(?, signature_data_url),
      signature_name = COALESCE(?, signature_name)
    WHERE id = ?`
  ).run(
    name, address, phone, email, website, gstin,
    invoice_prefix, quote_prefix, credit_note_prefix,
    smtp_host, smtp_port === undefined || smtp_port === "" ? smtp_port : Number(smtp_port),
    smtp_secure === undefined ? undefined : (smtp_secure ? 1 : 0),
    smtp_user, smtp_pass, smtp_from_name, smtp_from_email,
    logo_data_url, bank_account_name, bank_name, bank_account_number, bank_ifsc, bank_upi_id,
    terms_and_conditions, signature_data_url, signature_name,
    req.auth.businessId
  );

  const updated = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  res.json(updated);
});

export default router;
