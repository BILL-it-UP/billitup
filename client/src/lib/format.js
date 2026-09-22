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

// Timestamps from the server are stored as SQLite "datetime('now')" strings
// (UTC, space-separated, no timezone marker) or plain ISO — render either in
// the viewer's own locale/timezone rather than showing raw text.
export function formatDateTime(value) {
  if (!value) return "Never";
  const iso = value.includes("T") ? value : value.replace(" ", "T") + "Z";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

// Renders a plain "YYYY-MM-DD" date (as stored/sent by the server for
// invoice/quote/credit-note dates) according to a business's chosen
// date_format. Falls back to DD/MM/YYYY when no format is set, and returns
// the raw value unchanged if it isn't a plain date string — that way a
// missing/malformed value never disappears, it just isn't reformatted.
export function formatDate(value, format) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, yyyy, mm, dd] = match;
  switch (format) {
    case "MM/DD/YYYY":
      return `${mm}/${dd}/${yyyy}`;
    case "YYYY-MM-DD":
      return `${yyyy}-${mm}-${dd}`;
    case "DD/MM/YYYY":
    default:
      return `${dd}/${mm}/${yyyy}`;
  }
}

// Formats a customer's Billing or Shipping address (the structured Street
// 1/Street 2/City/State/Pin Code/Country fields, 2026-09-22) as an array of
// display lines, one per printed line, for the Bill To/Ship To block on an
// invoice, quote, or credit note. A blank city/state/pincode row, or a
// country line when it's just "India", is left out rather than printed
// empty. Also used by Customers.jsx's own joinAddress for its single-line
// list/Excel view of the same fields.
export function formatAddressLines({ line1, line2, city, state, pincode, country } = {}) {
  const cityStatePin = [city, state].filter(Boolean).join(", ") + (pincode ? ` - ${pincode}` : "");
  return [line1, line2, cityStatePin || null, country && country !== "India" ? country : null].filter(Boolean);
}
