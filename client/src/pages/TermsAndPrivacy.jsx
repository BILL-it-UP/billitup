import { Link } from "react-router-dom";

// A public, no-login Terms of Service + Privacy Policy page for the hosted
// service at billitup.in. First written 2026-09-15 as a short, honest
// starting point. Rewritten 2026-09-16 at Naveen's request into a fuller
// draft that actually covers what a live, India-facing invoicing product
// needs: a governing law clause, a real limitation of liability, an
// indemnification clause, and a Privacy Policy section that follows the
// Digital Personal Data Protection Act 2023 and the DPDP Rules 2025 (data
// principal rights, a named grievance contact, a breach notification
// commitment) rather than a generic template. Researched against DPDP
// Act/Rules requirements, the older IT Rules 2011 SPDI requirements, and
// common SaaS Terms of Service structure, then written specifically for
// what BillItUp actually is: free open source invoicing software, most of
// it self-hosted, with one hosted instance (billitup.in) that Naveen
// personally operates.
//
// THIS WAS A DRAFT AS OF 2026-09-15/16. The three open items from the first
// draft were resolved by Naveen on 2026-09-16:
//
// 1. WHO IS "WE". There's no company or LLP behind billitup.in, Naveen built
//    and runs it himself with no outside funding. He's chosen to describe
//    the operator as an individual trading under the BillItUp name, so
//    OPERATOR_NAME below reads "Naveen T, trading as BillItUp." This is an
//    honest description of the current setup, and can be swapped for a
//    registered entity's name later if Naveen sets one up (an OPC or LLP,
//    for instance), at which point this constant and the governing law/
//    liability sections should be reviewed again with that entity in mind.
// 2. GRIEVANCE OFFICER. Naveen is the named Grievance Officer, reachable at
//    the support email below. No separate postal address was given, an
//    email contact satisfies the DPDP Rules requirement on its own.
// 3. SERVER LOCATION. Confirmed hosted in India (Oracle Cloud's Mumbai or
//    Hyderabad region), so the Privacy Policy states data is stored in
//    India without needing a cross-border transfer disclosure. If the
//    hosting ever moves outside India, this section needs updating.
//
// A quick read-through by a lawyer familiar with Indian data protection and
// contract law is still worth doing before relying on this as a finished
// legal document, DPDP Rules enforcement is still being phased in and a
// couple of provisions (Significant Data Fiduciary rules, cross-border
// transfer restrictions) don't have final detail yet as of when this was
// written.
const UPDATED = "16 September 2026";
const CONTACT_EMAIL = "support@billitup.in";
const GRIEVANCE_OFFICER_NAME = "Naveen T";
const OPERATOR_NAME = "Naveen T, trading as BillItUp";
const GOVERNING_LAW_CITY = "Chennai, Tamil Nadu";

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
        <p className="legal-updated">Last updated {UPDATED}. This applies to the hosted service at billitup.in. If you're running your own self-hosted copy of the BillItUp source code, this document does not apply to you, see "Self-hosted copies" below.</p>

        <nav className="legal-toc">
          <a href="#terms">Terms of Service</a>
          <a href="#the-service">The Service</a>
          <a href="#self-hosted">Self-hosted copies</a>
          <a href="#eligibility">Eligibility</a>
          <a href="#accounts">Accounts</a>
          <a href="#plans">Free &amp; Premium plans</a>
          <a href="#acceptable-use">Acceptable Use</a>
          <a href="#your-data">Your Data</a>
          <a href="#tax-disclaimer">Tax &amp; Compliance</a>
          <a href="#third-party">Third Party Services</a>
          <a href="#availability">Availability &amp; Changes</a>
          <a href="#ip">Intellectual Property</a>
          <a href="#warranty">Warranty</a>
          <a href="#liability">Limitation of Liability</a>
          <a href="#indemnity">Indemnity</a>
          <a href="#termination">Termination</a>
          <a href="#changes-terms">Changes to These Terms</a>
          <a href="#governing-law">Governing Law</a>
          <a href="#general">General</a>
          <a href="#privacy">Privacy Policy</a>
          <a href="#what-we-collect">What Gets Collected</a>
          <a href="#how-used">How It's Used</a>
          <a href="#sharing">Who We Share It With</a>
          <a href="#storage">Where It's Stored</a>
          <a href="#retention">How Long We Keep It</a>
          <a href="#security">Security</a>
          <a href="#your-rights">Your Rights</a>
          <a href="#children">Children</a>
          <a href="#grievance">Grievance Officer</a>
          <a href="#breach">Data Breach Notification</a>
          <a href="#changes-privacy">Changes to This Policy</a>
          <a href="#contact">Contact</a>
        </nav>

        <h2 id="terms">Terms of Service</h2>
        <p>
          BillItUp is a free, open source invoicing and billing application, built for consultants,
          agencies, and firms who bill for their work. These Terms of Service cover your use of the
          hosted version of BillItUp running at billitup.in, operated by {OPERATOR_NAME} ("we", "us", or
          "the operator"). By creating a business on billitup.in, or by using a business that someone
          else created there, you agree to these terms. If you don't agree, please don't use billitup.in.
        </p>

        <h2 id="the-service">The Service</h2>
        <p>
          BillItUp lets a business create and send invoices, quotes, and credit notes, record payments,
          manage customers and vendors, and generate GST related reports. It's a billing and record
          keeping tool, not a substitute for professional tax, accounting, or legal advice.
        </p>

        <h2 id="self-hosted">Self-hosted copies</h2>
        <p>
          BillItUp's source code is published on GitHub under the MIT license, and anyone can download it
          and run their own copy on their own server. If you're using a self-hosted copy, whether you set
          it up yourself or someone else did, these Terms of Service and this Privacy Policy do not apply
          to that copy at all. Whoever runs that server is entirely responsible for it, for its data, for
          its security, and for their own compliance with whatever laws apply to them. We have no access
          to, and no responsibility for, any self-hosted install we don't operate ourselves.
        </p>

        <h2 id="eligibility">Eligibility</h2>
        <p>
          You must be at least 18 years old, and you must have the authority to agree to these terms on
          behalf of yourself or the business you're signing up. billitup.in is meant for businesses and
          the people who work for them, it is not directed at children and we don't knowingly let a child
          create an account.
        </p>

        <h2 id="accounts">Accounts</h2>
        <ul>
          <li>You're responsible for keeping your login credentials confidential and for all activity under your account.</li>
          <li>Give us accurate information when you sign up, and keep your business's contact details reasonably up to date.</li>
          <li>One person can hold logins across more than one business (that's what the firm switcher and, on the Premium plan, adding another firm, are for), but each staff login you create for someone else is meant for that one person, not shared.</li>
          <li>Tell us promptly if you believe your account or a staff login has been compromised.</li>
        </ul>

        <h2 id="plans">Free &amp; Premium plans</h2>
        <p>
          Everything in BillItUp is free to use in one firm. Premium currently unlocks running more than
          one firm under the same login, and the optional E-Way Bill tracker on invoices. There's no
          automatic recurring billing set up yet, Premium access is granted by hand once payment is
          received directly (bank transfer, UPI, or another method we agree on), and can be revoked if
          that payment is later reversed or disputed. We may change what's included in Premium, add new
          paid features, or change how payment works, and we'll try to give reasonable notice of anything
          that affects an existing Premium account. [Refund policy to be confirmed, a reasonable default
          would be: a refund within 7 days of payment if you haven't used the Premium feature you paid
          for, at our discretion after that.]
        </p>

        <h2 id="acceptable-use">Acceptable Use</h2>
        <p>You agree not to use billitup.in to:</p>
        <ul>
          <li>Issue fraudulent, deceptive, or knowingly incorrect invoices or tax documents.</li>
          <li>Attempt to gain unauthorized access to another business's data or account.</li>
          <li>Interfere with or disrupt the service, or probe it for security vulnerabilities without our permission.</li>
          <li>Scrape, automate, or place excessive load on the service in a way that affects other businesses using it.</li>
          <li>Use the invoice or customer portal email features to send spam or unsolicited bulk messages.</li>
          <li>Circumvent the Free/Premium distinction other than by paying for Premium.</li>
          <li>Use the service for any purpose that violates applicable law.</li>
        </ul>
        <p>
          We can suspend or terminate an account that breaks these rules, see "Termination" below.
        </p>

        <h2 id="your-data">Your Data</h2>
        <p>
          Your business's data, meaning your invoices, customers, vendors, items, and everything else you
          enter, belongs to you, not to us. We only use it to run the service for you (generating your
          documents, sending the emails you ask it to send, showing you your own reports). Where your
          business enters personal data about your own customers (their name, email, billing details, and
          so on), you are the one responsible for that data under data protection law, we're simply
          hosting the infrastructure your business uses to process it. You can export your data (several
          pages have an Excel export built in) or delete your business's account and all of its data at
          any time from Settings.
        </p>

        <h2 id="tax-disclaimer">Tax &amp; Compliance</h2>
        <p>
          BillItUp's GST treatment options, tax calculations, GSTR-1 and GSTR-3B helpers, and other
          compliance-related features are tools to help you organize your own numbers, they are not tax,
          accounting, or legal advice, and we don't guarantee they're correct for your specific situation.
          You're responsible for making sure the GST treatment, invoice numbering, and figures on every
          document you issue are correct, and for your own GST filings. Please check anything that matters
          with your own chartered accountant or tax advisor before relying on it.
        </p>

        <h2 id="third-party">Third Party Services</h2>
        <p>
          If you connect your own email account (SMTP) to send invoices, or connect a cloud storage
          account (Dropbox, Google Drive, or OneDrive) for backups, those services are governed by their
          own terms and privacy policies, not ours. We store the credentials or tokens you give us only to
          make that connection work on your behalf, and we're not responsible for those third party
          services being unavailable, changing their own terms, or losing data on their end.
        </p>

        <h2 id="availability">Availability &amp; Changes</h2>
        <p>
          We try to keep billitup.in running reliably, and we take automated daily backups, but we don't
          promise a specific uptime guarantee, especially on the Free plan. Features may be added, changed,
          or removed over time. Please keep your own exports of anything critical, a backup on our end is a
          safety net, not a substitute for you having your own copy of your own data.
        </p>

        <h2 id="ip">Intellectual Property</h2>
        <p>
          The BillItUp name, logo, and the look and feel of the billitup.in site belong to us. The
          underlying source code is separately available on GitHub under the MIT license, using the
          hosted service at billitup.in doesn't give you any rights to our branding beyond what's needed
          to use the service itself, and doesn't take away your right to use the open source code under
          its own license. Your business's own data and content stay yours, using billitup.in doesn't
          transfer any ownership of it to us.
        </p>

        <h2 id="warranty">Warranty</h2>
        <p>
          billitup.in is provided "as is" and "as available," without warranty of any kind, express or
          implied, including any warranty of merchantability, fitness for a particular purpose, or non
          infringement. We don't warrant that the service will be uninterrupted, error free, or free of
          bugs.
        </p>

        <h2 id="liability">Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, we are not liable for any indirect, incidental,
          special, or consequential damages, or for any loss of profits, revenue, data, or business
          opportunity, arising from your use of billitup.in, even if we've been told such damages are
          possible. This includes, without limitation, errors in invoices, tax calculations, or reports
          the service generates, and any loss caused by a third party service you've connected. Where a
          court decides we can still be held liable despite the above, our total liability to you for any
          claim relating to billitup.in is limited to the amount you paid us in the 12 months before the
          claim arose, or 5,000 rupees, whichever is greater, for a business on the Free plan that hasn't
          paid us anything.
        </p>

        <h2 id="indemnity">Indemnity</h2>
        <p>
          You agree to indemnify and hold us harmless from any claim, loss, or expense (including
          reasonable legal fees) arising from your use of billitup.in, the data or content you put into
          it, your violation of these terms, or your violation of any law or a third party's rights.
        </p>

        <h2 id="termination">Termination</h2>
        <p>
          You can stop using billitup.in and delete your business's account at any time from Settings. We
          can suspend or terminate an account that breaks the Acceptable Use section above, or that we
          reasonably believe is being used fraudulently, after trying to notify you first where practical.
          If your account is terminated, we'll give you a reasonable window to export your data before it's
          deleted, except where we're required to remove it sooner, or where you deleted it yourself.
        </p>

        <h2 id="changes-terms">Changes to These Terms</h2>
        <p>
          We may update these terms from time to time. If we make a material change, we'll update the date
          at the top of this page and, where practical, let you know through an in app announcement or by
          email. Continuing to use billitup.in after a change takes effect means you accept the updated
          terms.
        </p>

        <h2 id="governing-law">Governing Law</h2>
        <p>
          These terms are governed by the laws of India. Any dispute arising from these terms or your use
          of billitup.in is subject to the exclusive jurisdiction of the courts of {GOVERNING_LAW_CITY}.
        </p>

        <h2 id="general">General</h2>
        <p>
          If any part of these terms turns out to be unenforceable, the rest still applies. Our failure to
          enforce a provision isn't a waiver of it. You can't assign your rights under these terms to
          someone else without our consent, we may assign ours in connection with a merger, sale, or
          transfer of billitup.in. Neither of us is liable for a delay or failure caused by something
          reasonably outside our control. These terms, together with the Privacy Policy below, are the
          entire agreement between us about billitup.in.
        </p>

        <h2 id="privacy">Privacy Policy</h2>
        <p>
          This Privacy Policy explains what personal data billitup.in collects, why, and what rights you
          have over it. It's written to follow India's Digital Personal Data Protection Act 2023 and the
          DPDP Rules 2025. It covers the hosted service at billitup.in only, see "Self-hosted copies"
          above for why a self-hosted install is different.
        </p>

        <h2 id="what-we-collect">What Gets Collected</h2>
        <ul>
          <li><strong>Account information:</strong> your business name, address, GSTIN, and the name, email, and role of each staff login you create.</li>
          <li><strong>Business data you enter:</strong> customers, vendors, items, invoices, quotes, credit notes, and payment records, including personal data about your own customers where you enter it (name, email, phone, billing address, GSTIN).</li>
          <li><strong>Customer portal data:</strong> if you turn on portal access for a customer, their email and the invoices addressed to them become visible to that customer's own login.</li>
          <li><strong>SMTP credentials and cloud backup tokens:</strong> if you connect your own email account or a cloud storage account, those credentials or access tokens are stored so the app can act on your behalf, they're never used for anything else.</li>
          <li><strong>Technical and log data:</strong> login timestamps, IP address, and basic error logs (which route failed and a short error message, never the content of your invoices or customer records, see how Master Admin's error log is built for what's deliberately kept out).</li>
          <li><strong>Session storage:</strong> a login token kept in your browser's local storage so you stay signed in. We don't use third party advertising or analytics cookies.</li>
        </ul>

        <h2 id="how-used">How It's Used</h2>
        <p>
          We use your data only to provide the service back to you: generating your documents, sending
          the emails you ask it to send, showing you your own reports, keeping you signed in, and
          responding to support requests. We rely on your consent when you sign up, and on what's
          necessary to actually provide the service you've asked for.
        </p>

        <h2 id="sharing">Who We Share It With</h2>
        <p>
          We do not sell your data or your customers' data, and we don't use it for advertising. We share
          it only with: the infrastructure providers that host billitup.in (our cloud server and, if you
          connect one, your own SMTP or cloud backup provider, which you've chosen and authorized
          yourself), and where we're legally required to, for example in response to a valid court order or
          government request.
        </p>

        <h2 id="storage">Where It's Stored</h2>
        <p>
          billitup.in runs on a cloud server located in India. If that ever changes to a server outside
          India, we'll update this section and, if the law requires it at that point, seek any consent or
          meet any conditions that apply to that transfer.
        </p>

        <h2 id="retention">How Long We Keep It</h2>
        <p>
          We keep your data for as long as your account is active. If you delete your business's account,
          its data is deleted from our systems, except where we need to keep something for a limited time
          to meet a legal obligation (for example, records connected to a security incident) or to resolve
          a dispute.
        </p>

        <h2 id="security">Security</h2>
        <p>
          Passwords are never stored in plain text, they're hashed with bcrypt. Traffic to billitup.in is
          encrypted in transit. We take daily backups. No system is perfectly secure, and we can't
          guarantee against every possible breach, but we take reasonable steps to protect your data and
          we'll tell you if something goes wrong, see "Data Breach Notification" below.
        </p>

        <h2 id="your-rights">Your Rights</h2>
        <p>Under the DPDP Act, you (or, for your own customers' data, the customer themselves) can:</p>
        <ul>
          <li>Ask for a summary of what personal data we hold and how it's being used.</li>
          <li>Ask us to correct or complete inaccurate data.</li>
          <li>Ask us to delete data, subject to any legal reason we might need to keep it.</li>
          <li>Withdraw consent at any time, as easily as you gave it, by deleting your account or writing to us.</li>
          <li>Nominate someone else to exercise these rights on your behalf if you're unable to.</li>
          <li>Raise a complaint with our Grievance Officer below, and, if unresolved, with India's Data Protection Board.</li>
        </ul>
        <p>
          For your own business, you can already do most of this yourself, exporting or deleting your data
          from Settings. For anything else, or for a request from one of your own customers, contact us
          using the details below.
        </p>

        <h2 id="children">Children</h2>
        <p>
          billitup.in is meant for businesses and the adults who run them. We don't knowingly collect
          personal data from children, and if we learn that a child's data has been given to us without
          appropriate consent from a parent or guardian, we'll delete it.
        </p>

        <h2 id="grievance">Grievance Officer</h2>
        <p>
          Questions, complaints, or requests about your personal data can be sent to our Grievance
          Officer: {GRIEVANCE_OFFICER_NAME}, reachable at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. We'll acknowledge your request and
          respond within a reasonable time, in line with what the DPDP Rules require.
        </p>

        <h2 id="breach">Data Breach Notification</h2>
        <p>
          If a personal data breach occurs on billitup.in that's likely to affect you, we'll notify you
          and, where the law requires it, the Data Protection Board of India, without unreasonable delay,
          describing what happened and what we're doing about it.
        </p>

        <h2 id="changes-privacy">Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time, in the same way described under "Changes to
          These Terms" above. We'll keep the "last updated" date at the top of this page current whenever
          we do.
        </p>

        <h2 id="contact">Contact</h2>
        <p>
          Questions about these terms or this privacy policy, for either the Terms of Service or the
          Privacy Policy, can be sent to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </div>
    </div>
  );
}
