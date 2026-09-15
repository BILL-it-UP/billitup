// `??` (not `||`) matters here: in the Docker/production build VITE_API_URL
// is deliberately set to "" (same-origin — see client/nginx.conf, which
// proxies /api/* to the server container), and "" is falsy, so `||` would
// silently discard it and fall back to localhost, breaking the app for every
// visitor on the real domain. Local `npm run dev` never sets VITE_API_URL at
// all (undefined), so it still falls through to the localhost default below.
const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

function getToken() {
  return localStorage.getItem("billitup_token");
}

// Small cache for the current business's date_format, read by
// lib/useDateFormat.js — list pages (Dashboard, Quotes, Credit Notes) show a
// raw date per row without a full business object attached, so they share
// one fetch-once value instead of each re-requesting it. Lives here (rather
// than in useDateFormat.js) so setSession/clearSession can invalidate it
// without a circular import.
let cachedDateFormat = null;
export function getCachedDateFormat() { return cachedDateFormat; }
export function setCachedDateFormat(value) { cachedDateFormat = value; }

export function setSession(token, user) {
  localStorage.setItem("billitup_token", token);
  localStorage.setItem("billitup_user", JSON.stringify(user));
  // A new session can mean a different business (login, switch-firm, add-firm)
  // with its own date_format — drop the cached one so list pages refetch it
  // instead of showing the previous business's setting.
  cachedDateFormat = null;
}

export function clearSession() {
  localStorage.removeItem("billitup_token");
  localStorage.removeItem("billitup_user");
  cachedDateFormat = null;
}

export function getUser() {
  const raw = localStorage.getItem("billitup_user");
  return raw ? JSON.parse(raw) : null;
}

// The customer portal is a completely separate login from the business
// side above — its own token, its own storage key — so a client's session
// can never be mixed up with (or accidentally carry the permissions of) a
// business user's session in the same browser.
function getCustomerToken() {
  return localStorage.getItem("billitup_customer_token");
}

export function setCustomerSession(token, customer) {
  localStorage.setItem("billitup_customer_token", token);
  localStorage.setItem("billitup_customer_user", JSON.stringify(customer));
}

export function clearCustomerSession() {
  localStorage.removeItem("billitup_customer_token");
  localStorage.removeItem("billitup_customer_user");
}

export function getCustomerUser() {
  const raw = localStorage.getItem("billitup_customer_user");
  return raw ? JSON.parse(raw) : null;
}

async function portalRequest(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getCustomerToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Access was turned off, or the session expired — either way, back to
    // the portal login rather than sitting on a page with no data.
    if (res.status === 401) {
      clearCustomerSession();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/portal/login")) {
        window.location.assign("/portal/login?expired=1");
      }
    }
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

