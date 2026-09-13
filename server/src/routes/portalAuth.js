import express from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import rateLimit from "express-rate-limit";
import { db } from "../db.js";
import { signCustomerToken } from "../middleware/auth.js";
import { buildTransport } from "../lib/mailer.js";

// Unauthenticated routes a CLIENT uses to get into their own portal login —
// setting/resetting their password with the one-time link an Owner/Admin's
// "Turn on" or "Resend invite" action emailed them, and logging in
// afterwards. Nothing here can read invoice data; that's only reachable
// once logged in, via routes/portal.js behind requireCustomerAuth.
const router = express.Router();

const portalLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a while and try again." },
});

// Looked up by the Owner/Admin side too (customers.js), kept here since
// sending the email is what both "turn portal on" and "resend invite" share.
export async function sendPortalInviteEmail({ business, customer, token, isReset }) {
  const appUrl = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
  const link = `${appUrl}/portal/set-password/${token}`;
  const transport = buildTransport(business);
  const fromEmail = business.smtp_from_email || business.smtp_user;
  const fromName = business.smtp_from_name || business.name || "BillItUp";
  const action = isReset ? "reset your portal password" : "set up your portal login";
  await transport.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to: customer.email,
    subject: isReset ? `Reset your ${business.name} client portal password` : `You now have online access to your invoices from ${business.name}`,
    text:
      `Hi ${customer.name},\n\n` +
      `${business.name} has given you online access to view your invoices and payment status.\n\n` +
      `Click the link below to ${action} (this link can only be used once):\n\n${link}\n\n` +
      `If you weren't expecting this, you can ignore this email.`,
  });
  return link;
}

// Tells the "set password" page who this invite is for and whether the
// client is setting a password for the first time or resetting one they
// already have — without exposing any invoice data.
router.get("/invite/:token", (req, res) => {
  const customer = db.prepare("SELECT * FROM customers WHERE portal_token = ?").get(req.params.token);
  if (!customer || !customer.portal_enabled) {
    return res.status(404).json({ error: "This link is invalid or no longer active. Ask the business to resend it." });
  }
  const business = db.prepare("SELECT name FROM businesses WHERE id = ?").get(customer.business_id);
  res.json({
    customerName: customer.name,
    businessName: business?.name || "",
    mode: customer.portal_password_hash ? "reset" : "set",
  });
});

router.post("/set-password", (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: "token and password are required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  const customer = db.prepare("SELECT * FROM customers WHERE portal_token = ?").get(token);
  if (!customer || !customer.portal_enabled) {
    return res.status(404).json({ error: "This link is invalid or no longer active. Ask the business to resend it." });
  }

  // One-time: clear the token once it's used, same as the invoice/quote
  // share-link tokens never get reused for a different purpose. A future
  // "resend invite" / "forgot password" issues a fresh one.
  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare("UPDATE customers SET portal_password_hash = ?, portal_token = ? WHERE id = ?")
    .run(passwordHash, randomUUID().replace(/-/g, ""), customer.id);

  res.json({ message: "Password set. You can now log in." });
});

router.post("/login", portalLoginLimiter, (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });

  // Matches on email + already-active portal access. If the same email were
  // somehow used for more than one customer (e.g. two different businesses
  // on the same self-hosted install), treat it the same as "not found"
  // rather than guessing which one — same generic-response principle as
  // forgot-password, so this endpoint never reveals which emails exist.
  const matches = db
    .prepare("SELECT * FROM customers WHERE email = ? AND portal_enabled = 1 AND portal_password_hash IS NOT NULL")
    .all(email);
  const customer = matches.length === 1 ? matches[0] : null;
  if (!customer || !bcrypt.compareSync(password, customer.portal_password_hash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  const token = signCustomerToken(customer);
  res.json({ token, customer: { id: customer.id, name: customer.name, email: customer.email } });
});

export default router;
