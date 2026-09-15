// Emails are compared case-insensitively everywhere in practice — Gmail,
// Outlook and every other real mail provider treat "Ashwin@Gmail.com" and
// "ashwin@gmail.com" as the same inbox. Nothing in BillItUp normalized this
// before: a business typing a customer's email with a capital letter (or a
// stray leading/trailing space from a copy-paste) would silently break that
// customer's portal login, and the same applied to staff/business logins.
// Every place that stores or looks up an email now goes through this first
// (2026-09-15).
export function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : email;
}
