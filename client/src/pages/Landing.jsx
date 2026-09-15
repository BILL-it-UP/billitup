import { Link } from "react-router-dom";

// The public marketing page shown at "/" to a logged-out visitor (see the
// Home component in App.jsx — a logged-in user still lands on Dashboard).
// Adapted 2026-09-15 from /landing/index.html, a standalone marketing page
// that already existed in the repo but was never actually deployed
// anywhere — its content and design are ported here so billitup.in finally
// has a real home, with CTAs now pointing at /login and /signup instead of
// only at GitHub (the open-source/self-host story is still front and
// center, since that's the real differentiator, but most visitors just
// want to sign up and use the hosted app).
const GITHUB_URL = "https://github.com/BILL-it-UP/billitup";

const FEATURES = [
  {
    num: "01",
    title: "Branded A4 invoices",
    body: "Logo, address, bank/UPI details, signature and your standard terms — printed or emailed, with a proper “amount in words” line.",
  },
  {
    num: "02",
    title: "Quotes → Invoices",
    body: "Send an estimate, and once it's accepted, convert it to an invoice in one click — same line items, new sequence number.",
  },
  {
    num: "03",
    title: "Credit notes",
    body: "Issue a refund or correction against an invoice and its balance updates automatically — no manual reconciliation.",
  },
  {
    num: "04",
    title: "Recurring invoices",
    body: "Set a retainer once — weekly, monthly, quarterly, yearly — and BillItUp raises the next invoice on schedule, on its own.",
  },
  {
    num: "05",
    title: "Client-facing links",
    body: "Share a read-only link to one invoice — your client can view and download the PDF without ever needing a login.",
  },
  {
    num: "06",
    title: "Email, from your own address",
    body: "Invoices go out through your own SMTP account — a Gmail app password, or whatever you already use. Never a shared relay.",
  },
];

