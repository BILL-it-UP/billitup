# BillItUp

Free, open-source billing and invoicing software for any business — grocery stores, clothing shops, services, corporates. Anybody.

## Why

Paid billing software (Vyapar, Zoho Invoice, Marg, and others) dominates the small-business market in India. BillItUp is a free alternative: genuinely usable by a non-technical shop owner at a counter, and credible enough for corporate use.

## How it's different

Instead of shipping separate products for "billing only" vs "billing + inventory" vs "full POS," BillItUp asks at signup what kind of business this is and what the owner wants — stock tracking, tax on invoices, printer type, language — and configures itself accordingly. Billing is the one module everyone gets. Everything else is optional.

## Printing

Built to work with whatever's actually at the counter: A4 printers, and 3-inch/4-inch thermal receipt printers. No special drivers required — invoice templates render to the target paper size and print through the browser/OS print dialog, with direct ESC/POS thermal printing as a planned enhancement.

## Tech stack

- **Client:** React (Vite), built as a Progressive Web App — installable, offline-first
- **Server:** Node.js + Express
- **Database:** SQLite by default (zero-config self-hosting); Postgres-ready for larger deployments
- **Deployment:** Docker Compose — one command to self-host

## Data & updates

By default the SQLite database lives at `server/data/billitup.sqlite`. If you update by re-extracting a new release into the same folder, that's *inside* the folder being overwritten — depending on how your zip/extraction tool handles an existing folder, an update can end up wiping your data.

To avoid that, copy `server/.env.example` to `server/.env` and point `BILLITUP_DB_PATH` somewhere outside the project folder (the target folder is created automatically if it doesn't exist). Once set, your data lives there permanently and future updates never touch it.

## Status

Early scaffold — see `/docs` (or the project's planning docs) for the current feature spec. Not yet ready for production use.

## License

MIT — see [LICENSE](./LICENSE).
