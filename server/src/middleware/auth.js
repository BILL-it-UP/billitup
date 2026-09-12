import jwt from "jsonwebtoken";
import crypto from "crypto";

// A hardcoded fallback secret would sit in this file forever, in a public
// open-source repo — anyone could read it and forge a valid login token for
// any BillItUp install that forgot to set JWT_SECRET. A random secret
// generated fresh each time the process starts closes that hole; the only
// cost is that everyone gets logged out on a restart, which is a fine
// trade-off for a dev/trial run and a strong nudge to set a real one before
// depending on this for real users.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex");
if (!process.env.JWT_SECRET) {
  console.warn(
    "\n⚠️  JWT_SECRET is not set — using a random secret generated for this run.\n" +
      "   Everyone will be logged out whenever the server restarts, and tokens\n" +
      "   won't work across multiple server instances. Set JWT_SECRET in\n" +
      "   server/.env (any long random string) before relying on this for real use.\n"
  );
}

export function signToken(user) {
  return jwt.sign(
    { userId: user.id, businessId: user.business_id, role: user.role },
    JWT_SECRET,
    { expiresIn: "30d" }
  );
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// Restrict a route to specific roles, e.g. requireRole("owner", "admin")
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: "Not permitted for your role" });
    }
    next();
  };
}
