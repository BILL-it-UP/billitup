import express from "express";
import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { signToken } from "../middleware/auth.js";

const router = express.Router();

// Signup creates the business AND its first user, who is always the Owner.
// Staff logins are created later by the Owner/Admin via POST /api/users, not here.
router.post("/signup", (req, res) => {
  const { businessName, businessType, ownerName, email, password } = req.body;
  if (!businessName || !ownerName || !email || !password) {
    return res.status(400).json({ error: "businessName, ownerName, email and password are required" });
  }
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(409).json({ error: "An account with that email already exists" });

  const insertBusiness = db.prepare(
    "INSERT INTO businesses (name, business_type) VALUES (?, ?)"
  );
  const businessResult = insertBusiness.run(businessName, businessType || null);
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
  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, business_id: user.business_id, role: user.role, name: user.name, email: user.email },
  });
});

export default router;
