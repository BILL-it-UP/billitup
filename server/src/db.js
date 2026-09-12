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

// items
ensureColumn("items", "low_stock_threshold", "low_stock_threshold REAL");

// users
ensureColumn("users", "last_login_at", "last_login_at TEXT");

// invoices — shareable no-login view, and the link back to the recurring
// profile that generated an invoice (both added alongside recurring invoices
// and the client-facing share link)
ensureColumn("invoices", "public_token", "public_token TEXT");
ensureColumn("invoices", "recurring_invoice_id", "recurring_invoice_id INTEGER REFERENCES recurring_invoices(id)");
ensureColumn("invoices", "subject", "subject TEXT");
ensureColumn("invoices", "gstin", "gstin TEXT");

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
