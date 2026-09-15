// A business's own connection to Dropbox/Google Drive/OneDrive for backups
// (2026-09-15) — see lib/cloudBackupExport.js and lib/cloudBackupRun.js for
// what actually gets uploaded and why it's scoped to just that one business.
// Same sensitivity tier as the rest of Backups (owner-only, not admin).
import express from "express";
import { db } from "../db.js";
import { requireAuth, requireRole, signCloudBackupState, verifyCloudBackupState } from "../middleware/auth.js";
import { getProvider, PROVIDERS } from "../lib/cloudBackupProviders/index.js";

const router = express.Router();

function appUrl() {
  return (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
}

router.get("/status", requireAuth, requireRole("owner"), (req, res) => {
  const rows = db
    .prepare(
      "SELECT provider, account_label, connected_at, last_upload_at, last_upload_status, last_error FROM cloud_backup_connections WHERE business_id = ?"
    )
    .all(req.auth.businessId);
  const byProvider = Object.fromEntries(rows.map((r) => [r.provider, r]));

  res.json(
    Object.entries(PROVIDERS).map(([key, provider]) => ({
      provider: key,
      label: provider.label,
      configured: provider.isConfigured(),
      connected: !!byProvider[key],
      account_label: byProvider[key]?.account_label || null,
      connected_at: byProvider[key]?.connected_at || null,
      last_upload_at: byProvider[key]?.last_upload_at || null,
      last_upload_status: byProvider[key]?.last_upload_status || null,
      last_error: byProvider[key]?.last_error || null,
    }))
  );
});

// Requires a valid login (fetched with the usual Authorization header), so
// this hands back a URL for the client to navigate to rather than
// redirecting itself — a plain browser link here wouldn't carry the token.
router.get("/:provider/connect", requireAuth, requireRole("owner"), (req, res) => {
  let provider;
  try {
    provider = getProvider(req.params.provider);
  } catch {
    return res.status(404).json({ error: "Unknown provider" });
  }
  if (!provider.isConfigured()) {
    return res.status(400).json({ error: `${provider.label} isn't set up on this install yet.` });
  }
  const state = signCloudBackupState({ businessId: req.auth.businessId, provider: req.params.provider });
  res.json({ url: provider.getAuthUrl(state) });
});

// The provider redirects the browser straight here with no Authorization
// header of its own — the signed state (see middleware/auth.js) is what
// stands in for one, proving which business/provider started this.
router.get("/:provider/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const back = (status) => res.redirect(`${appUrl()}/settings?cloud_backup=${status}&provider=${req.params.provider}`);

  if (error) return back("denied");
  if (!code || !state) return back("failed");

  let payload;
  try {
    payload = verifyCloudBackupState(state);
  } catch {
    return back("invalid_state");
  }
  if (payload.provider !== req.params.provider) return back("invalid_state");

  let provider;
  try {
    provider = getProvider(req.params.provider);
  } catch {
    return back("failed");
  }

  try {
    const { accessToken, refreshToken } = await provider.exchangeCode(code);
    const accountLabel = await provider.getAccountLabel(accessToken).catch(() => null);
    db.prepare(
      `INSERT INTO cloud_backup_connections (business_id, provider, access_token, refresh_token, account_label, connected_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(business_id, provider) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = excluded.refresh_token,
         account_label = excluded.account_label,
         connected_at = excluded.connected_at,
         last_upload_status = NULL,
         last_error = NULL`
    ).run(payload.businessId, req.params.provider, accessToken, refreshToken, accountLabel);
    return back("connected");
  } catch (err) {
    console.error(`Cloud backup connect failed (${req.params.provider}):`, err);
    return back("failed");
  }
});

router.post("/:provider/disconnect", requireAuth, requireRole("owner"), (req, res) => {
  db.prepare("DELETE FROM cloud_backup_connections WHERE business_id = ? AND provider = ?").run(
    req.auth.businessId,
    req.params.provider
  );
  res.json({ ok: true });
});

export default router;
