// Relative status labels for an invoice row — "Overdue by N days" / "Due in
// N days" instead of a plain date, matching the phrasing on Zoho's own
// invoice list. Computed client-side from due_date + today so it's always
// current, never a stale stored value.
export function relativeDueLabel(invoice) {
  const STATUS_LABEL = {
    draft: "Draft",
    sent: "Sent",
    paid: "Paid",
    partially_paid: "Partially paid",
  };

  if (invoice.status === "cancelled") return { text: "Cancelled", tone: "cancelled" };
  if (invoice.status === "paid") return { text: "Paid", tone: "paid" };
  if (invoice.status === "draft") return { text: "Draft", tone: "draft" };

  if (invoice.due_date) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due = new Date(invoice.due_date + "T00:00:00");
    const days = Math.round((due - today) / 86400000);
    if (invoice.is_overdue || (days < 0 && Number(invoice.balance_due) > 0)) {
      return { text: `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`, tone: "overdue" };
    }
    if (days === 0) return { text: "Due today", tone: "due-soon" };
    if (days > 0) return { text: `Due in ${days} day${days === 1 ? "" : "s"}`, tone: "due" };
  }

  return { text: STATUS_LABEL[invoice.status] || invoice.status, tone: invoice.status };
}

// The metrics strip shown above the Invoices list (Total Outstanding, Due
// Today, Due Within 30 Days, Overdue) — matches the "Payment Summary" bar on
// Zoho's own Invoices page. Computed client-side from whatever invoice rows
// are already loaded, the same list every role can already see, so no extra
// permission or API call is needed for these four (2026-09-16).
export function computePaymentSummary(invoices) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let totalOutstanding = 0, dueToday = 0, dueWithin30 = 0, overdue = 0;

  for (const invoice of invoices) {
    if (invoice.status === "cancelled") continue;
    const balance = Number(invoice.balance_due) || 0;
    if (balance <= 0) continue;
    totalOutstanding += balance;
    if (!invoice.due_date) continue;

    const due = new Date(invoice.due_date + "T00:00:00");
    const days = Math.round((due - today) / 86400000);
    if (days < 0) overdue += balance;
    else if (days === 0) dueToday += balance;
    else if (days <= 30) dueWithin30 += balance;
  }

  return { totalOutstanding, dueToday, dueWithin30, overdue };
}
