import express from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { requireAuth, requireRole, signToken } from "../middleware/auth.js";
import { buildTransport, SmtpNotConfiguredError } from "../lib/mailer.js";
import { runBackup, getBackupStatus } from "../lib/backup.js";

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
    reset_invoice_numbering_yearly,
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
      signature_name = COALESCE(?, signature_name),
      reset_invoice_numbering_yearly = COALESCE(?, reset_invoice_numbering_yearly)
    WHERE id = ?`
  ).run(
    name, address, phone, email, website, gstin,
    invoice_prefix, quote_prefix, credit_note_prefix,
    smtp_host, smtp_port === undefined || smtp_port === "" ? smtp_port : Number(smtp_port),
    smtp_secure === undefined ? undefined : (smtp_secure ? 1 : 0),
    smtp_user, smtp_pass, smtp_from_name, smtp_from_email,
    logo_data_url, bank_account_name, bank_name, bank_account_number, bank_ifsc, bank_upi_id,
    terms_and_conditions, signature_data_url, signature_name,
    reset_invoice_numbering_yearly === undefined ? undefined : (reset_invoice_numbering_yearly ? 1 : 0),
    req.auth.businessId
  );

  const updated = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  res.json(updated);
});

// Lets an owner/admin self-test their SMTP settings without going through
// Claude or anyone else — sends a plain test email using whatever is
// currently SAVED for this business (save the form first, then test), and
// surfaces the real SMTP error (bad password, wrong host, etc.) straight
// from nodemailer so it's actually useful for debugging.
router.post("/test-email", requireRole("owner", "admin"), async (req, res) => {
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  const to = (req.body && req.body.to) || business.smtp_from_email || business.email;
  if (!to) return res.status(400).json({ error: "Enter an email address to send the test to" });

  try {
    const transport = buildTransport(business);
    const fromEmail = business.smtp_from_email || business.smtp_user;
    const fromName = business.smtp_from_name || business.name || "BillItUp";
    await transport.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject: "BillItUp test email",
      text: `This is a test email from BillItUp, sent using ${business.name || "your business"}'s SMTP settings.\n\nIf you're reading this, email delivery is working — invoices, quotes, and payment reminders will reach your customers.`,
    });
    res.json({ ok: true, sentTo: to });
  } catch (err) {
    if (err instanceof SmtpNotConfiguredError) return res.status(400).json({ error: err.message });
    // Surface nodemailer's actual error (e.g. "Invalid login", "ECONNREFUSED")
    // rather than a generic message — that's the whole point of a self-serve
    // test button: the business owner can fix it themselves.
    res.status(400).json({ error: err.message || "Failed to send test email" });
  }
});

// Backups apply to the whole install (one shared SQLite file, not scoped per
// business the way most of this API is), so — like Staff Logins and adding
// another firm — this is owner-only, not admin.
router.get("/backup-status", requireRole("owner"), (_req, res) => {
  res.json(getBackupStatus());
});

router.post("/backup-now", requireRole("owner"), async (_req, res) => {
  try {
    const status = await runBackup();
    res.json(status);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "Backup failed" });
  }
});

// Self-service "delete this business" — Owner only. Removes every row this
// business owns across every table, then cleans up the login(s) that only
// ever had access to this one business. Guarded by password + typing the
// business's exact name (same double-confirmation pattern as GitHub's repo
// deletion), since there's no undo and no support desk to appeal to.
//
// Most tables reference businesses.id / invoices.id etc WITHOUT
// ON DELETE CASCADE (see db.js), so this deletes in a careful, explicit
// order: payments before invoices, quotes/credit notes before invoices
// (they point at invoices, not the other way round), and — since invoices
// and recurring_invoices point at EACH OTHER (invoices.recurring_invoice_id
// / recurring_invoices.last_generated_invoice_id) — that one circular
// reference is broken with an UPDATE ... SET ... = NULL before either side
// is deleted.
router.post("/delete", requireRole("owner"), (req, res) => {
  const { password, confirmBusinessName } = req.body;
  const businessId = req.auth.businessId;

  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(businessId);
  if (!business) return res.status(404).json({ error: "Not found" });

  const requester = db.prepare("SELECT * FROM users WHERE id = ?").get(req.auth.userId);
  if (!requester || !bcrypt.compareSync(password || "", requester.password_hash)) {
    return res.status(401).json({ error: "Incorrect password" });
  }
  if ((confirmBusinessName || "").trim() !== business.name) {
    return res.status(400).json({ error: "Business name doesn't match — type it exactly as shown to confirm" });
  }

  const result = db.transaction(() => {
    // Break the invoices <-> recurring_invoices cycle first so neither side
    // blocks deleting the other.
    db.prepare("UPDATE invoices SET recurring_invoice_id = NULL WHERE business_id = ?").run(businessId);
    db.prepare("UPDATE recurring_invoices SET last_generated_invoice_id = NULL WHERE business_id = ?").run(businessId);

    db.prepare("DELETE FROM payments WHERE invoice_id IN (SELECT id FROM invoices WHERE business_id = ?)").run(businessId);
    // Quotes/credit notes point AT invoices — delete them first so nothing
    // is left referencing an invoice row that's about to disappear.
    db.prepare("DELETE FROM quotes WHERE business_id = ?").run(businessId);
    db.prepare("DELETE FROM credit_notes WHERE business_id = ?").run(businessId);
    // Cascades invoice_line_items and invoice_edit_history.
    db.prepare("DELETE FROM invoices WHERE business_id = ?").run(businessId);
    // Cascades recurring_invoice_line_items.
    db.prepare("DELETE FROM recurring_invoices WHERE business_id = ?").run(businessId);
    db.prepare("DELETE FROM stock_adjustments WHERE business_id = ?").run(businessId);
    db.prepare("DELETE FROM customers WHERE business_id = ?").run(businessId);
    db.prepare("DELETE FROM items WHERE business_id = ?").run(businessId);
    db.prepare("DELETE FROM invoice_number_counters WHERE business_id = ?").run(businessId);
    db.prepare("DELETE FROM login_events WHERE business_id = ?").run(businessId);

    // Every login that had access to this business — figure out which of
    // them are left with no other business to sign into, BEFORE removing
    // the membership rows that answer that question.
    const affectedUserIds = db
      .prepare("SELECT DISTINCT user_id FROM memberships WHERE business_id = ?")
      .all(businessId)
      .map((row) => row.user_id);
    db.prepare("DELETE FROM memberships WHERE business_id = ?").run(businessId);

    for (const userId of affectedUserIds) {
      const remaining = db.prepare("SELECT business_id, role FROM memberships WHERE user_id = ? ORDER BY created_at").all(userId);
      if (remaining.length > 0) {
        // Still has at least one other firm — if THIS business was their
        // "home" business_id, point it at one they still have.
        const user = db.prepare("SELECT business_id FROM users WHERE id = ?").get(userId);
        if (user && user.business_id === businessId) {
          db.prepare("UPDATE users SET business_id = ? WHERE id = ?").run(remaining[0].business_id, userId);
        }
      } else {
        // This login only ever had access to this one business — nothing
        // left for it to do, so remove the login entirely.
        db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM login_events WHERE user_id = ?").run(userId);
        db.prepare("DELETE FROM users WHERE id = ?").run(userId);
      }
    }

    db.prepare("DELETE FROM businesses WHERE id = ?").run(businessId);

    // Report back whether the requesting login still exists (they had
    // another firm) so the client knows whether to switch into it or just
    // sign the person out entirely.
    const stillExists = db.prepare("SELECT * FROM users WHERE id = ?").get(req.auth.userId);
    if (!stillExists) return { accountDeleted: true };

    const membership = db.prepare("SELECT business_id, role FROM memberships WHERE user_id = ? ORDER BY created_at LIMIT 1").get(stillExists.id);
    const token = signToken({ id: stillExists.id, business_id: membership.business_id, role: membership.role });
    return {
      accountDeleted: false,
      token,
      user: { id: stillExists.id, business_id: membership.business_id, role: membership.role, name: stillExists.name, email: stillExists.email },
    };
  })();

  res.json({ ok: true, ...result });
});

export default router;
