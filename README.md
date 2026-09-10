# BillItUp

Free, open-source invoicing software for corporates, agencies, and consultants — the businesses that send a proper A4 invoice and get paid by bank transfer, not the ones running a shop counter.

A marketing site lives in [`/landing`](./landing) (deploy it standalone at your domain); this repo's `client`/`server` folders are the invoicing app itself.

## Why

Paid billing software (Vyapar, Zoho Invoice, Marg, and others) dominates the small-business market in India — but most of it is built retail-first: thermal receipts, stock counts, a till. BillItUp is a free, open-source alternative built for the other half of Indian business: agencies, consultants, and small companies who bill on GST-ready A4 invoices with proper terms, PO references, and bank details.

## How it's different

No monthly subscription, no vendor holding your client list. BillItUp is MIT-licensed and self-hosted — the code runs on your own server, and your invoices and customer data stay there. Billing, quotes, credit notes, and recurring invoices are all in the open-source core; nothing is held back for a paid tier.

## What it does

- Branded A4 invoices — logo, address, bank/UPI details, signature, and your standard terms, with a proper "amount in words" line
- Quotes that convert to invoices in one click once accepted
- Credit notes that adjust an invoice's balance automatically
- Recurring invoices — set a retainer once and BillItUp raises the next invoice on schedule
- Client-facing shareable links — a customer can view and download one invoice's PDF with no login
- Email delivery through your own SMTP account (never a shared relay)
- Multiple staff logins per business (Owner/Admin/Cashier roles), with login history

## Printing

A4 only — BillItUp is built for documents that get emailed and filed, not printed at a counter. Invoices render to A4 and print through the browser/OS print dialog, or download as a PDF.

## Tech stack

- **Client:** React (Vite), built as a Progressive Web App — installable, offline-first
- **Server:** Node.js + Express
- **Database:** SQLite by default (zero-config self-hosting); Postgres-ready for larger deployments
- **Deployment:** Docker Compose — one command to self-host

## Data & updates

By default the SQLite database lives at `server/data/billitup.sqlite`. If you update by re-extracting a new release into the same folder, that's *inside* the folder being overwritten — depending on how your zip/extraction tool handles an existing folder, an update can end up wiping your data.

To avoid that, copy `server/.env.example` to `server/.env` and point `BILLITUP_DB_PATH` somewhere outside the project folder (the target folder is created automatically if it doesn't exist). Once set, your data lives there permanently and future updates never touch it. Schema changes in each update are applied automatically and safely to your existing database on startup.

## Status

Early scaffold — see `/docs` (or the project's planning docs) for the current feature spec. Not yet ready for production use.

## License

MIT — see [LICENSE](./LICENSE).
