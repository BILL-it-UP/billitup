// SQLite database setup — zero-config, one file, no separate DB server to run.
// Swappable for Postgres later for larger multi-tenant hosted deployments;
// keep queries simple/portable where practical to make that migration easier.

import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.BILLITUP_DB_PATH || path.join(__dirname, "..", "data", "billitup.sqlite");

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
  business_type TEXT,            -- e.g. grocery, clothing, services, corporate
  address TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  gstin TEXT,
  logo_path TEXT,
  invoice_prefix TEXT DEFAULT 'INV-',
  next_invoice_number INTEGER DEFAULT 1,
  default_paper_size TEXT DEFAULT 'A4',   -- A4 | THERMAL_3IN | THERMAL_4IN
  inventory_enabled INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_id INTEGER NOT NULL REFERENCES businesses(id),
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',   -- owner | admin | cashier
  created_at TEXT DEFAULT (datetime('now'))
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
  stock_qty REAL,                 -- null when inventory module is off
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
  status TEXT DEFAULT 'draft',    -- draft | sent | paid | partially_paid | overdue
  sub_total REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  tax_total REAL DEFAULT 0,
  total REAL DEFAULT 0,
  balance_due REAL DEFAULT 0,
  notes TEXT,
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

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  amount REAL NOT NULL,
  mode TEXT,                      -- cash | upi | card | bank_transfer | cheque
  paid_at TEXT DEFAULT (datetime('now')),
  notes TEXT
);
`);
