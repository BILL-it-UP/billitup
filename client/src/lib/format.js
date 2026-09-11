// Shared number formatting for anything printed on an invoice/quote/credit
// note or shown in the app — Indian digit grouping (1,00,000 not 100,000) so
// amounts read the way an Indian client expects, matching what Zoho and every
// Indian accounting tool already does. Always 2 decimal places.
export function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatQty(value) {
  return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
