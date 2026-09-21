// A tiny, separate console for Naveen only — not part of the regular business
// login system. It talks to the ADMIN_SECRET-guarded routes in
// server/src/routes/admin.js using a plain header instead of a JWT, since
// there's no "admin user" account, just one shared secret he sets himself in
// server/.env. The secret is remembered in this browser's localStorage (under
// its own key, separate from billitup_token/billitup_user) so he doesn't have
// to retype it every visit — it never touches a regular business login.
const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const STORAGE_KEY = "billitup_admin_secret";

export function getAdminSecret() {
  return localStorage.getItem(STORAGE_KEY);
}

export function setAdminSecret(secret) {
  localStorage.setItem(STORAGE_KEY, secret);
}

export function clearAdminSecret() {
  localStorage.removeItem(STORAGE_KEY);
}

async function adminRequest(path, { method = "GET", body } = {}) {
  const secret = getAdminSecret();
  const headers = { "Content-Type": "application/json" };
  if (secret) headers["x-admin-secret"] = secret;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // A rejected secret (wrong, or ADMIN_SECRET removed on the server since)
    // should never sit around looking valid — clear it so the next visit
    // asks again instead of silently failing every request.
    if (res.status === 401) clearAdminSecret();
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const adminApi = {
  listBusinesses: () => adminRequest("/api/admin/businesses"),
  getBusiness: (businessId) => adminRequest(`/api/admin/businesses/${businessId}`),
  getBusinessUsers: (businessId) => adminRequest(`/api/admin/businesses/${businessId}/users`),
  setPlan: (businessId, plan) => adminRequest("/api/admin/set-plan", { method: "POST", body: { businessId, plan } }),
  getStats: () => adminRequest("/api/admin/stats"),
  listSuggestions: () => adminRequest("/api/admin/suggestions"),
  setSuggestionStatus: (id, status) => adminRequest(`/api/admin/suggestions/${id}/status`, { method: "PUT", body: { status } }),
  deleteSuggestion: (id) => adminRequest(`/api/admin/suggestions/${id}`, { method: "DELETE" }),

  // The "doctor's chart" for one business — technical errors tied to their
  // requests, never their client data. See routes/admin.js for what's kept
  // out on purpose.
  getBusinessErrors: (businessId) => adminRequest(`/api/admin/businesses/${businessId}/errors`),
  listAllErrors: () => adminRequest("/api/admin/errors"),
  setErrorStatus: (errorId, status, resolutionNotes, notifyMessage) =>
    adminRequest(`/api/admin/errors/${errorId}`, {
      method: "PUT",
      body: { status, resolution_notes: resolutionNotes, notify_message: notifyMessage },
    }),

  // Support chat — one business's threads (for their Business Health page)
  // and the cross-business inbox (for the main Master Admin screen).
  getBusinessTickets: (businessId) => adminRequest(`/api/admin/businesses/${businessId}/tickets`),
  listAllSupportTickets: () => adminRequest("/api/admin/support/tickets"),
  getSupportTicketMessages: (ticketId) => adminRequest(`/api/admin/support/tickets/${ticketId}/messages`),
  sendAdminSupportMessage: (ticketId, message) =>
    adminRequest(`/api/admin/support/tickets/${ticketId}/messages`, { method: "POST", body: { message } }),
  setSupportTicketStatus: (ticketId, status) =>
    adminRequest(`/api/admin/support/tickets/${ticketId}/status`, { method: "PUT", body: { status } }),

  // Announcements — write one, it pops up for every business next login.
  listAnnouncements: () => adminRequest("/api/admin/announcements"),
  createAnnouncement: (title, message) =>
    adminRequest("/api/admin/announcements", { method: "POST", body: { title, message } }),
  deleteAnnouncement: (id) => adminRequest(`/api/admin/announcements/${id}`, { method: "DELETE" }),
};
