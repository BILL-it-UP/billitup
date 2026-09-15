// Registry of cloud-backup providers (2026-09-15). Each entry needs exactly
// the same five functions dropbox.js has — isConfigured, getAuthUrl,
// exchangeCode, refreshAccessToken, getAccountLabel, uploadFile — so
// routes/cloudBackup.js and lib/cloudBackupRun.js never need to know which
// provider they're talking to. Google Drive and OneDrive slot in here the
// same way once their own OAuth app credentials exist; until then they
// simply aren't listed, and the Settings page + status endpoint only ever
// show what's actually in this object.
import * as dropbox from "./dropbox.js";

export const PROVIDERS = {
  dropbox: { label: "Dropbox", ...dropbox },
};

export function getProvider(key) {
  const provider = PROVIDERS[key];
  if (!provider) throw new Error(`Unknown cloud backup provider: ${key}`);
  return provider;
}