async function request(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // A 401 on a request that carried a token means the token itself is no
    // longer good (expired after 30 days, or the account was removed) — not
    // a wrong password, which only happens on the unauthenticated login
    // call and never reaches here with a token attached. Left alone, the
    // page just sits there looking logged in with every list silently
    // empty (this was the "sometimes no data shows" report) — so instead
    // drop the stale session and send the user back to a clear "please log
    // in again" screen right away.
    if (res.status === 401 && token) {
      clearSession();
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.assign("/login?expired=1");
      }
    }
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  signup: (payload) => request("/api/auth/signup", { method: "POST", body: payload }),
  login: (payload) => request("/api/auth/login", { method: "POST", body: payload }),
  forgotPassword: (email) => request("/api/auth/forgot-password", { method: "POST", body: { email } }),
  resetPassword: (token, password) => request("/api/auth/reset-password", { method: "POST", body: { token, password } }),
  getMyBusinesses: () => request("/api/auth/businesses"),
  switchBusiness: (businessId) => request("/api/auth/switch-business", { method: "POST", body: { businessId } }),
  createFirm: (payload) => request("/api/auth/firms", { method: "POST", body: payload }),

  getBusiness: () => request("/api/business/me"),
  updateBusiness: (payload) => request("/api/business/me", { method: "PUT", body: payload }),
  sendTestEmail: (to) => request("/api/business/test-email", { method: "POST", body: { to } }),
  getBackupStatus: () => request("/api/business/backup-status"),
  backupNow: () => request("/api/business/backup-now", { method: "POST" }),
  deleteBusiness: (payload) => request("/api/business/delete", { method: "POST", body: payload }),

  listCustomers: () => request("/api/customers"),
  createCustomer: (payload) => request("/api/customers", { method: "POST", body: payload }),
  updateCustomer: (id, payload) => request(`/api/customers/${id}`, { method: "PUT", body: payload }),
  setCustomerPortalEnabled: (id, enabled) => request(`/api/customers/${id}/portal`, { method: "PUT", body: { enabled } }),
  resendCustomerPortalInvite: (id) => request(`/api/customers/${id}/portal/resend-invite`, { method: "POST" }),

  listItems: () => request("/api/items"),
  createItem: (payload) => request("/api/items", { method: "POST", body: payload }),

  listInvoices: () => request("/api/invoices"),
  getInvoice: (id) => request(`/api/invoices/${id}`),
  createInvoice: (payload) => request("/api/invoices", { method: "POST", body: payload }),
  updateInvoice: (id, payload) => request(`/api/invoices/${id}`, { method: "PUT", body: payload }),
  getInvoiceHistory: (id) => request(`/api/invoices/${id}/history`),
  setInvoiceStatus: (id, status) => request(`/api/invoices/${id}/status`, { method: "PUT", body: { status } }),
  recordPayment: (id, payload) => request(`/api/invoices/${id}/payments`, { method: "POST", body: payload }),
  sendInvoiceEmail: (id, payload) => request(`/api/invoices/${id}/send`, { method: "POST", body: payload }),

  listUsers: () => request("/api/users"),
  createUser: (payload) => request("/api/users", { method: "POST", body: payload }),
  deleteUser: (id) => request(`/api/users/${id}`, { method: "DELETE" }),
  listLoginEvents: () => request("/api/users/login-events"),

  listQuotes: () => request("/api/quotes"),
  getQuote: (id) => request(`/api/quotes/${id}`),
  createQuote: (payload) => request("/api/quotes", { method: "POST", body: payload }),
  setQuoteStatus: (id, status) => request(`/api/quotes/${id}/status`, { method: "PUT", body: { status } }),
  convertQuote: (id) => request(`/api/quotes/${id}/convert`, { method: "POST" }),
  sendQuoteEmail: (id, payload) => request(`/api/quotes/${id}/send`, { method: "POST", body: payload }),

  listCreditNotes: () => request("/api/credit-notes"),
  getCreditNote: (id) => request(`/api/credit-notes/${id}`),
  createCreditNote: (payload) => request("/api/credit-notes", { method: "POST", body: payload }),
  sendCreditNoteEmail: (id, payload) => request(`/api/credit-notes/${id}/send`, { method: "POST", body: payload }),

  getReportsSummary: () => request("/api/reports/summary"),
  getGstr1Report: (month) => request(`/api/reports/gstr1?month=${encodeURIComponent(month)}`),
  getGstr3bSummary: (month) => request(`/api/reports/gstr3b?month=${encodeURIComponent(month)}`),

  // Report Library — a catalog of named, filterable reports (Sales by
  // Customer, Invoice Details, AR Aging Summary, ...). See
  // server/src/lib/reportsCatalog.js for the full list and what each one
  // does and doesn't cover.
  getReportLibraryCatalog: () => request("/api/reports-library/catalog"),
  runReportLibrary: (key, params) => request(`/api/reports-library/run/${key}?${new URLSearchParams(params)}`),
  // The PDF endpoint is authenticated (unlike the public invoice PDF), so it
  // can't just be an <a href> — that wouldn't carry the login token. Fetch
  // it as a blob with the token attached, then hand the caller an object
  // URL it can open in a new tab.
  downloadReportLibraryPdf: async (key, params) => {
    const res = await fetch(`${BASE_URL}/api/reports-library/${key}/pdf?${new URLSearchParams(params)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || "Failed to generate PDF");
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  listPayments: () => request("/api/payments"),

  // A business's own connection to Dropbox/Google Drive/OneDrive for
  // backups — see server/src/routes/cloudBackup.js and
  // lib/cloudBackupExport.js for what actually gets uploaded and why it's
  // scoped to just that one business's own data.
  getCloudBackupStatus: () => request("/api/cloud-backup/status"),
  connectCloudBackup: (provider) => request(`/api/cloud-backup/${provider}/connect`),
  disconnectCloudBackup: (provider) => request(`/api/cloud-backup/${provider}/disconnect`, { method: "POST" }),

  listVendors: () => request("/api/vendors"),
  createVendor: (payload) => request("/api/vendors", { method: "POST", body: payload }),
  updateVendor: (id, payload) => request(`/api/vendors/${id}`, { method: "PUT", body: payload }),
  deleteVendor: (id) => request(`/api/vendors/${id}`, { method: "DELETE" }),

  listPurchases: () => request("/api/purchases"),
  createPurchase: (payload) => request("/api/purchases", { method: "POST", body: payload }),
  deletePurchase: (id) => request(`/api/purchases/${id}`, { method: "DELETE" }),

  createSuggestion: (message, category) => request("/api/suggestions", { method: "POST", body: { message, category } }),
  listSuggestions: () => request("/api/suggestions"),
  setSuggestionStatus: (id, status) => request(`/api/suggestions/${id}/status`, { method: "PUT", body: { status } }),
  deleteSuggestion: (id) => request(`/api/suggestions/${id}`, { method: "DELETE" }),

  // Support chat with Naveen — raise a problem, then reply back and forth
  // on the same thread. See server/src/routes/support.js.
  listMySupportTickets: () => request("/api/support"),
  createSupportTicket: (subject, message) => request("/api/support", { method: "POST", body: { subject, message } }),
  getSupportTicketMessages: (id) => request(`/api/support/${id}/messages`),
  sendSupportMessage: (id, message) => request(`/api/support/${id}/messages`, { method: "POST", body: { message } }),

  // Announcements Naveen posts from Master Admin — shown as a popup once
  // per login. See server/src/routes/announcements.js.
  listUnreadAnnouncements: () => request("/api/announcements/unread"),
  markAnnouncementRead: (id) => request(`/api/announcements/${id}/read`, { method: "POST" }),

  // Fire-and-forget: a browser-side crash reports itself here so it shows up
  // on this business's health page in Master Admin. Never allowed to throw
  // back into whatever just crashed — see main.jsx and ErrorBoundary.jsx.
  reportClientError: (message, route) =>
    request("/api/client-errors", { method: "POST", body: { message, route } }).catch(() => {}),

  listRecurringInvoices: () => request("/api/recurring-invoices"),
  getRecurringInvoice: (id) => request(`/api/recurring-invoices/${id}`),
  createRecurringInvoice: (payload) => request("/api/recurring-invoices", { method: "POST", body: payload }),
  setRecurringInvoiceStatus: (id, status) => request(`/api/recurring-invoices/${id}/status`, { method: "PUT", body: { status } }),
  generateRecurringInvoiceNow: (id) => request(`/api/recurring-invoices/${id}/generate-now`, { method: "POST" }),
  deleteRecurringInvoice: (id) => request(`/api/recurring-invoices/${id}`, { method: "DELETE" }),

  // Unauthenticated — no token attached, used by the public "view invoice
  // without logging in" page.
  getPublicInvoice: (token) => fetch(`${BASE_URL}/api/public/invoices/${token}`).then(async (res) => {
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "Invoice not found");
    return data;
  }),
  publicInvoicePdfUrl: (token) => `${BASE_URL}/api/public/invoices/${token}/pdf`,

  // Customer portal — a client's own login (email + password), separate
  // from the business login above. See setCustomerSession/portalRequest.
  getPortalInvite: (token) => fetch(`${BASE_URL}/api/portal-auth/invite/${token}`).then(async (res) => {
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "This link is invalid or no longer active.");
    return data;
  }),
  setPortalPassword: (token, password) => fetch(`${BASE_URL}/api/portal-auth/set-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, password }),
  }).then(async (res) => {
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "Couldn't set your password.");
    return data;
  }),
  portalLogin: (email, password) => fetch(`${BASE_URL}/api/portal-auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  }).then(async (res) => {
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error || "Invalid email or password");
    return data;
  }),
  getPortalMe: () => portalRequest("/api/portal/me"),
};
