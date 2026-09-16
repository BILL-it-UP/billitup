// Converts an amount to words using the Indian numbering system
// (thousand/lakh/crore), matching the "Total In Words" line seen on Naveen's
// real invoices (e.g. "Indian Rupee Fifteen Thousand Only"). Extended
// 2026-09-16 to take a currency code, so a USD/EUR/etc invoice reads "US
// Dollar..."/"Euro..." instead of always saying "Indian Rupee" regardless
// of what currency the invoice actually says — the lakh/crore grouping
// itself is left as-is for every currency, matching how the rest of the
// app (line items, totals) is written.

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function threeDigitsToWords(n) {
  let str = "";
  if (n >= 100) {
    str += `${ONES[Math.floor(n / 100)]} Hundred `;
    n %= 100;
  }
  if (n >= 20) {
    str += `${TENS[Math.floor(n / 10)]} `;
    n %= 10;
  }
  if (n > 0) {
    str += `${ONES[n]} `;
  }
  return str.trim();
}

function integerToWords(n) {
  if (n === 0) return "Zero";
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  const parts = [];
  if (crore) parts.push(`${threeDigitsToWords(crore)} Crore`);
  if (lakh) parts.push(`${threeDigitsToWords(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigitsToWords(thousand)} Thousand`);
  if (hundred) parts.push(threeDigitsToWords(hundred));
  return parts.join(" ").trim();
}

// [major unit name, minor unit name] per currency code — only used to name
// the units in the words themselves; the numbering system stays the same.
const CURRENCY_UNIT_NAMES = {
  INR: ["Indian Rupee", "Paise"],
  USD: ["US Dollar", "Cents"],
  EUR: ["Euro", "Cents"],
  GBP: ["British Pound", "Pence"],
  AED: ["UAE Dirham", "Fils"],
  SGD: ["Singapore Dollar", "Cents"],
  AUD: ["Australian Dollar", "Cents"],
  CAD: ["Canadian Dollar", "Cents"],
  JPY: ["Japanese Yen", "Sen"],
};

export function amountToWords(amount, currencyCode) {
  const [majorName, minorName] = CURRENCY_UNIT_NAMES[currencyCode] || CURRENCY_UNIT_NAMES.INR;
  const value = Math.round((Number(amount) || 0) * 100) / 100;
  const major = Math.floor(value);
  const minor = Math.round((value - major) * 100);

  let words = `${majorName} ${integerToWords(major)}`;
  if (minor > 0) {
    words += ` and ${integerToWords(minor)} ${minorName}`;
  }
  return `${words} Only`;
}
