// Multi-currency support (2026-09-16) — the client-side twin of
// server/src/lib/currency.js (same reasoning: no live exchange-rate
// conversion, just picking which currency an invoice is billed in). The
// symbol here is what's shown ON SCREEN, where any Unicode character
// renders fine — the server's own copy of this list uses ASCII-safe text
// instead, since pdfkit's PDF font can't reliably draw ₹/€/£ etc.
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

export function currencySymbol(currencyCode) {
  return CURRENCIES.find((c) => c.code === currencyCode)?.symbol || "₹";
}
