import { formatDateTime, formatMoney } from "./format";

// Shared between AdminPanel.jsx (the businesses table, for row tooltips and
// stat-tile wording) and BusinessHealth.jsx (the per-business page, for its
// own "Copy details" button) so the wording of an attention reason, and the
// shape of a copied summary, can never drift between the two screens
// (2026-09-16 — previously duplicated in AdminPanel.jsx, moved out once the
// businesses table stopped having its own separate detail view).
export const ATTENTION_LABELS = {
  no_contact: "No email or phone on file",
  inactive: "Hasn't logged in for a while",
  backup_error: "Cloud backup is connected but failing",
  has_errors: "Has unresolved errors — open their health page",
  has_open_ticket: "Waiting on a reply in Support",
};

// A plain, fully-labelled block instead of a raw table row — Naveen asked
// that anything he copies out of the admin page be easy to understand on its
// own, e.g. pasted into WhatsApp or a note, without needing column headers
// alongside it for context (2026-09-15).
export function buildBusinessSummary(b) {
  const backupLine =
    b.cloud_backup_status === "error"
      ? "Connected, but the last upload failed"
      : b.cloud_backup_status === "connected"
        ? "Connected"
        : "Not connected";
  return [
    `BillItUp business: ${b.name}`,
    `Plan: ${b.plan === "premium" ? "Premium" : "Free"}`,
    `Contact: ${[b.owner_email, b.owner_phone].filter(Boolean).join(", ") || "Not provided"}`,
    `GSTIN: ${b.gstin || "Not set"}`,
    `State: ${b.state || "Not set"}`,
    `Customers: ${b.customer_count}`,
    `Invoices: ${b.invoice_count} (₹${formatMoney(b.invoiced_total)} invoiced)`,
    `Last login: ${b.last_login_at ? formatDateTime(b.last_login_at) : "Never"}`,
    `Signed up: ${formatDateTime(b.created_at)}`,
    `Cloud backup: ${backupLine}`,
    `Open errors: ${b.open_error_count || 0}`,
    `Open support conversations: ${b.open_ticket_count || 0}`,
    ...(b.attention?.length ? [`Needs attention: ${b.attention.map((r) => ATTENTION_LABELS[r] || r).join("; ")}`] : []),
  ].join("\n");
}
