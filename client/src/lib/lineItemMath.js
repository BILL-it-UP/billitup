// Shared client-side math for the New Invoice / New Quote forms — mirrors the
// server-side calculation in server/src/routes/invoices.js and quotes.js so the
// live preview matches what actually gets saved. The server always recomputes
// and is the source of truth; this is only for on-screen feedback.

// item_name is the item-picker's own display text (client-side only — the
// server only ever stores `description`, so this never gets sent as a
// separate column, it just keeps the picker's search box in sync with the line).
export const emptyLine = () => ({ line_type: "item", item_id: "", item_name: "", description: "", qty: 1, rate: 0, discount: 0, tax_rate: 0, unit: "", hsn_sac_code: "" });

// A section header, Zoho's own "Insert New Header" (2026-09-21). A plain
// text divider between groups of lines, never a billable quantity or rate,
// so every numeric field is fixed at 0 rather than left editable.
export const emptyHeader = () => ({ line_type: "header", item_id: "", item_name: "", description: "", qty: 0, rate: 0, discount: 0, tax_rate: 0, unit: "", hsn_sac_code: "" });

export const isHeaderLine = (line) => line?.line_type === "header";

export function lineAmount(line) {
  if (isHeaderLine(line)) return 0;
  const base = Number(line.qty) * Number(line.rate) - Number(line.discount || 0);
  return base + base * (Number(line.tax_rate || 0) / 100);
}

export function computeTotals(lines) {
  const billable = lines.filter((l) => !isHeaderLine(l));
  const subTotal = billable.reduce((sum, l) => sum + Number(l.qty) * Number(l.rate), 0);
  const discountTotal = billable.reduce((sum, l) => sum + Number(l.discount || 0), 0);
  const taxTotal = billable.reduce((sum, l) => sum + (lineAmount(l) - (Number(l.qty) * Number(l.rate) - Number(l.discount || 0))), 0);
  const total = subTotal - discountTotal + taxTotal;
  return { subTotal, discountTotal, taxTotal, total };
}
