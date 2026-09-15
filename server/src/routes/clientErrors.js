import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { logError } from "../lib/errorLog.js";

// The browser side of error_log — ErrorBoundary.jsx and the window.onerror/
// unhandledrejection listeners in main.jsx call this so a crash that only
// ever happened in someone's browser still shows up on that business's
// health page in Master Admin, not just in a console nobody but that one
// person will ever open (2026-09-15). requireAuth rather than public: only
// a logged-in business user's browser reports here, so every row already
// has a business_id, and a stray unauthenticated request can't spam the
// table.
const router = express.Router();
router.use(requireAuth);

router.post("/", (req, res) => {
  const { message, route } = req.body || {};
  if (!message) return res.status(400).json({ error: "message is required" });
  logError({
    businessId: req.auth.businessId,
    source: "client",
    route: typeof route === "string" ? route.slice(0, 200) : null,
    message,
  });
  res.status(204).end();
});

export default router;
