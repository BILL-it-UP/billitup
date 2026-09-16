# BillItUp

Free, open-source invoicing and billing software for corporates, agencies, and consultants — the businesses that send a proper GST-ready A4 invoice and get paid by bank transfer or UPI, not the ones running a shop counter.

**Live demo:** [billitup.in](https://billitup.in) — the author's own production install, publicly reachable. Sign up for a free account there to try it, or self-host your own copy (see below).

A marketing site lives in [`/landing`](./landing) (deploy it standalone at your domain); this repo's `client`/`server` folders are the invoicing app itself.

## Why

Paid billing software (Vyapar, Zoho Invoice, Marg, and others) dominates the small-business market in India — but most of it is built retail-first: thermal receipts, stock counts, a till. BillItUp is a free, open-source alternative built for the other half of Indian business: agencies, consultants, and small companies who bill on GST-ready A4 invoices with proper terms, PO references, and bank details.

## How it's different

No monthly subscription, no vendor holding your client list. BillItUp is MIT-licensed and self-hosted — the code runs on your own server, and your invoices and customer data stay there. Nothing in this list is held back for a paid tier; the only thing a premium plan (flipped by hand by whoever runs an install, no payment processor wired up) unlocks is running more than one firm under a single login.

## What it does

- Branded, GST-ready A4 invoices, quotes, credit notes, and recurring invoices — logo, address, bank/UPI details, signature, standard terms, and a proper "amount in words" line
- GST-aware throughout: regular GST, reverse charge, or no-GST per document, correct current tax slabs, and an automatic CGST/SGST/IGST split based on business and customer state
- A Report Library of 14 named reports (sales, receivables, payments, purchases) with Excel and PDF export, plus GSTR-1 and GSTR-3B filing helpers
- A customer portal — each client gets their own login to see their invoice status, download PDFs, and pay via a UPI QR code shown right on the invoice
- A basic Vendors/Purchases log for tracking what the business spends, alongside what it bills
- Multi-firm login — run more than one business under a single login and switch between them
- Client-facing shareable links — a customer can view and download one invoice's PDF with no login at all
- Email delivery through your own SMTP account (never a shared relay), with editable email templates per document type
- Multiple staff logins per business (Owner/Admin/Cashier roles), with login history
- Automated daily database backups, with optional cloud backup of a business's own data to Dropbox (Google Drive and OneDrive planned)
- A built-in Support chat and Announcements system, so a self-hoster can talk directly with whoever runs their install, and push a heads-up to every business at once
- Installable as a Progressive Web App

## Printing

A4 only — BillItUp is built for documents that get emailed and filed, not printed at a counter. Invoices render to A4 and print through the browser/OS print dialog, or download as a PDF.

## Tech stack

- **Client:** React (Vite), built as a Progressive Web App — installable, offline-capable app shell
- **Server:** Node.js + Express
- **Database:** SQLite by default (zero-config self-hosting); schema is kept portable for a future Postgres option on larger deployments
- **Deployment:** Docker Compose — one command to self-host

## Self-hosting quick start

```bash
git clone https://github.com/BILL-it-UP/billitup.git
cd billitup
cp server/.env.example server/.env
# edit server/.env — at minimum, set JWT_SECRET and APP_URL (see the comments in that file)
docker compose up --build
```

This builds and starts two containers: the API server (port 4000) and the client, served by nginx on port 8080. Open `http://localhost:8080` (or your real domain once it's pointed at this machine) and sign up for the first account.

Your database lives in the `billitup_data` Docker volume, so it survives container rebuilds. `server/.env.example` documents every setting, including how to point backups at a cloud-synced folder and how to enable Dropbox cloud backup for individual businesses.

## Data & updates

Running outside Docker? By default the SQLite database lives at `server/data/billitup.sqlite` — *inside* the folder a fresh git pull or zip extraction touches. Set `BILLITUP_DB_PATH` in `server/.env` to somewhere outside the project folder so an update never risks your data; see the comments in `server/.env.example` for details. Schema changes in each update are applied automatically and safely to your existing database on startup — there's no manual migration step.

## Status

Actively developed and in daily production use — see [`billitup.in`](https://billitup.in). The project welcomes issues, feature requests, and pull requests from anyone who wants to self-host or improve it; see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to set up a local development environment and submit changes.

## License

MIT — see [LICENSE](./LICENSE).
