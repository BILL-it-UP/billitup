// Builds a per-business export for the cloud-backup feature (2026-09-15).
//
// Deliberately NOT the same file as the whole-install daily backup in
// lib/backup.js. That backup is one raw SQLite file shared by every business
// on this install — uploading it straight to one business's personal
// Dropbox/Drive/OneDrive would hand them every other business's data too.
// This instead builds one JSON document containing only rows that belong to
// the business that connected the account, safe even if BillItUp later
// hosts unrelated businesses on the same install. It only covers a
// business's own billing records, not internal/operational rows like staff
// logins or suggestions, and it never includes a password hash of any kind.
import { db } from "../db.js";

function idsOf(rows) {
  return rows.map((r) => r.id);
}

function rowsForIds(table, column, ids) {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  return db.prepare(`SELECT * FROM ${table} WHERE ${column} IN (${placeholders})`).all(...ids);
}

export function buildBusinessExport(businessId) {
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(businessId);
  if (!business) throw new Error("Business not found");
  const { smtp_pass, ...safeBusiness } = business;

  const customers = db
    .prepare("SELECT * FROM customers WHERE business_id = ?")
    .all(businessId)
    .map(({ portal_password_hash, ...rest }) => rest);

  const items = db.prepare("SELECT * FROM items WHERE business_id = ?").all(businessId);
  const vendors = db.prepare("SELECT * FROM vendors WHERE business_id = ?").all(businessId);
  const purchases = db.prepare("SELECT * FROM purchases WHERE business_id = ?").all(businessId);

  const invoices = db.prepare("SELECT * FROM invoices WHERE business_id = ?").all(businessId);
  const invoiceIds = idsOf(invoices);
  const invoiceLineItems = rowsForIds("invoice_line_items", "invoice_id", invoiceIds);
  const payments = rowsForIds("payments", "invoice_id", invoiceIds);

  const quotes = db.prepare("SELECT * FROM quotes WHERE business_id = ?").all(businessId);
  const quoteLineItems = rowsForIds("quote_line_items", "quote_id", idsOf(quotes));

  const creditNotes = db.prepare("SELECT * FROM credit_notes WHERE business_id = ?").all(businessId);
  const creditNoteLineItems = rowsForIds("credit_note_line_items", "credit_note_id", idsOf(creditNotes));

  const recurringInvoices = db.prepare("SELECT * FROM recurring_invoices WHERE business_id = ?").all(businessId);
  const recurringInvoiceLineItems = rowsForIds(
    "recurring_invoice_line_items",
    "recurring_invoice_id",
    idsOf(recurringInvoices)
  );

  return {
    exported_at: new Date().toISOString(),
    exported_by: "BillItUp cloud backup",
    business: safeBusiness,
    customers,
    items,
    vendors,
    purchases,
    invoices,
    invoice_line_items: invoiceLineItems,
    payments,
    quotes,
    quote_line_items: quoteLineItems,
    credit_notes: creditNotes,
    credit_note_line_items: creditNoteLineItems,
    recurring_invoices: recurringInvoices,
    recurring_invoice_line_items: recurringInvoiceLineItems,
  };
}

export function buildBusinessExportFilename(business) {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const safeName = (business.name || "business").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "business";
  return `billitup-${safeName}-${stamp}.json`;
}
