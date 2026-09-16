// SQLite database setup — zero-config, one file, no separate DB server to run.
// Swappable for Postgres later for larger multi-tenant hosted deployments;
// keep queries simple/portable where practical to make that migration easier.

import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const dbPath = process.env.BILLITUP_DB_PATH || path.join(__dirname, "..", "data", "billitup.sqlite");

// Make sure the folder exists — matters when BILLITUP_DB_PATH points somewhere
// that hasn't been created yet (e.g. a fresh location outside the app folder,
// see .env.example: keeping the database outside the folder that update zips
// get extracted into is what stops re-installing an update from wiping data).
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Core schema — deliberately minimal for v1 (Invoice-level scope: billing,
// customers, items, payments — no double-entry ledger). Extend per
// /projects overview.md and invoice-template-spec.md as scope is confirmed.
db.exec(`
CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  business_type TEXT,            -- unused since BillItUp narrowed to corporate/A4 invoicing; column kept so nothing breaks for existing installs
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  gstin TEXT,
  logo_path TEXT,
  invoice_prefix TEXT DEFAULT 'INV-',
  next_invoice_number INTEGER DEFAULT 1,
  quote_prefix TEXT DEFAULT 'QUO-',
  next_quote_number INTEGER DEFAULT 1,
  credit_note_prefix TEXT DEFAULT 'CN-',
  next_credit_note_number INTEGER DEFAULT 1,
  default_paper_size TEXT DEFAULT 'A4',   -- unused since BillItUp went A4-only; column kept for existing installs
  inventory_enabled INTEGER DEFAULT 0,    -- unused since the inventory module was dropped; column kept for existing installs
  -- SMTP settings for emailing invoices/quotes as PDF — each self-hosted business
  -- brings its own mail account (e.g. a Gmail app password); nothing is sent
  -- through a shared BillItUp relay.
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_secure INTEGER DEFAULT 0,
  smtp_user TEXT,
  smtp_pass TEXT,
  smtp_from_name TEXT,
  smtp_from_email TEXT,
  -- Invoice branding & payment details — printed on every invoice/quote/credit
  -- note (paper and PDF). logo/signature are stored as data: URLs so a small
  -- self-hosted install doesn't need a separate file-upload/static-serving path.
  logo_data_url TEXT,
  bank_account_name TEXT,
  bank_name TEXT,
  bank_account_number TEXT,
  bank_ifsc TEXT,
  bank_upi_id TEXT,
  terms_and_conditions TEXT,
  signature_data_url TEXT,
  signature_name TEXT,
  -- Off by default so nobody's existing invoice numbering changes underneath
  -- them. When on, invoice numbers reset to 1 at the start of each Indian
  -- financial year (April) and carry the FY in the number itself — see
  -- invoice_number_counters below and lib/invoiceNumbering.js.
  reset_invoice_numbering_yearly INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',   -- owner | admin | cashier
  last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- One row per successful login — lets an owner see who's actually using the
-- system and from where, and gives us something to look at later if someone
-- reports "I can't get in" or "someone else is in my account".
CREATE TABLE IF NOT EXISTS login_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  ip_address TEXT,
  user_agent TEXT,
  logged_in_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  billing_address TEXT,
  shipping_address TEXT,
  gstin TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT DEFAULT 'pcs',
  rate REAL NOT NULL DEFAULT 0,
  tax_rate REAL DEFAULT 0,
  hsn_sac_code TEXT,
  stock_qty REAL,                 -- unused since the inventory module was dropped; column kept for existing installs
  low_stock_threshold REAL,       -- unused since the inventory module was dropped; column kept for existing installs
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  item_id INTEGER NOT NULL REFERENCES items(id),
  delta REAL NOT NULL,             -- positive = stock added, negative = removed
  reason TEXT,                     -- e.g. restock, damage, correction
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  customer_id INTEGER REFERENCES customers(id),
  invoice_number TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  due_date TEXT,
  terms TEXT,
  reference TEXT,
  subject TEXT,                   -- one-line "what this invoice is for", shown under the invoice meta
  gstin TEXT,                     -- customer's GSTIN as of this invoice — usually copied from the customer record, editable per-invoice for a customer with more than one GST registration
  status TEXT DEFAULT 'draft',    -- draft | sent | paid | partially_paid | overdue
  sub_total REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  tax_total REAL DEFAULT 0,
  total REAL DEFAULT 0,
  balance_due REAL DEFAULT 0,
  notes TEXT,
  -- Lets a customer open a read-only, no-login view of this exact invoice
  -- (client-facing sharing) — a long random token rather than the numeric id,
  -- so the link can't be guessed by walking ids.
  public_token TEXT UNIQUE,
  recurring_invoice_id INTEGER REFERENCES recurring_invoices(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES items(id),
  description TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  rate REAL NOT NULL DEFAULT 0,
  discount REAL DEFAULT 0,
  tax_rate REAL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  customer_id INTEGER REFERENCES customers(id),
  quote_number TEXT NOT NULL,
  quote_date TEXT NOT NULL,
  expiry_date TEXT,
  reference TEXT,
  status TEXT DEFAULT 'draft',    -- draft | sent | accepted | declined | converted
  sub_total REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  tax_total REAL DEFAULT 0,
  total REAL DEFAULT 0,
  notes TEXT,
  converted_invoice_id INTEGER REFERENCES invoices(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quote_line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES items(id),
  description TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  rate REAL NOT NULL DEFAULT 0,
  discount REAL DEFAULT 0,
  tax_rate REAL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0
);

-- A credit note optionally references an invoice (refund/return against it,
-- reducing that invoice's balance_due) or can stand alone against a customer
-- (e.g. a goodwill credit). Kept separate from invoices/quotes since its
-- effect (crediting money back) is the opposite of both.
CREATE TABLE IF NOT EXISTS credit_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  customer_id INTEGER REFERENCES customers(id),
  invoice_id INTEGER REFERENCES invoices(id),
  credit_note_number TEXT NOT NULL,
  credit_note_date TEXT NOT NULL,
  reason TEXT,
  sub_total REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  tax_total REAL DEFAULT 0,
  total REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS credit_note_line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credit_note_id INTEGER NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES items(id),
  description TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  rate REAL NOT NULL DEFAULT 0,
  discount REAL DEFAULT 0,
  tax_rate REAL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0
);

-- A recurring invoice is a template (customer + line items + cadence) that
-- the server turns into a real invoice on schedule, so a business doesn't
-- have to re-create the same monthly retainer/subscription invoice by hand.
CREATE TABLE IF NOT EXISTS recurring_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  customer_id INTEGER REFERENCES customers(id),
  frequency TEXT NOT NULL DEFAULT 'monthly',   -- weekly | monthly | quarterly | yearly
  interval_count INTEGER NOT NULL DEFAULT 1,   -- e.g. every 2 months
  start_date TEXT NOT NULL,
  next_invoice_date TEXT NOT NULL,
  end_date TEXT,                               -- null = runs indefinitely
  status TEXT NOT NULL DEFAULT 'active',       -- active | paused | ended
  due_in_days INTEGER,                         -- generated invoice's due_date = its invoice_date + this
  reference TEXT,
  terms TEXT,
  notes TEXT,
  last_generated_invoice_id INTEGER REFERENCES invoices(id),
  last_generated_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recurring_invoice_line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recurring_invoice_id INTEGER NOT NULL REFERENCES recurring_invoices(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES items(id),
  description TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  rate REAL NOT NULL DEFAULT 0,
  discount REAL DEFAULT 0,
  tax_rate REAL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  amount REAL NOT NULL,
  mode TEXT,                      -- cash | upi | card | bank_transfer | cheque
  paid_at TEXT DEFAULT (datetime('now')),
  notes TEXT
);

-- One person's login (a row in "users") can belong to more than one firm —
-- e.g. an owner who runs two separate businesses can switch between them
-- without logging out. "users.business_id" stays each login's original/home
-- firm (kept so nothing else has to change); this table is the actual list
-- of firms a login can currently switch into, with the role that login has
-- in each one. A staff login (created via Settings > Staff Logins) still
-- gets exactly one membership row, so it behaves exactly as before.
CREATE TABLE IF NOT EXISTS memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  role TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, business_id)
);

-- "Forgot password" support. Only a SHA-256 hash of the actual reset token is
-- ever stored — the raw token exists only in the emailed link — so a leaked
-- database alone can't be used to reset anyone's password. Old/used rows are
-- cheap to leave in place (no cleanup job needed for how few of these there
-- will ever be), since expired/used tokens are simply never accepted again.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- One row per edit made to an already-created invoice. "snapshot" is the
-- full invoice header + line items exactly as they were right BEFORE this
-- edit overwrote them (JSON text) — cheap to store (invoices are small) and
-- means the previous version can always be shown later without having tried
-- to anticipate which fields someone might want to compare.
CREATE TABLE IF NOT EXISTS invoice_edit_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  edited_by_user_id INTEGER REFERENCES users(id),
  edited_by_name TEXT,
  previous_total REAL,
  new_total REAL,
  snapshot TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Only used when a business turns on "reset numbering by financial year"
-- (see businesses.reset_invoice_numbering_yearly). Each financial year gets
-- its own counter row (fy_key like "2026-27"), started fresh at 1, instead of
-- businesses.next_invoice_number which counts forever and never resets.
CREATE TABLE IF NOT EXISTS invoice_number_counters (
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  fy_key TEXT NOT NULL,
  next_number INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (business_id, fy_key)
);

-- Vendors/suppliers a business buys from — kept deliberately separate from
-- "customers" (who a business sells to) even though the shape is similar,
-- since mixing the two into one table would make every sales report have to
-- filter vendors back out. Basic record-keeping only, not a full purchase
-- ledger with its own tax return.
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  gstin TEXT,
  state TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- One row per bill/expense received from a vendor. tax_amount/total are
-- computed and stored at save time (amount * tax_rate/100, and their sum) so
-- they don't have to be recomputed from scratch every time the Purchases
-- list or its totals are shown.
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  vendor_id INTEGER REFERENCES vendors(id),
  purchase_date TEXT NOT NULL,
  bill_number TEXT,
  description TEXT,
  amount REAL NOT NULL DEFAULT 0,
  tax_rate REAL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- A lightweight in-app feedback box — any logged-in user (any role) can
-- suggest an improvement to the software itself, and an Owner/Admin can
-- review the list and mark items done. A category column was added just
-- after this table shipped (see ensureColumn below), so Naveen could tell
-- at a glance which part of the software a suggestion is about.
CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  user_id INTEGER REFERENCES users(id),
  user_name TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',   -- open | done
  created_at TEXT DEFAULT (datetime('now'))
);

-- A business's own connection to their personal Dropbox/Google Drive/OneDrive
-- (2026-09-15) — separate from the whole-install daily backup in lib/backup.js,
-- which is one raw SQLite file shared by every business on this install and
-- is deliberately never uploaded anywhere. This table just holds the OAuth
-- tokens for whichever cloud accounts a business has connected; what
-- actually gets uploaded is a fresh export of that one business's own data
-- only — see lib/cloudBackupExport.js.
CREATE TABLE IF NOT EXISTS cloud_backup_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  provider TEXT NOT NULL,               -- 'dropbox' | 'google_drive' | 'onedrive'
  access_token TEXT,
  refresh_token TEXT,
  account_label TEXT,                   -- the connected account's email/name, shown in Settings
  last_upload_at TEXT,
  last_upload_status TEXT,              -- 'ok' | 'error'
  last_error TEXT,
  connected_at TEXT DEFAULT (datetime('now')),
  UNIQUE(business_id, provider)
);

-- Technical errors (never customer/client data) tagged to whichever business
-- was making the request when it happened, so Master Admin's per-business
-- health page can show "what broke and where" without ever showing an
-- invoice, a customer name, or anything else that business's clients typed
-- in (2026-09-15). business_id is NULL for a crash that wasn't tied to any
-- one business's request (a background job, a hit before login). "source"
-- separates a server-side exception from a client-side one the browser
-- reported itself (see routes/clientErrors.js) — both land in the same
-- table so Naveen has one place to look, not two.
CREATE TABLE IF NOT EXISTS error_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER REFERENCES businesses(id),
  source TEXT NOT NULL DEFAULT 'server',  -- 'server' | 'client'
  route TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',    -- open | resolved
  resolution_notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);

-- A business raises a problem, Naveen replies, back and forth — replaces the
-- old one-way Suggestions box for anything that actually needs a
-- conversation rather than a feature request (2026-09-15). *_last_seen_at
-- is how each side's unread count is worked out (any message from the
-- other side newer than this) without a separate "read receipts" table.
CREATE TABLE IF NOT EXISTS support_tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',    -- open | in_progress | resolved
  business_last_seen_at TEXT DEFAULT (datetime('now')),
  admin_last_seen_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender TEXT NOT NULL,                   -- 'business' | 'admin'
  sender_name TEXT,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Naveen writes one of these from Master Admin (e.g. "new feature X is
-- live") and it's shown as a popup to every business the next time someone
-- there opens the app (2026-09-15). announcement_reads tracks who has
-- already seen it, per login (not per business), since different staff
-- under the same business each get their own popup once.
CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS announcement_reads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  read_at TEXT DEFAULT (datetime('now')),
  UNIQUE(announcement_id, user_id)
);

-- A flat comment thread on one invoice, visible to both the business and
-- that one customer (2026-09-16) — for "this line item looks wrong"-type
-- back-and-forth that otherwise happens over email/WhatsApp, disconnected
-- from the invoice itself. author_type tells the UI which side to show a
-- message as coming from; author_name is denormalized (copied at post time)
-- so a comment still reads sensibly even if the poster's own name changes
-- later or (for a business-side comment) their login is later removed.
CREATE TABLE IF NOT EXISTS invoice_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  author_type TEXT NOT NULL,   -- 'business' | 'customer'
  author_name TEXT,
  message TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Simple manual time logging (2026-09-16) — a consultant logs hours against
-- a customer (optionally tagged with a project name, reusing the same free-
-- text convention as invoices.project_name rather than a real Projects
-- table), then pulls any not-yet-billed entries onto an invoice as line
-- items from the New Invoice page. billed/invoice_id are set together once
-- an entry is actually added to an invoice, so it can't be billed twice.
CREATE TABLE IF NOT EXISTS time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  customer_id INTEGER REFERENCES customers(id),
  project_name TEXT,
  description TEXT,
  entry_date TEXT NOT NULL,
  hours REAL NOT NULL DEFAULT 0,
  rate REAL NOT NULL DEFAULT 0,
  billed INTEGER NOT NULL DEFAULT 0,
  invoice_id INTEGER REFERENCES invoices(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- A prepaid credit balance per customer (2026-09-16) — distinct from
-- milestone/progress billing (which tracks percent-of-project-completed
-- against a project total): this is a simple wallet a customer has funded
-- ahead of time, that future invoices can draw down against.
-- retainer_transactions is the ledger (every credit/debit, so the running
-- balance on customers.retainer_balance can always be explained); an
-- invoice that draws from it stores how much on invoices.retainer_applied.
CREATE TABLE IF NOT EXISTS retainer_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  amount REAL NOT NULL,
  type TEXT NOT NULL,   -- 'credit' | 'debit'
  note TEXT,
  invoice_id INTEGER REFERENCES invoices(id),
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// --- Migrations for existing databases -------------------------------------
//
// CREATE TABLE IF NOT EXISTS above only helps on a brand-new database — it's
// a no-op for a table that already exists, so it does NOT add new columns to
// a database someone already has on disk. That didn't matter before, because
// every local install used to get wiped on every update. Now that the data
// lives outside the update folder (see .env.example) and persists across
// updates, every column added after someone's first install needs to be
// added here too, or their existing database silently falls out of sync with
// the code and things break (missing column errors, or a feature that
// quietly can't store anything).
//
// ensureColumn is safe to call every time the server starts: it checks
// whether the column already exists before trying to add it, so re-running
// it on a database that's already up to date does nothing.
function ensureColumn(table, column, ddl) {
  const existing = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!existing.some((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

// businesses — every column added after the very first release
ensureColumn("businesses", "quote_prefix", "quote_prefix TEXT DEFAULT 'QUO-'");
ensureColumn("businesses", "next_quote_number", "next_quote_number INTEGER DEFAULT 1");
ensureColumn("businesses", "credit_note_prefix", "credit_note_prefix TEXT DEFAULT 'CN-'");
ensureColumn("businesses", "next_credit_note_number", "next_credit_note_number INTEGER DEFAULT 1");
ensureColumn("businesses", "default_paper_size", "default_paper_size TEXT DEFAULT 'A4'");
ensureColumn("businesses", "inventory_enabled", "inventory_enabled INTEGER DEFAULT 0");
ensureColumn("businesses", "smtp_host", "smtp_host TEXT");
ensureColumn("businesses", "smtp_port", "smtp_port INTEGER");
ensureColumn("businesses", "smtp_secure", "smtp_secure INTEGER DEFAULT 0");
ensureColumn("businesses", "smtp_user", "smtp_user TEXT");
ensureColumn("businesses", "smtp_pass", "smtp_pass TEXT");
ensureColumn("businesses", "smtp_from_name", "smtp_from_name TEXT");
ensureColumn("businesses", "smtp_from_email", "smtp_from_email TEXT");
// Per-business custom wording for outgoing document emails — see
// server/src/lib/emailTemplates.js. NULL/empty means "use the built-in
// default for this type", so a business that never opens Settings still
// gets a sensible, already-branded email (2026-09-15).
ensureColumn("businesses", "email_subject_invoice", "email_subject_invoice TEXT");
ensureColumn("businesses", "email_body_invoice", "email_body_invoice TEXT");
ensureColumn("businesses", "email_subject_quote", "email_subject_quote TEXT");
ensureColumn("businesses", "email_body_quote", "email_body_quote TEXT");
ensureColumn("businesses", "email_subject_credit_note", "email_subject_credit_note TEXT");
ensureColumn("businesses", "email_body_credit_note", "email_body_credit_note TEXT");
ensureColumn("businesses", "email_subject_reminder", "email_subject_reminder TEXT");
ensureColumn("businesses", "email_body_reminder", "email_body_reminder TEXT");
// Payment-receipt email — sent from the "record a payment" flow, offered
// automatically whenever the customer has an email on file (2026-09-15).
ensureColumn("businesses", "email_subject_receipt", "email_subject_receipt TEXT");
ensureColumn("businesses", "email_body_receipt", "email_body_receipt TEXT");
ensureColumn("businesses", "logo_data_url", "logo_data_url TEXT");
ensureColumn("businesses", "bank_account_name", "bank_account_name TEXT");
ensureColumn("businesses", "bank_name", "bank_name TEXT");
ensureColumn("businesses", "bank_account_number", "bank_account_number TEXT");
ensureColumn("businesses", "bank_ifsc", "bank_ifsc TEXT");
ensureColumn("businesses", "bank_upi_id", "bank_upi_id TEXT");
ensureColumn("businesses", "terms_and_conditions", "terms_and_conditions TEXT");
ensureColumn("businesses", "signature_data_url", "signature_data_url TEXT");
ensureColumn("businesses", "signature_name", "signature_name TEXT");
ensureColumn("businesses", "reset_invoice_numbering_yearly", "reset_invoice_numbering_yearly INTEGER DEFAULT 0");
// How dates print everywhere in the app (invoices, quotes, credit notes,
// list pages) — a business-level choice since different customers/regions
// expect different conventions. DD/MM/YYYY matches how dates are written
// day to day in India, so that's the default for a business that hasn't
// picked one.
ensureColumn("businesses", "date_format", "date_format TEXT DEFAULT 'DD/MM/YYYY'");
// Free vs premium. Enforced server-side only where it matters (adding more
// than one firm under a login) — see routes/auth.js. Since BillItUp's code
// is public, this only actually gates anything on installs we control
// ourselves; a self-hosted copy's owner has their own database anyway, and
// everything else in the app stays free for everyone regardless of this
// value.
ensureColumn("businesses", "plan", "plan TEXT DEFAULT 'free'");
// The business's own state (e.g. "Tamil Nadu") — compared against a
// customer's state to work out whether a supply is intra-state (CGST+SGST)
// or inter-state (IGST). See server/src/lib/gst.js.
ensureColumn("businesses", "state", "state TEXT");
// Split out of the old single "address" line, so there's room to actually
// write a full address plus a proper PIN code and country rather than
// cramming everything into one input. "address" itself keeps whatever was
// already typed there (usually the street/building/area line) — nothing is
// backfilled or reparsed automatically.
ensureColumn("businesses", "pincode", "pincode TEXT");
ensureColumn("businesses", "country", "country TEXT DEFAULT 'India'");
// The currency a NEW invoice defaults to (see lib/currency.js for the
// supported list) — a business billing only Indian clients never has to
// touch this, INR stays the default exactly as before (2026-09-16).
ensureColumn("businesses", "default_currency", "default_currency TEXT DEFAULT 'INR'");
// Automatic payment reminder emails — off by default so nobody's inbox
// starts getting reminder mail they didn't ask for. When on, a background
// job (lib/paymentReminders.js) sends the same "Payment Reminder" template
// already used by the manual "Send Payment Reminder" button, once before
// the due date and, optionally, repeating while overdue. 0 in either day
// field means "don't send that kind of reminder" (2026-09-16).
ensureColumn("businesses", "reminders_enabled", "reminders_enabled INTEGER DEFAULT 0");
ensureColumn("businesses", "reminder_days_before_due", "reminder_days_before_due INTEGER DEFAULT 3");
ensureColumn("businesses", "reminder_overdue_repeat_days", "reminder_overdue_repeat_days INTEGER DEFAULT 7");

// Off by default. When on, an invoice created by a Cashier login needs an
// explicit Owner/Admin approval before it can be emailed or marked Sent —
// a control gate so a junior staffer can't send wrong pricing straight to a
// client. An Owner/Admin's own invoices never need approving from
// themselves, whichever way this is set (2026-09-16).
ensureColumn("businesses", "require_invoice_approval", "require_invoice_approval INTEGER DEFAULT 0");

// The current RBI bank rate, as a plain percentage a business can update by
// hand from time to time — used only to compute the Section 43B(h) MSME
// late-payment interest estimate (3x this rate) shown on the Purchases page
// for an overdue bill from a vendor flagged as MSME-registered. Not fetched
// from anywhere automatically, since that would need an ongoing paid data
// feed for a number that changes only a few times a year (2026-09-16).
ensureColumn("businesses", "rbi_bank_rate", "rbi_bank_rate REAL DEFAULT 6.5");

// Self-reported annual turnover, used only to show an informational banner
// once it crosses the GST e-invoice (IRN) mandate's ₹5 crore threshold.
// BillItUp doesn't generate e-invoices itself either way — see
// eway_bill_number above for the same "manual tracker, not a government API
// integration" philosophy (2026-09-16).
ensureColumn("businesses", "annual_turnover", "annual_turnover REAL");

// items
ensureColumn("items", "low_stock_threshold", "low_stock_threshold REAL");

// customers
ensureColumn("customers", "state", "state TEXT");
ensureColumn("customers", "pincode", "pincode TEXT");
ensureColumn("customers", "country", "country TEXT DEFAULT 'India'");

// vendors — pincode/country added alongside the address split above; state
// already existed on vendors from when the table was first created.
ensureColumn("vendors", "pincode", "pincode TEXT");
ensureColumn("vendors", "country", "country TEXT DEFAULT 'India'");
// Section 43B(h) MSME 45-day payment rule (2026-09-16) — is_msme flags a
// vendor as Udyam-registered, and has_written_agreement decides which
// deadline applies from the invoice date (15 days with no agreement, 45
// days with one). Both off by default so an existing vendor's Purchases
// rows behave exactly as before until someone actually flags them.
ensureColumn("vendors", "is_msme", "is_msme INTEGER DEFAULT 0");
ensureColumn("vendors", "has_written_agreement", "has_written_agreement INTEGER DEFAULT 0");

// purchases — when a bill was actually paid (2026-09-16). NULL means still
// unpaid; this is the one field needed to tell whether an MSME vendor's
// 15/45-day deadline has actually been missed, without turning Purchases
// into a full accounts-payable module. billable_customer_id/billed_invoice_id
// let an expense be flagged as billable to a customer and then pulled onto
// an invoice as a line item, the same way unbilled time entries are.
ensureColumn("purchases", "paid_date", "paid_date TEXT");
ensureColumn("purchases", "billable_customer_id", "billable_customer_id INTEGER REFERENCES customers(id)");
ensureColumn("purchases", "billed_invoice_id", "billed_invoice_id INTEGER REFERENCES invoices(id)");

// customers — a per-customer portal login so each client can see the
// status of every invoice addressed to them. portal_token doubles as the
// one-time "set your password" / "reset your password" link token (like
// invoices.public_token, a long random value rather than the numeric id);
// it's cleared once used and regenerated whenever a new invite or reset is
// sent. portal_enabled is the on/off switch an Owner/Admin flips per
// customer — checked fresh on every portal request (see requireCustomerAuth
// in middleware/auth.js), not just at login, so turning it off cuts access
// immediately even if the client is already logged in. portal_password_hash
// stays set across an off/on toggle, so re-enabling doesn't force the
// client to set a new password.
ensureColumn("customers", "portal_token", "portal_token TEXT");
ensureColumn("customers", "portal_enabled", "portal_enabled INTEGER DEFAULT 0");
ensureColumn("customers", "portal_password_hash", "portal_password_hash TEXT");

// A prepaid retainer balance this customer has funded ahead of time — see
// retainer_transactions above for the ledger this running number is kept in
// sync with (2026-09-16).
ensureColumn("customers", "retainer_balance", "retainer_balance REAL DEFAULT 0");

// payments — how much of this payment was actually TDS the client deducted
// at source rather than cash/transfer received, so an Indian consultant can
// reconcile against Form 26AS/AIS at tax time. Counts toward the invoice's
// balance_due exactly like the rest of the payment (the money still went
// somewhere real, just to the government on the business's behalf), it's
// just broken out separately rather than lumped into "amount" (2026-09-16).
ensureColumn("payments", "tds_amount", "tds_amount REAL DEFAULT 0");

// suggestions — which part of the software a suggestion is about (Invoices,
// Reports, etc.), added right after the table itself so someone reviewing
// the list can tell at a glance instead of reading every message.
ensureColumn("suggestions", "category", "category TEXT DEFAULT 'general'");

// users
ensureColumn("users", "last_login_at", "last_login_at TEXT");

// invoices — shareable no-login view, and the link back to the recurring
// profile that generated an invoice (both added alongside recurring invoices
// and the client-facing share link)
ensureColumn("invoices", "public_token", "public_token TEXT");
ensureColumn("invoices", "recurring_invoice_id", "recurring_invoice_id INTEGER REFERENCES recurring_invoices(id)");
ensureColumn("invoices", "subject", "subject TEXT");
ensureColumn("invoices", "gstin", "gstin TEXT");
// GST treatment (regular / reverse charge / no GST) and the CGST/SGST/IGST
// split of tax_total, worked out at save time from the treatment plus the
// business's and customer's state — see server/src/lib/gst.js. Stored (not
// just computed on the fly) so a document keeps showing the split it was
// actually created with even if the customer's state is edited later.
ensureColumn("invoices", "gst_treatment", "gst_treatment TEXT DEFAULT 'gst'");
ensureColumn("invoices", "cgst", "cgst REAL DEFAULT 0");
ensureColumn("invoices", "sgst", "sgst REAL DEFAULT 0");
ensureColumn("invoices", "igst", "igst REAL DEFAULT 0");

// quotes / credit notes / recurring invoices — same GST treatment + split
ensureColumn("quotes", "gst_treatment", "gst_treatment TEXT DEFAULT 'gst'");
ensureColumn("quotes", "cgst", "cgst REAL DEFAULT 0");
ensureColumn("quotes", "sgst", "sgst REAL DEFAULT 0");
ensureColumn("quotes", "igst", "igst REAL DEFAULT 0");
ensureColumn("credit_notes", "gst_treatment", "gst_treatment TEXT DEFAULT 'gst'");
ensureColumn("credit_notes", "cgst", "cgst REAL DEFAULT 0");
ensureColumn("credit_notes", "sgst", "sgst REAL DEFAULT 0");
ensureColumn("credit_notes", "igst", "igst REAL DEFAULT 0");
ensureColumn("recurring_invoices", "gst_treatment", "gst_treatment TEXT DEFAULT 'gst'");

// E-Way Bill details — premium-only manual tracker (2026-09-14). BillItUp
// doesn't talk to the government e-way bill portal itself; a business on a
// premium plan can just record the details of an e-way bill already
// generated elsewhere (transporter, vehicle, distance, the e-way bill
// number) against an invoice, and it shows up on the invoice view/PDF. Free
// plan businesses never see these fields client-side, and the server drops
// any of them sent by a free-plan business rather than trusting the client
// — see routes/invoices.js.
ensureColumn("invoices", "eway_bill_number", "eway_bill_number TEXT");
ensureColumn("invoices", "eway_transporter_name", "eway_transporter_name TEXT");
ensureColumn("invoices", "eway_transporter_id", "eway_transporter_id TEXT");
ensureColumn("invoices", "eway_vehicle_number", "eway_vehicle_number TEXT");
ensureColumn("invoices", "eway_distance_km", "eway_distance_km REAL");

// Which currency this specific invoice was billed in (see lib/currency.js).
// Defaults to INR so every invoice created before this existed is treated
// exactly as it always was — nothing changes for a business that never
// touches the new currency picker (2026-09-16).
ensureColumn("invoices", "currency", "currency TEXT DEFAULT 'INR'");

// Automatic reminder tracking — when each kind of reminder was last sent
// for THIS invoice, so the background job (lib/paymentReminders.js) never
// sends the same "coming due" reminder twice, and only repeats an overdue
// one after the business's chosen gap (2026-09-16).
ensureColumn("invoices", "reminder_before_due_sent_at", "reminder_before_due_sent_at TEXT");
ensureColumn("invoices", "last_overdue_reminder_sent_at", "last_overdue_reminder_sent_at TEXT");

// Lightweight milestone/progress billing (2026-09-16) — deliberately just
// three fields on the invoice itself rather than a whole new Projects
// module, matching how Vendors/Purchases stayed a simple record-keeping
// table instead of a full ledger. Any invoice sharing the same project_name
// for the same customer counts toward that project's running total — see
// lib/projectProgress.js. All three are optional; an invoice that doesn't
// set project_name behaves exactly as before.
ensureColumn("invoices", "project_name", "project_name TEXT");
ensureColumn("invoices", "milestone_label", "milestone_label TEXT");
ensureColumn("invoices", "project_total_amount", "project_total_amount REAL");

// When a client actually opened this invoice — the public share link and
// the logged-in customer portal both stamp this the first (and, for
// last_viewed_at, every) time they load it, so a business doesn't have to
// wonder "did they even see it" before following up (2026-09-16).
ensureColumn("invoices", "first_viewed_at", "first_viewed_at TEXT");
ensureColumn("invoices", "last_viewed_at", "last_viewed_at TEXT");

// Internal approval gate (see businesses.require_invoice_approval above).
// 'not_required' is the default for every existing invoice and for any new
// one created while the business setting is off, or by an Owner/Admin —
// nothing changes for a business that never turns this on. created_by_role
// is a snapshot of the creator's role at the time, so a later role change
// doesn't retroactively change whether an old invoice needed approval.
ensureColumn("invoices", "approval_status", "approval_status TEXT DEFAULT 'not_required'");
ensureColumn("invoices", "created_by_user_id", "created_by_user_id INTEGER REFERENCES users(id)");
ensureColumn("invoices", "created_by_role", "created_by_role TEXT");

// How much of this invoice was paid down from the customer's own prepaid
// retainer balance rather than a real payment — see
// customers.retainer_balance / retainer_transactions above (2026-09-16).
ensureColumn("invoices", "retainer_applied", "retainer_applied REAL DEFAULT 0");

// Manual GST Invoice Management System status (2026-09-16) — the seller
// updates this by hand after checking the GST portal, where a B2B buyer can
// accept, reject, or leave an invoice pending; a rejected/pending invoice
// usually needs a credit note or a resend. NULL means "not checked / not
// applicable" (e.g. a B2C invoice with no GSTIN). BillItUp never talks to
// the GST portal itself to read or set this.
ensureColumn("invoices", "gst_ims_status", "gst_ims_status TEXT");

// Backfill: any invoice created before public_token existed (or before this
// migration ran) won't have one yet — give every such row a token so the
// "Copy shareable link" button always has something to share, not just
// invoices created after this update.
const invoicesMissingToken = db.prepare("SELECT id FROM invoices WHERE public_token IS NULL").all();
if (invoicesMissingToken.length > 0) {
  const setToken = db.prepare("UPDATE invoices SET public_token = ? WHERE id = ?");
  const backfill = db.transaction((rows) => {
    for (const row of rows) setToken.run(randomUUID().replace(/-/g, ""), row.id);
  });
  backfill(invoicesMissingToken);
}

// Backfill: any customer created before portal_token existed won't have one
// yet — same reasoning as the invoice public_token backfill above, so the
// "Copy portal link" button always has something to share.
const customersMissingPortalToken = db.prepare("SELECT id FROM customers WHERE portal_token IS NULL").all();
if (customersMissingPortalToken.length > 0) {
  const setPortalToken = db.prepare("UPDATE customers SET portal_token = ? WHERE id = ?");
  const backfillPortalTokens = db.transaction((rows) => {
    for (const row of rows) setPortalToken.run(randomUUID().replace(/-/g, ""), row.id);
  });
  backfillPortalTokens(customersMissingPortalToken);
}

// Backfill: every user created before the memberships table existed needs a
// membership row for their own (home) business, or they'd suddenly have zero
// firms to switch into. INSERT OR IGNORE so re-running this on a database
// that's already up to date does nothing.
const insertMembership = db.prepare(
  "INSERT OR IGNORE INTO memberships (user_id, business_id, role) VALUES (?, ?, ?)"
);
const backfillMemberships = db.transaction(() => {
  for (const user of db.prepare("SELECT id, business_id, role FROM users").all()) {
    insertMembership.run(user.id, user.business_id, user.role);
  }
});
backfillMemberships();
