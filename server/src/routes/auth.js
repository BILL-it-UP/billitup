import express from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { signToken } from "../middleware/auth.js";

const router = express.Router();

// Signup creates the business AND its first user, who is always the Owner.
// Staff logins are created later by the Owner/Admin via POST /api/users, not here.
router.post("/signup", (req, res) => {
  const {
    businessName, businessType, ownerName, email, password,
    gstin, defaultPaperSize, inventoryEnabled,
  } = req.body;
  if (!businessName || !ownerName || !email || !password) {
    return res.status(400).json({ error: "businessName, ownerName, email and password are required" });
  }
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(409).json({ error: "An account with that email already exists" });

  // Everything the onboarding wizard collected (modules/paper size/GSTIN) is
  // saved straight onto the business at creation, so Settings doesn't need to
  // be revisited afterward just to finish setup.
  const insertBusiness = db.prepare(
    `INSERT INTO businesses (name, business_type, gstin, default_paper_size, inventory_enabled)
     VALUES (?, ?, ?, ?, ?)`
  );
  const businessResult = insertBusiness.run(
    businessName, businessType || null, gstin || null,
    defaultPaperSize || "A4", inventoryEnabled ? 1 : 0
  );
  const businessId = businessResult.lastInsertRowid;

  const passwordHash = bcrypt.hashSync(password, 10);
  const insertUser = db.prepare(
    "INSERT INTO users (business_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'owner')"
  );
  const userResult = insertUser.run(businessId, ownerName, email, passwordHash);

  const user = { id: userResult.lastInsertRowid, business_id: businessId, role: "owner" };
  const token = signToken(user);
  res.status(201).json({ token, user: { ...user, name: ownerName, email } });
});

router.post("/login", (req, res) => {
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

export default router;
