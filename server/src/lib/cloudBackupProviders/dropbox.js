// Dropbox side of the cloud-backup feature (2026-09-15). Standard OAuth 2
// authorization-code flow against Dropbox's own scoped-app API — nothing
// unofficial or reverse-engineered here, this is the same flow Dropbox's own
// docs walk through. The app is registered as "App folder" access on the
// Dropbox App Console, so every upload lands in one folder Dropbox creates
// for this app inside the business's Dropbox, never anywhere else in it.
const AUTHORIZE_URL = "https://www.dropbox.com/oauth2/authorize";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const UPLOAD_URL = "https://content.dropboxapi.com/2/files/upload";
const ACCOUNT_URL = "https://api.dropboxapi.com/2/users/get_current_account";

function redirectUri() {
  const appUrl = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
  return `${appUrl}/api/cloud-backup/dropbox/callback`;
}

export function isConfigured() {
  return !!(process.env.DROPBOX_CLIENT_ID && process.env.DROPBOX_CLIENT_SECRET);
}

// token_access_type=offline is what gets us a refresh_token back, not just a
// short-lived access token — without it Dropbox only issues a 4-hour token
// with nothing to renew it, useless for a once-a-day background upload.
export function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: process.env.DROPBOX_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    token_access_type: "offline",
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCode(code) {
  const params = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: process.env.DROPBOX_CLIENT_ID,
    client_secret: process.env.DROPBOX_CLIENT_SECRET,
    redirect_uri: redirectUri(),
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error_description || "Dropbox rejected the authorization code");
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

// Dropbox access tokens are short-lived (a few hours) and it doesn't rotate
// the refresh token on refresh, so this can safely be called before every
// upload rather than trying to track exact expiry times ourselves.
export async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    client_id: process.env.DROPBOX_CLIENT_ID,
    client_secret: process.env.DROPBOX_CLIENT_SECRET,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error_description || "Couldn't refresh the Dropbox connection — it may need to be reconnected");
  return data.access_token;
}

// Shown in Settings as "Connected as ..." so a business can tell which
// Dropbox account they actually linked. Best-effort — callers treat a
// failure here as non-fatal, the connection itself still works without it.
export async function getAccountLabel(accessToken) {
  const res = await fetch(ACCOUNT_URL, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.email || data?.name?.display_name || null;
}

export async function uploadFile(accessToken, filename, buffer) {
  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": JSON.stringify({ path: `/${filename}`, mode: "overwrite", mute: true }),
    },
    body: buffer,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error_summary || `Dropbox upload failed (${res.status})`);
  }
  return res.json();
}
