// Shared client-side math for the New Invoice / New Quote forms — mirrors the
// server-side calculation in server/src/routes/invoices.js and quotes.js so the
// live preview matches what actually gets saved. The server always recomputes
// and is the source of truth; this is only for on-screen feedback.

export const emptyLine = () => ({ item_id: "", description: "", qty: 1, rate: 0, discount: 0, tax_rate: 0 });

export function lineAmount(line) {
  const base = Number(line.qty) * Number(line.rate) - Number(line.discount || 0);
  return base + base * (Number(line.tax_rate || 0) / 100);
}

export function computeTotals(lines) {
  const subTotal = lines.reduce((sum, l) => sum + Number(l.qty) * Number(l.rate), 0);
  const discountTotal = lines.reduce((sum, l) => sum + Number(l.discount || 0), 0);
  const taxTotal = lines.reduce((sum, l) => sum + (lineAmount(l) - (Number(l.qty) * Number(l.rate) - Number(l.discount || 0))), 0);
  const total = subTotal - discountTotal + taxTotal;
  return { subTotal, discountTotal, taxTotal, total };
}