export default function Landing() {
  return (
    <div className="landing-page">
      <header className="site">
        <div className="wrap site-nav">
          <a className="brand" href="#top">
            <img src="/logo-header.png" alt="BillItUp" />
          </a>
          <nav className="links">
            <a href="#features">Features</a>
            <a href="#compare">Why BillItUp</a>
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
          </nav>
          <div className="cta">
            <Link className="btn btn-ghost btn-sm" to="/login">Log in</Link>
            <Link className="btn btn-primary btn-sm" to="/signup">Sign up free</Link>
          </div>
        </div>
      </header>

      <main id="top">
        <div className="wrap hero">
          <div>
            <span className="eyebrow">Open source &middot; Self-hosted &middot; MIT licensed</span>
            <h1>Invoicing built for how agencies actually bill — <em>not how shops do.</em></h1>
            <p className="lead">
              BillItUp is free, open-source invoicing for corporates, consultants and agencies: GST-ready
              A4 invoices, quotes, credit notes and recurring retainers.
            </p>
            <div className="actions">
              <Link className="btn btn-primary" to="/signup">Sign up &mdash; it's free</Link>
              <a className="btn btn-ghost" href={GITHUB_URL} target="_blank" rel="noreferrer">View source on GitHub</a>
            </div>
            <p className="trust">
              Open source <span className="dot">&middot;</span> MIT licensed{" "}
              <span className="dot">&middot;</span> self-host it, or use it hosted right here{" "}
              <span className="dot">&middot;</span> billitup.in
            </p>
          </div>

          <div className="mock-stage">
            <div className="mock-invoice">
              <span className="mock-badge">Balance Due &middot; Overdue</span>
              <div className="mock-top">
                <div className="mock-brand">
                  <div className="mark">B</div>
                  <div><b>Acme Consulting</b><span>GSTIN 29ABCDE1234F1Z5</span></div>
                </div>
                <div className="mock-doc-id">
                  <span className="label">INVOICE</span>
                  <span className="value l-num">INV-000214</span>
                </div>
              </div>
              <div className="mock-parties">
                <div><b>Bill To</b>Client Corp Pvt Ltd<br />Bengaluru, KA</div>
                <div style={{ textAlign: "right" }}><b>Terms</b>Net 15<br />PO-4021</div>
              </div>
              <table className="mock-table">
                <thead><tr><th>Description</th><th className="r">Qty</th><th className="r">Rate</th><th className="r">Amount</th></tr></thead>
                <tbody>
                  <tr><td>Retainer &mdash; Sept 2026</td><td className="r l-num">1</td><td className="r l-num">&#8377;50,000</td><td className="r l-num">&#8377;50,000</td></tr>
                  <tr><td>Trademark filing support</td><td className="r l-num">3</td><td className="r l-num">&#8377;4,500</td><td className="r l-num">&#8377;13,500</td></tr>
                </tbody>
              </table>
              <div className="mock-totals">
                <div><span>Sub Total</span><span className="l-num">&#8377;63,500.00</span></div>
                <div><span>GST (18%)</span><span className="l-num">&#8377;11,430.00</span></div>
                <div className="grand"><span>Total</span><span className="l-num">&#8377;74,930.00</span></div>
                <div className="due"><span>Balance Due</span><span className="l-num">&#8377;74,930.00</span></div>
              </div>
              <p className="mock-words">Total in words: Seventy-Four Thousand Nine Hundred Thirty Rupees Only</p>
            </div>
          </div>
        </div>

        <div className="strip">
          <div className="wrap">
            <div className="cell">
              <span className="eyebrow">Not a POS</span>
              <p><strong>No barcode scanners, no thermal receipts, no shelf inventory.</strong> One clean paper size — A4 — built for documents that get emailed and filed, not printed at a counter.</p>
            </div>
            <div className="cell">
              <span className="eyebrow">GST-ready</span>
              <p><strong>GSTIN, HSN/SAC, and tax breakdowns</strong> where a corporate invoice needs them — plus PO/reference numbers and payment terms your clients' finance teams expect.</p>
            </div>
            <div className="cell">
              <span className="eyebrow">Yours to run</span>
              <p><strong>Self-host it on your own server</strong> with Docker Compose, or sign up and let us run it for you. Either way, the code is on GitHub under MIT.</p>
            </div>
          </div>
        </div>

        <section id="features">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">What's on the invoice</span>
              <h2>Everything a corporate billing cycle needs, line by line.</h2>
              <p>Every feature below ships in the open-source core &mdash; nothing held back for a paid tier.</p>
            </div>
            <div className="ledger">
              {FEATURES.map((f) => (
                <div className="ledger-row" key={f.num}>
                  <div className="li-num l-num">{f.num}</div>
                  <div><h3>{f.title}</h3></div>
                  <p>{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="compare">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">Why BillItUp</span>
              <h2>Most billing software is built for the shop counter.</h2>
              <p>
                Vyapar, and tools like it, are excellent for retail — thermal receipts, stock counts, a
                till. BillItUp is built for the other half of Indian business: agencies, consultants, and
                small companies who send a proper A4 invoice and get paid by bank transfer.
              </p>
            </div>
            <div className="compare">
              <div className="col them">
                <div className="col-head">Typical billing software</div>
                <ul>
                  <li>Monthly subscription per user</li>
                  <li>Your client data lives on their servers</li>
                  <li>Retail-first: inventory, thermal printing, POS</li>
                  <li>Closed source</li>
                </ul>
              </div>
              <div className="col you">
                <div className="col-head">BillItUp</div>
                <ul>
                  <li>Free, MIT licensed</li>
                  <li>Self-hosted — your data stays on your server</li>
                  <li>Corporate-first: GST, PO refs, recurring retainers</li>
                  <li>Open source on GitHub</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="get-started">
          <div className="wrap">
            <div className="cta-band">
              <div>
                <h2>Start billing properly, for free.</h2>
                <p>Sign up and start invoicing in minutes, or read the code first and self-host it yourself — either way, it's yours.</p>
              </div>
              <div className="actions">
                <Link className="btn btn-primary" to="/signup">Sign up free</Link>
                <a className="btn btn-ghost" href={GITHUB_URL} target="_blank" rel="noreferrer">View on GitHub</a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <div className="brand">
            <img src="/logo-icon-512.png" alt="" />
            BillItUp &mdash; open-source invoicing for corporates, agencies &amp; consultants.
          </div>
          <div className="links">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer">GitHub</a>
            <a href={`${GITHUB_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">License</a>
            <Link to="/terms">Terms &amp; Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
