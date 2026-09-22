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

// This business's own view of its technical error log, the same rows
// Master Admin's per-business "Errors" section reads (see routes/admin.js),
// including whether each one has since been marked resolved and the note on
// how, so a business can actually find out that something they hit got
// fixed rather than that only ever showing up on Naveen's side (2026-09-20).
// Any logged-in role can read it (same tier as the plain status field on an
// invoice). It never reads any request body, query params, or client data,
// same privacy guarantee as lib/errorLog.js.
router.get("/errors", (req, res) => {
  const rows = db
    .prepare("SELECT * FROM error_log WHERE business_id = ? ORDER BY created_at DESC LIMIT 50")
    .all(req.auth.businessId);
  res.json(rows);
});

// Settings update: profile, tax, numbering prefixes, SMTP, and invoice branding.
router.put("/me", requireRole("owner", "admin"), (req, res) => {
  const {
    name, address, pincode, country, phone, email, website, gstin, state,
    invoice_prefix, quote_prefix, credit_note_prefix,
    smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, smtp_from_name, smtp_from_email,
    logo_data_url, bank_account_name, bank_name, bank_account_number, bank_ifsc, bank_upi_id,
    terms_and_conditions, signature_data_url, signature_name,
    reset_invoice_numbering_yearly, date_format, default_currency,
    email_subject_invoice, email_body_invoice, email_subject_quote, email_body_quote,
    email_subject_credit_note, email_body_credit_note, email_subject_reminder, email_body_reminder,
    email_subject_receipt, email_body_receipt,
    reminders_enabled, reminder_days_before_due, reminder_overdue_repeat_days,
    require_invoice_approval, rbi_bank_rate, annual_turnover,
    invoice_number_mode, next_invoice_number, default_print_copies,
  } = req.body;

  if (invoice_number_mode && !["auto", "manual"].includes(invoice_number_mode)) {
    return res.status(400).json({ error: "Invalid invoice_number_mode" });
  }
  if (default_print_copies !== undefined && default_print_copies !== null && default_print_copies !== "" && ![1, 2, 3].includes(Number(default_print_copies))) {
    return res.status(400).json({ error: "default_print_copies must be 1, 2, or 3" });
  }

  db.prepare(
    `UPDATE businesses SET
      name = COALESCE(?, name),
      address = COALESCE(?, address),
      pincode = COALESCE(?, pincode),
      country = COALESCE(?, country),
      phone = COALESCE(?, phone),
      email = COALESCE(?, email),
      website = COALESCE(?, website),
      gstin = COALESCE(?, gstin),
      state = COALESCE(?, state),
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
      reset_invoice_numbering_yearly = COALESCE(?, reset_invoice_numbering_yearly),
      date_format = COALESCE(?, date_format),
      default_currency = COALESCE(?, default_currency),
      email_subject_invoice = COALESCE(?, email_subject_invoice),
      email_body_invoice = COALESCE(?, email_body_invoice),
      email_subject_quote = COALESCE(?, email_subject_quote),
      email_body_quote = COALESCE(?, email_body_quote),
      email_subject_credit_note = COALESCE(?, email_subject_credit_note),
      email_body_credit_note = COALESCE(?, email_body_credit_note),
      email_subject_reminder = COALESCE(?, email_subject_reminder),
      email_body_reminder = COALESCE(?, email_body_reminder),
      email_subject_receipt = COALESCE(?, email_subject_receipt),
      email_body_receipt = COALESCE(?, email_body_receipt),
      reminders_enabled = COALESCE(?, reminders_enabled),
      reminder_days_before_due = COALESCE(?, reminder_days_before_due),
      reminder_overdue_repeat_days = COALESCE(?, reminder_overdue_repeat_days),
      require_invoice_approval = COALESCE(?, require_invoice_approval),
      rbi_bank_rate = COALESCE(?, rbi_bank_rate),
      annual_turnover = COALESCE(?, annual_turnover),
      invoice_number_mode = COALESCE(?, invoice_number_mode),
      next_invoice_number = COALESCE(?, next_invoice_number),
      default_print_copies = COALESCE(?, default_print_copies)
    WHERE id = ?`
  ).run(
    name, address, pincode, country, phone, email, website, gstin, state,
    invoice_prefix, quote_prefix, credit_note_prefix,
    smtp_host, smtp_port === undefined || smtp_port === "" ? smtp_port : Number(smtp_port),
    smtp_secure === undefined ? undefined : (smtp_secure ? 1 : 0),
    smtp_user, smtp_pass, smtp_from_name, smtp_from_email,
    logo_data_url, bank_account_name, bank_name, bank_account_number, bank_ifsc, bank_upi_id,
    terms_and_conditions, signature_data_url, signature_name,
    reset_invoice_numbering_yearly === undefined ? undefined : (reset_invoice_numbering_yearly ? 1 : 0),
    date_format, default_currency,
    email_subject_invoice, email_body_invoice, email_subject_quote, email_body_quote,
    email_subject_credit_note, email_body_credit_note, email_subject_reminder, email_body_reminder,
    email_subject_receipt, email_body_receipt,
    reminders_enabled === undefined ? undefined : (reminders_enabled ? 1 : 0),
    // 0 is a valid, meaningful value here ("don't send this kind of
    // reminder"), so — same reasoning as smtp_port above — only actually
    // undefined (field left out of the request entirely) is treated as
    // "leave it alone"; an explicit 0 or "" from the form is not.
    reminder_days_before_due === undefined ? undefined : Number(reminder_days_before_due) || 0,
    reminder_overdue_repeat_days === undefined ? undefined : Number(reminder_overdue_repeat_days) || 0,
    require_invoice_approval === undefined ? undefined : (require_invoice_approval ? 1 : 0),
    // Same COALESCE-based "leave alone unless a real value was sent"
    // convention as every other field on this route — an empty string from
    // a cleared input is left alone rather than stored, matching how e.g.
    // clearing "website" back to blank already isn't supported here either.
    // Also treats null as "leave alone": a fresh column with no DEFAULT
    // (annual_turnover) reads back as null, not undefined, for every
    // business until it's actually set, and the whole business object round
    // trips through every Settings tab's Save button — without this check,
    // saving any other tab before ever touching this field would silently
    // zero it out (caught while building the e-invoice banner, 2026-09-16).
    rbi_bank_rate === undefined || rbi_bank_rate === null || rbi_bank_rate === "" ? undefined : Number(rbi_bank_rate),
    annual_turnover === undefined || annual_turnover === null || annual_turnover === "" ? undefined : Number(annual_turnover),
    // Invoice Number Preferences (the gear icon on New Invoice, matching
    // Zoho's own modal, 2026-09-20). invoice_number_mode is a plain
    // "auto"/"manual" string. next_invoice_number moves the counter that
    // drives auto-numbering. This is also how a business starts numbering
    // at any chosen number without needing to import anything (the original
    // ask this round's Import from Zoho feature only solved indirectly).
    // 0 isn't a meaningful invoice number, so it's treated the same as a
    // blank/missing value rather than actually being saved as 0.
    invoice_number_mode === undefined || invoice_number_mode === null || invoice_number_mode === "" ? undefined : invoice_number_mode,
    next_invoice_number === undefined || next_invoice_number === null || next_invoice_number === "" || Number(next_invoice_number) <= 0
      ? undefined : Number(next_invoice_number),
    // How many copies an invoice prints by default (2026-09-22, see
    // db.js's own comment). Validated to 1/2/3 above; same "leave alone
    // unless a real value was sent" convention as the rest of this route.
    default_print_copies === undefined || default_print_copies === null || default_print_copies === ""
      ? undefined : Number(default_print_copies),
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
