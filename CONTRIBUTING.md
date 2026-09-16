# Contributing to BillItUp

Thanks for taking a look at BillItUp. This is a small, actively-developed open-source project — issues, bug reports, and pull requests are all welcome.

## Local development setup

You'll need **Node 22 LTS** (not Node 24.x — `better-sqlite3`, the database driver, doesn't build cleanly on it yet).

```bash
git clone https://github.com/BILL-it-UP/billitup.git
cd billitup

# Server
cd server
npm install
cp .env.example .env   # edit as needed — a bare install works for local dev with no changes
npm run dev             # runs on http://localhost:4000

# Client (in a second terminal)
cd client
npm install
npm run dev             # runs on http://localhost:5173, calls the API at localhost:4000
```

Open `http://localhost:5173` and sign up for a fresh account — that's the whole setup for local development.

Prefer Docker? `docker compose up --build` at the repo root does the same thing in two containers (server on 4000, client served by nginx on 8080) — see the README's self-hosting section.

## Project scope

BillItUp is deliberately **invoice-level, not full-accounting-level**: invoices, quotes, credit notes, payments, a basic vendors/purchases log, and the GST/reporting features built on top of that data. It does not keep a double-entry ledger (no Profit & Loss, Balance Sheet, Trial Balance, General Ledger) and has no plans to. If you're thinking about a feature, it's worth opening an issue to discuss scope before writing a lot of code — that saves everyone a rewrite.

## Database changes

Schema lives in `server/src/db.js`. A brand-new table uses `CREATE TABLE IF NOT EXISTS` directly in the main schema block. A new **column** on an existing table needs an `ensureColumn(table, column, ddl)` call as well, added right after the `CREATE TABLE IF NOT EXISTS` block — this is what lets an existing self-hosted install pick up your change safely on its next restart, without losing data or needing a manual migration step. Skipping this means anyone who already has a database from before your change gets a "no such column" error the moment your new code tries to use it.

## Code style

There's no linter/formatter enforced yet — match the style of the file you're editing (the codebase is plain JS/JSX throughout, no TypeScript). A few conventions worth following:

- Server routes live under `server/src/routes/`, one file per resource, mounted in `server/src/index.js`.
- Client pages live under `client/src/pages/`, shared UI under `client/src/components/`, and small helpers under `client/src/lib/`.
- Money/quantity values are formatted with `client/src/lib/format.js`'s `formatMoney`/`formatQty` (Indian comma grouping) rather than a bare `.toFixed(2)`.
- Dates are rendered per the business's own `date_format` setting via `formatDate`/`useDateFormat`, not a hardcoded format.

## Submitting a change

1. Fork the repo and create a branch for your change.
2. Keep pull requests focused — one feature or fix per PR is much easier to review than a batch of unrelated changes.
3. Describe what you tested. There's no automated test suite yet, so a clear description of manual verification (what you clicked, what you expected, what happened) is genuinely useful to a reviewer.
4. Open the PR against `main`.

## Reporting a bug

Open a GitHub issue with: what you did, what you expected, what actually happened, and whether you're running the live billitup.in install or a self-hosted copy (and if self-hosted, how — Docker Compose, or `npm run dev`). A screenshot or the browser console output is a big help for anything visual.

## Questions

Open an issue — there's no separate mailing list or chat for the open-source project itself. (If you're a business using the live billitup.in install and have a question about your own account, use the in-app Support chat instead — that reaches the person running that install directly.)
