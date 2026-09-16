// Multi-currency support (2026-09-16) — deliberately no live exchange-rate
// conversion. A business just picks which currency a given invoice is
// billed in; BillItUp shows that currency's own symbol/prefix everywhere
// that invoice appears, and never adds amounts across different currencies
// together (see routes/reports.js and the Dashboard summary cards, which
// stay INR-only and assume a business invoicing in more than one currency
// treats those totals as approximate — a documented simplification, not an
// oversight).
//
// PDFs are drawn with pdfkit's built-in Helvetica font, which can't render
// the Rupee sign (₹) or most other currency glyphs reliably — that's why
// the existing INR documents already print "Rs" as plain text instead of
// ₹. The same reasoning extends to every other currency here: PRINT_PREFIX
// is always plain ASCII-safe text, never a symbol.
export const CURRENCIES = [
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "AED", symbol: "AED", name: "UAE Dirham" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
];

// What gets printed on a generated PDF in place of the old hardcoded "Rs" —
// INR keeps exactly the same "Rs" text every existing invoice already uses,
// every other currency prints its ISO code instead of a symbol pdfkit's
// default font might not have (2026-09-16).
export function printPrefix(currencyCode) {
  return currencyCode && currencyCode !== "INR" ? currencyCode : "Rs";
}

export function currencyName(currencyCode) {
  return CURRENCIES.find((c) => c.code === currencyCode)?.name || "Indian Rupee";
}
