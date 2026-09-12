import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { db } from "../db.js";
import { signToken, requireAuth, requireRole } from "../middleware/auth.js";
import { buildTransport, SmtpNotConfiguredError } from "../lib/mailer.js";

const router = express.Router();

// Login/signup can be hammered by a script trying passwords or spamming
// accounts — cap them per IP. Forgot-password is capped tighter still since
// each attempt sends a real email through the business's own SMTP account.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a while and try again." },
});
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many password reset requests. Please wait a while and try again." },
});

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

// Signup creates the business AND its first user, who is always the Owner.
// Staff logins are created later by the Owner/Admin via POST /api/users, not here.
router.post("/signup", authLimiter, (req, res) => {
  const { businessName, ownerName, email, password, gstin } = req.body;
  if (!businessName || !ownerName || !email || !password) {
    return res.status(400).json({ error: "businessName, ownerName, email and password are required" });
  }
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(409).json({ error: "An account with that email already exists" });

  // Signup only collects the essentials (business name + GSTIN); everything
  // else (branding, bank details, terms, prefixes) is finished in Settings
  // afterward. Corporate/A4 invoicing is the only mode BillItUp runs in, so
  // there's no business-type/paper-size/inventory branching to collect here.
  const insertBusiness = db.prepare(`INSERT INTO businesses (name, gstin) VALUES (?, ?)`);
  const businessResult = insertBusiness.run(businessName, gstin || null);
  const businessId = businessResult.lastInsertRowid;

  const passwordHash = bcrypt.hashSync(password, 10);
  const insertUser = db.prepare(
    "INSERT INTO users (business_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'owner')"
  );
  const userResult = insertUser.run(businessId, ownerName, email, passwordHash);
  const userId = userResult.lastInsertRowid;
  db.prepare("INSERT INTO memberships (user_id, business_id, role) VALUES (?, ?, 'owner')").run(userId, businessId);

  const user = { id: userId, business_id: businessId, role: "owner" };
  const token = signToken(user);
  res.status(201).json({ token, user: { ...user, name: ownerName, email } });
});

router.post("/login", authLimiter, (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  // Record the login: last_login_at on the user for a quick glance in Staff
  // Management, and a login_events row so there's a history to look back at
  // if someone ever needs to figure out who logged in, when, and from where.
  const now = new Date().toISOString();
  db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").run(now, user.id);
  db.prepare(
    "INSERT INTO login_events (user_id, business_id, ip_address, user_agent, logged_in_at) VALUES (?, ?, ?, ?, ?)"
  ).run(user.id, user.business_id, req.ip || null, req.headers["user-agent"] || null, now);

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, business_id: user.business_id, role: user.role, name: user.name, email: user.email },
  });
});

// Always responds the same way regardless of whether the email exists or the
// email actually sent — this endpoint must never reveal which emails have
// accounts, or whether a given business has SMTP configured.
router.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "email is required" });
  const genericResponse = { message: "If an account exists for that email, we've sent password reset instructions." };

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user) return res.json(genericResponse);

  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(user.business_id);
  const rawToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
  db.prepare(
    "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)"
  ).run(user.id, hashToken(rawToken), expiresAt);

  // APP_URL is how a self-hosted install tells the server what its public
  // client address is, so the emailed link points somewhere real instead of
  // localhost. See server/.env.example.
  const appUrl = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
  const resetLink = `${appUrl}/reset-password?token=${rawToken}`;

  try {
    const transport = buildTransport(business);
    const fromEmail = business.smtp_from_email || business.smtp_user;
    const fromName = business.smtp_from_name || business.name || "BillItUp";
    await transport.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: user.email,
      subject: "Reset your BillItUp password",
      text: `Hi ${user.name},\n\nSomeone requested a password reset for your BillItUp account. If this was you, set a new password here (this link expires in 1 hour):\n\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.`,
    });
  } catch (err) {
    // Don't leak SMTP-configuration state to the caller — just log it so
    // whoever runs this install can see why a user never got their email.
    if (err instanceof SmtpNotConfiguredError) {
      console.warn(`Password reset requested for ${email}, but that business hasn't configured SMTP yet — no email was sent.`);
    } else {
      console.error("Failed to send password reset email:", err);
    }
  }

  res.json(genericResponse);
});

