import { Link } from "react-router-dom";

// A public, no-login Terms of Service + Privacy Policy page — added
// 2026-09-15 since BillItUp is a live product now, not just a private tool.
// This is a plain, generic starting point written for what BillItUp
// actually is (a free, open source, self-hosted GST invoicing app) rather
// than boilerplate copied from a typical SaaS — it does not collect
// payment details, does not sell data, and every business's data lives on
// whatever server that business deployed it to. Naveen should still have
// this reviewed before treating it as final; it is a reasonable first
// draft, not tailored legal advice.
const UPDATED = "September 2026";
const CONTACT_EMAIL = "support@billitup.in";

export default function TermsAndPrivacy() {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link to="/">
          <img src="/logo-header.png" alt="BillItUp" />
        </Link>
        <Link to="/login">Back to log in</Link>
      </header>

      <div className="legal-body">
        <h1>Terms of Service &amp; Privacy Policy</h1>
        <p className="legal-updated">Last updated {UPDATED}</p>

        <nav className="legal-toc">
          <a href="#terms">Terms of Service</a>
          <a href="#the-service">The Service</a>
          <a href="#accounts">Accounts &amp; Data</a>
          <a href="#acceptable-use">Acceptable Use</a>
          <a href="#warranty">Warranty &amp; Liability</a>
          <a href="#privacy">Privacy Policy</a>
          <a href="#what-we-collect">What Gets Collected</a>
          <a href="#how-used">How It's Used</a>
          <a href="#your-rights">Your Rights</a>
          <a href="#contact">Contact</a>
        </nav>

        <h2 id="terms">Terms of Service</h2>
        <p>
          BillItUp is a free, open source invoicing and billing application, built for consultants,
          agencies, and firms who bill for their work. It is available as source code you can self-host
          on your own server, and may also be offered as a hosted instance at billitup.in. By creating a
          business on BillItUp, or by using an instance someone else has set up for you, you agree to
          these terms.
        </p>

        <h2 id="the-service">The Service</h2>
        <p>
          BillItUp lets a business create and send invoices, quotes, and credit notes, record payments,
          manage customers and vendors, and generate GST-related reports. It is a billing tool, not a
          substitute for professional tax, accounting, or legal advice — you're responsible for making
          sure the GST treatment, numbering, and figures on documents you issue are correct for your
          business. The software is provided as-is and may be updated, changed, or discontinued at any
          time, including features described elsewhere in the app.
        </p>

        <h2 id="accounts">Accounts &amp; Data</h2>
        <ul>
          <li>You're responsible for keeping your login credentials confidential and for all activity under your account.</li>
          <li>Your business's data (invoices, customers, vendors, and everything else you enter) belongs to you, not to BillItUp.</li>
          <li>If you self-host BillItUp, that data lives entirely on the server you deployed it to, under your own control.</li>
          <li>If you use a hosted instance run by someone else, that operator is responsible for backing up and securing the underlying server.</li>
          <li>You can export your data (Excel exports are built into several pages) or delete your account's data at any time by contacting whoever operates your instance.</li>
        </ul>

        <h2 id="acceptable-use">Acceptable Use</h2>
        <p>You agree not to use BillItUp to:</p>
        <ul>
          <li>Issue fraudulent, deceptive, or knowingly incorrect invoices or tax documents.</li>
          <li>Attempt to gain unauthorized access to another business's data or account.</li>
          <li>Interfere with or disrupt the service, or probe it for security vulnerabilities without permission.</li>
          <li>Use the service for any purpose that violates applicable law.</li>
        </ul>

        <h2 id="warranty">Warranty &amp; Liability</h2>
        <p>
          BillItUp is provided free of charge, "as is," without warranty of any kind, express or implied,
          including any warranty of merchantability, fitness for a particular purpose, or non-infringement.
          To the maximum extent permitted by law, the developers and any operator of a hosted instance are
          not liable for any loss of data, revenue, or business arising from your use of the software,
          including errors in invoices, tax calculations, or reports it generates. If you're self-hosting
          the open source code, you take on full responsibility for how you run and secure it.
        </p>

        <h2 id="privacy">Privacy Policy</h2>
        <p>
          This section explains what information BillItUp collects and how it's used, for both
          self-hosted deployments and any hosted instance at billitup.in.
        </p>

        <h2 id="what-we-collect">What Gets Collected</h2>
        <ul>
          <li><strong>Account information:</strong> business name, address, GSTIN, and the name, email, and role of each staff login you create.</li>
          <li><strong>Business data you enter:</strong> customers, vendors, items, invoices, quotes, credit notes, and payment records.</li>
          <li><strong>Customer portal data:</strong> if you turn on portal access for a customer, their email and the invoices addressed to them become visible to that customer's own login.</li>
          <li><strong>SMTP credentials:</strong> if you connect your own email account to send invoices, those credentials are stored so the app can send mail on your behalf — they are never used for anything else.</li>
          <li><strong>Basic technical data:</strong> login timestamps and session tokens, used only to keep you signed in and to show staff login activity to owners/admins.</li>
        </ul>

        <h2 id="how-used">How It's Used</h2>
        <p>
          Data you enter is used only to provide the service back to you: generating documents, sending
          the emails you ask it to send, and producing the reports you request. BillItUp does not sell
          your data or your customers' data to third parties, and does not use it for advertising. On a
          self-hosted instance, no data ever leaves the server you control, other than emails you
          explicitly choose to send.
        </p>

        <h2 id="your-rights">Your Rights</h2>
        <p>
          You can access, export, correct, or delete the data associated with your business at any time.
          If a customer wants their portal account or the data it can see removed, the business that
          issued their invoices can turn off their portal access or delete their customer record. For
          questions about data held on a specific hosted instance, contact whoever operates it.
        </p>

        <h2 id="contact">Contact</h2>
        <p>
          Questions about these terms or this privacy policy can be sent to{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </div>
    </div>
  );
}
