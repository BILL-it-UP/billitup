import { db } from "../db.js";

// Lightweight milestone/progress billing (2026-09-16) — see db.js for why
// this is just three plain columns on invoices rather than a whole new
// Projects table. "Billed to date" for a project is simply the sum of
// every non-cancelled invoice that shares the same business, customer, and
// project_name (matched case-insensitively, since a business retyping a
// project name across a few invoices over months is likely to vary
// capitalization). Shared by every place an invoice is rendered (the
// authenticated view, the emailed PDF, the public share link) so the
// number can never drift between them.
export function computeProjectProgress(invoice) {
  if (!invoice.project_name) return { project_billed_to_date: null, project_remaining: null };

  const row = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) AS billed
       FROM invoices
       WHERE business_id = ? AND customer_id IS ? AND status != 'cancelled' AND deleted_at IS NULL
         AND LOWER(TRIM(project_name)) = LOWER(TRIM(?))`
    )
    .get(invoice.business_id, invoice.customer_id, invoice.project_name);

  const billedToDate = Number(row?.billed) || 0;
  const remaining = invoice.project_total_amount != null
    ? Math.max(0, Number(invoice.project_total_amount) - billedToDate)
    : null;
  return { project_billed_to_date: billedToDate, project_remaining: remaining };
}
