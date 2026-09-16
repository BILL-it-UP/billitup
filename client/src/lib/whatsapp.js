// Builds a wa.me deep link for sharing an invoice/reminder over WhatsApp —
// no API, no cost, no account to connect, which is how most small
// businesses in India actually reach their own clients day to day (2026-09-16).
//
// If the customer has a phone number on file, the link opens a chat with
// that exact contact, message already typed in. BillItUp is India-first, so
// a bare 10-digit number is assumed to be an Indian mobile and gets a 91
// country code prefixed; a number that already includes a country code (or
// a leading +) is used as typed, digits only. With no usable phone number,
// the link falls back to WhatsApp's generic share-text page, which just
// asks the person which chat to send it to instead of opening one directly.
export function buildWhatsappUrl(phone, message) {
  const text = encodeURIComponent(message);
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return `https://wa.me/?text=${text}`;
  const withCountryCode = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountryCode}?text=${text}`;
}
