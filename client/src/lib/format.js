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
