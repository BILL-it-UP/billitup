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
