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

export function setSession(token, user) {
  localStorage.setItem("billitup_token", token);
  localStorage.setItem("billitup_user", JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem("billitup_token");
  localStorage.removeItem("billitup_user");
}

export function getUser() {
  const raw = localStorage.getItem("billitup_user");
  return raw ? JSON.parse(raw) : null;
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

  listCustomers: () => request("/api/customers"),
  createCustomer: (payload) => request("/api/customers", { method: "POST", body: payload }),

  listItems: () => request("/api/items"),
  createItem: (payload) => request("/api/items", { method: "POST", body: payload }),

  listInvoices: () => request("/api/invoices"),
  getInvoice: (id) => request(`/api/invoices/${id}`),
  createInvoice: (payload) => request("/api/invoices", { method: "POST", body: payload }),
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
};