router.post("/reset-password", (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: "token and password are required" });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

  const row = db
    .prepare("SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL")
    .get(hashToken(token));
  if (!row || new Date(row.expires_at) < new Date()) {
    return res.status(400).json({ error: "This reset link is invalid or has expired. Request a new one." });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, row.user_id);
  db.prepare("UPDATE password_reset_tokens SET used_at = datetime('now') WHERE id = ?").run(row.id);

  res.json({ message: "Password updated. You can now log in." });
});

// Firms this login can switch into — one row per membership. Used to render
// the firm switcher in the topbar; also works fine for a login that only
// has the one (usual) firm.
router.get("/businesses", requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT businesses.id, businesses.name, businesses.gstin, businesses.plan, memberships.role
       FROM memberships JOIN businesses ON businesses.id = memberships.business_id
       WHERE memberships.user_id = ?
       ORDER BY businesses.created_at`
    )
    .all(req.auth.userId);
  res.json(rows);
});

// Switch the active firm for this login — issues a fresh token scoped to the
// target business (only one this login actually has a membership in).
router.post("/switch-business", requireAuth, (req, res) => {
  const { businessId } = req.body;
  const membership = db
    .prepare("SELECT * FROM memberships WHERE user_id = ? AND business_id = ?")
    .get(req.auth.userId, businessId);
  if (!membership) return res.status(403).json({ error: "You don't have access to that firm" });

  const person = db.prepare("SELECT * FROM users WHERE id = ?").get(req.auth.userId);
  const token = signToken({ id: person.id, business_id: membership.business_id, role: membership.role });
  res.json({
    token,
    user: { id: person.id, business_id: membership.business_id, role: membership.role, name: person.name, email: person.email },
  });
});

// Add another firm under this same login (Owner only) — like Zoho Books'
// "+ Add Organization". Creates a new business and a fresh membership for
// the SAME user row; no new login/email is created. Immediately switches
// into the new firm so the response can be used exactly like a login result.
router.post("/firms", requireAuth, requireRole("owner"), (req, res) => {
  const { businessName, gstin } = req.body;
  if (!businessName) return res.status(400).json({ error: "businessName is required" });

  // Basic invoicing is free forever, in one firm. Running more than one firm
  // under the same login is the premium feature — this login needs at least
  // one firm already marked premium (flipped by hand after being paid
  // directly, see routes/admin.js) before it can add another.
  const hasPremiumFirm = db
    .prepare(
      `SELECT 1 FROM memberships m JOIN businesses b ON b.id = m.business_id
       WHERE m.user_id = ? AND b.plan = 'premium' LIMIT 1`
    )
    .get(req.auth.userId);
  if (!hasPremiumFirm) {
    return res.status(403).json({
      error: "Adding another firm needs a premium plan. Get in touch to upgrade — everything else stays free.",
      code: "PREMIUM_REQUIRED",
    });
  }

  const businessResult = db.prepare("INSERT INTO businesses (name, gstin) VALUES (?, ?)").run(businessName, gstin || null);
  const businessId = businessResult.lastInsertRowid;
  db.prepare("INSERT INTO memberships (user_id, business_id, role) VALUES (?, ?, 'owner')").run(req.auth.userId, businessId);

  const person = db.prepare("SELECT * FROM users WHERE id = ?").get(req.auth.userId);
  const token = signToken({ id: person.id, business_id: businessId, role: "owner" });
  res.status(201).json({
    token,
    user: { id: person.id, business_id: businessId, role: "owner", name: person.name, email: person.email },
  });
});

export default router;
