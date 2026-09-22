import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, getUser, setSession, clearSession } from "../lib/api";
import { formatDateTime } from "../lib/format";
import {
  IconBuilding, IconImage, IconMail, IconBriefcase, IconTeam, IconCloud, IconTrash, IconAlert, IconInvoice, IconImport,
} from "../components/Icons";
import { INDIAN_STATES } from "../lib/gst";
import { CURRENCIES } from "../lib/currencies";
import { DEFAULT_TEMPLATES as DEFAULT_EMAIL_TEMPLATES } from "../lib/emailTemplates";
import InsertFieldSelect from "../components/InsertFieldSelect";
import ZohoImportCard from "../components/ZohoImportCard";

// A ready-to-send starting point for Terms & Conditions, shown as the
// field's real value (not grey hint text) whenever a business hasn't
// written their own — so a non-technical person sees usable wording
// straight away and can just edit or replace it, rather than stare at an
// empty box (2026-09-16).
const DEFAULT_TERMS_AND_CONDITIONS =
  "1. Payment is due within 15 days of the invoice date, unless a different due date is shown above.\n" +
  "2. Late payments may attract interest as permitted by law.\n" +
  "3. Goods once sold are not returnable or exchangeable.\n" +
  "4. All disputes are subject to the jurisdiction of the courts in our city only.";

// Plain names for every {{token}} an email template can use, and which
// ones apply to which document type — feeds InsertFieldSelect below so
// nobody has to know the {{...}} syntax exists to use it (2026-09-16).
const FIELD_LABELS = {
  customer_name: "Customer Name",
  business_name: "Business Name",
  document_number: "Document Number",
  amount: "Amount",
  balance_due: "Balance Due",
  due_date: "Due Date",
  amount_paid: "Amount Paid",
  status_line: "Payment Status Line",
};
const FIELDS_BY_TEMPLATE_TYPE = {
  invoice: ["customer_name", "business_name", "document_number", "amount"],
  quote: ["customer_name", "business_name", "document_number", "amount"],
  credit_note: ["customer_name", "business_name", "document_number", "amount"],
  reminder: ["customer_name", "business_name", "document_number", "amount", "balance_due", "due_date"],
  receipt: ["customer_name", "business_name", "document_number", "amount_paid", "balance_due", "status_line"],
};

// Splices {{token}} into a field's current text at the cursor (or at the
// end, if the field never had focus), and returns where the cursor should
// land afterward so InsertFieldSelect can put it back exactly there.
function insertPlaceholderToken(el, currentValue, token) {
  const start = el?.selectionStart ?? currentValue.length;
  const end = el?.selectionEnd ?? currentValue.length;
  const insertText = `{{${token}}}`;
  const newValue = currentValue.slice(0, start) + insertText + currentValue.slice(end);
  return { newValue, newPos: start + insertText.length };
}

// A small header block shared by every card below — an icon in a colored
// badge plus a title and one-line description, so each section of the
// Settings page reads as its own clearly separated card instead of one
// long run of forms.
function CardHeader({ icon: Icon, title, description }) {
  return (
    <div className="settings-card-header">
      <span className="settings-card-icon"><Icon size={19} /></span>
      <div>
        <h2>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
    </div>
  );
}

// One tab bar instead of nine cards stacked one under another — Naveen's
// own words were that Settings was "stuck on a wall like a billboard"
// (2026-09-16). Firms/Staff/Backups/Cloud Backup/Danger Zone stay
// owner-only exactly as before, just as a tab filter instead of a
// conditionally-rendered card.
const SETTINGS_TABS = [
  { key: "business", label: "Business", icon: IconBuilding },
  { key: "branding", label: "Branding & Payments", icon: IconImage },
  { key: "email", label: "Email", icon: IconMail },
  { key: "firms", label: "Firms & Staff", icon: IconTeam, ownerOnly: true },
  { key: "backups", label: "Backups", icon: IconCloud, ownerOnly: true },
  { key: "import", label: "Import Data", icon: IconImport, ownerOnly: true },
  { key: "danger", label: "Danger Zone", icon: IconTrash, ownerOnly: true },
];

export default function Settings() {
  const user = getUser();
  const isOwner = user?.role === "owner";
  const tabs = SETTINGS_TABS.filter((t) => !t.ownerOnly || isOwner);
  const [business, setBusiness] = useState(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("business");

  useEffect(() => { api.getBusiness().then(setBusiness); }, []);

  const isFirstTimeSetup = business && !business.address && !business.gstin;

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSavedMsg("");
    try {
      const updated = await api.updateBusiness(business);
      setBusiness(updated);
      setSavedMsg("Saved.");
    } catch (err) {
      setError(err.message);
    }
  };

  if (!business) return <p className="muted">Loading...</p>;

  return (
    <div>
      <h1>Business Settings</h1>

      <div className="settings-page">
        {isFirstTimeSetup && (
          <p className="muted">Finish setting up your business. Fill in the details below, then switch to the Branding & Payments tab for your logo and bank details.</p>
        )}

        <div className="tab-bar">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`tab-btn${activeTab === t.key ? " active" : ""}`}
              onClick={() => setActiveTab(t.key)}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>

        {activeTab === "business" && (
        <div className="settings-card" data-tour="settings-business-tab">
          <CardHeader
            icon={IconBuilding}
            title="Business Details"
            description="Your business's name, contact details, and how invoice, quote, and credit note numbers are generated."
          />
          <form onSubmit={handleSave} className="settings-form">
            <label>Business name
              <input value={business.name || ""} onChange={(e) => setBusiness({ ...business, name: e.target.value })} />
            </label>
            <label>Address
              <textarea
                rows={3}
                placeholder="Building, street, area..."
                value={business.address || ""}
                onChange={(e) => setBusiness({ ...business, address: e.target.value })}
              />
            </label>
            <div className="field-row">
              <label>PIN code
                <input value={business.pincode || ""} onChange={(e) => setBusiness({ ...business, pincode: e.target.value })} />
              </label>
              <label>Country
                <input value={business.country || ""} onChange={(e) => setBusiness({ ...business, country: e.target.value })} />
              </label>
            </div>
            <div className="field-row">
              <label>Phone
                <input value={business.phone || ""} onChange={(e) => setBusiness({ ...business, phone: e.target.value })} />
              </label>
              <label>Email
                <input value={business.email || ""} onChange={(e) => setBusiness({ ...business, email: e.target.value })} />
              </label>
            </div>
            <div className="field-row">
              <label>Website
                <input value={business.website || ""} onChange={(e) => setBusiness({ ...business, website: e.target.value })} />
              </label>
              <label>GSTIN (leave blank if not GST-registered)
                <input value={business.gstin || ""} onChange={(e) => setBusiness({ ...business, gstin: e.target.value })} />
              </label>
            </div>
            <label>State (used to work out CGST/SGST vs IGST on invoices)
              <select value={business.state || ""} onChange={(e) => setBusiness({ ...business, state: e.target.value })}>
                <option value="">Select your state</option>
                {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label>Date format (used on invoices, quotes, credit notes, and everywhere dates are shown)
              <select
                value={business.date_format || "DD/MM/YYYY"}
                onChange={(e) => setBusiness({ ...business, date_format: e.target.value })}
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 09/09/2026)</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY (e.g. 09/09/2026)</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2026-09-09)</option>
              </select>
            </label>
            <label>Copies to print by default (adjustable per print too)
              <select
                value={business.default_print_copies || 1}
                onChange={(e) => setBusiness({ ...business, default_print_copies: Number(e.target.value) })}
              >
                <option value={1}>1 copy</option>
                <option value={2}>2 copies (Original for Recipient, Duplicate for Supplier)</option>
                <option value={3}>3 copies (Original for Recipient, Duplicate for Transporter, Triplicate for Supplier)</option>
              </select>
            </label>
            <label>Default currency (what a new invoice starts with, changeable per invoice)
              <select
                value={business.default_currency || "INR"}
                onChange={(e) => setBusiness({ ...business, default_currency: e.target.value })}
              >
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} ({c.symbol}), {c.name}</option>)}
              </select>
            </label>
            <div className="field-row">
              <label>Invoice number prefix
                <input value={business.invoice_prefix || ""} onChange={(e) => setBusiness({ ...business, invoice_prefix: e.target.value })} />
              </label>
              <label>Quote number prefix
                <input value={business.quote_prefix || ""} onChange={(e) => setBusiness({ ...business, quote_prefix: e.target.value })} />
              </label>
            </div>
            <label>Credit note number prefix
              <input value={business.credit_note_prefix || ""} onChange={(e) => setBusiness({ ...business, credit_note_prefix: e.target.value })} />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!business.reset_invoice_numbering_yearly}
                onChange={(e) => setBusiness({ ...business, reset_invoice_numbering_yearly: e.target.checked })}
              />
              {" "}Reset invoice numbers every financial year (April to March), e.g. INV-2026-27-000001
            </label>
            {!!business.reset_invoice_numbering_yearly && (
              <p className="muted" style={{ marginTop: -8 }}>
                Applies from your next new invoice onward, invoices you've already created keep their existing numbers.
              </p>
            )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!business.require_invoice_approval}
                onChange={(e) => setBusiness({ ...business, require_invoice_approval: e.target.checked })}
              />
              {" "}Require Owner/Admin approval before a Cashier's invoice can be sent
            </label>
            <div className="field-row">
              <label>RBI bank rate (%, for the MSME 45 day interest calculation)
                <input
                  type="number" step="0.01" min="0"
                  value={business.rbi_bank_rate ?? ""}
                  onChange={(e) => setBusiness({ ...business, rbi_bank_rate: e.target.value })}
                  placeholder="6.5"
                />
              </label>
              <label>Annual turnover (₹, for the e-Invoicing threshold reminder)
                <input
                  type="number" step="1" min="0"
                  value={business.annual_turnover ?? ""}
                  onChange={(e) => setBusiness({ ...business, annual_turnover: e.target.value })}
                  placeholder="e.g. 60000000"
                />
              </label>
            </div>
            <p className="muted" style={{ marginTop: -8 }}>
              The RBI bank rate feeds the Section 43B(h) MSME late payment interest shown on Purchases (three times
              this rate, once a vendor's payment passes its 15/45 day deadline). Annual turnover only drives the
              e-Invoicing awareness banner on the Dashboard once it's ₹5 crore or more, and BillItUp doesn't check the
              real GST portal for you.
            </p>
            {error && <p className="error">{error}</p>}
            {savedMsg && <p className="muted">{savedMsg}</p>}
            <button type="submit">Save</button>
          </form>
        </div>
        )}

        {activeTab === "branding" && (
          <>
            <InvoiceBrandingSettings business={business} setBusiness={setBusiness} />
            <TermsTemplatesCard />
          </>
        )}

        {activeTab === "email" && (
          <>
            <EmailSettings business={business} setBusiness={setBusiness} />
            <AutoRemindersCard business={business} setBusiness={setBusiness} />
            <EmailTemplatesCard business={business} setBusiness={setBusiness} />
          </>
        )}

        {activeTab === "firms" && isOwner && (
          <>
            <FirmManagement />
            <StaffManagement />
          </>
        )}

        {activeTab === "backups" && isOwner && (
          <>
            <BackupSettings />
            <CloudBackupSettings />
          </>
        )}

        {activeTab === "import" && isOwner && <ZohoImportCard />}

        {activeTab === "danger" && isOwner && <DangerZone business={business} />}
      </div>
    </div>
  );
}

function FirmManagement() {
  const [businesses, setBusinesses] = useState([]);
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);
  const [error, setError] = useState("");
  const user = getUser();

  const load = () => api.getMyBusinesses().then(setBusinesses);
  useEffect(() => { load(); }, []);

  const switchTo = async (businessId) => {
    if (businessId === user.business_id) return;
    const { token, user: switchedUser } = await api.switchBusiness(businessId);
    setSession(token, switchedUser);
    window.location.assign("/");
  };

  const hasPremiumFirm = businesses.some((b) => b.plan === "premium");

  // Same idea as the one on the Add Firm page — reuses Support chat so a
  // request to upgrade is a real, trackable message rather than something
  // said outside the app (2026-09-16).
  const requestPremium = async () => {
    setRequesting(true);
    setError("");
    try {
      await api.createSupportTicket(
        "Request: upgrade to Premium",
        "Hi, I'd like to add another firm under my account, which needs Premium. Please let me know how to pay and I'll get it sorted."
      );
      setRequested(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="settings-card">
      <CardHeader
        icon={IconBriefcase}
        title="Your Firms"
        description="Run more than one business? Add another firm here, and switch into it anytime from the dropdown at the top, all under this same login."
      />
      <table className="table">
        <thead><tr><th>Firm</th><th>Your Role</th><th>Plan</th><th /></tr></thead>
        <tbody>
          {businesses.map((b) => (
            <tr key={b.id}>
              <td>{b.name}{b.id === user.business_id && <span className="muted"> (active)</span>}</td>
              <td>{b.role}</td>
              <td>{b.plan === "premium" ? "Premium" : "Free"}</td>
              <td>{b.id !== user.business_id && <button className="link-btn" onClick={() => switchTo(b.id)}>Switch to this firm</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link className="link-btn" to="/add-firm">+ Add another firm</Link>
      {!hasPremiumFirm && (
        <p className="muted" style={{ marginTop: 8 }}>
          Adding another firm needs a premium plan on at least one of your firms — everything else here stays free.
          {" "}
          {requested ? (
            "Request sent — check Support for the reply."
          ) : (
            <button type="button" className="link-btn" onClick={requestPremium} disabled={requesting}>
              {requesting ? "Sending request..." : "Request premium access"}
            </button>
          )}
        </p>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// Reads a chosen file into a data: URL, rejecting anything too large to keep
// in the database sensibly (logos/signatures are small images, not photos).
function readFileAsDataUrl(file, maxBytes, onError) {
  return new Promise((resolve) => {
    if (file.size > maxBytes) {
      onError(`That file is too large (max ${Math.round(maxBytes / 1024)}KB). Try a smaller image.`);
      return resolve(null);
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => { onError("Couldn't read that file."); resolve(null); };
    reader.readAsDataURL(file);
  });
}

function InvoiceBrandingSettings({ business, setBusiness }) {
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [error, setError] = useState("");

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSavedMsg("");
    setSaving(true);
    try {
      const updated = await api.updateBusiness(business);
      setBusiness(updated);
      setSavedMsg("Saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file, 500 * 1024, setError);
    if (dataUrl) setBusiness({ ...business, logo_data_url: dataUrl });
  };

  const handleSignatureChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file, 300 * 1024, setError);
    if (dataUrl) setBusiness({ ...business, signature_data_url: dataUrl });
  };

  return (
    <div className="settings-card">
      <CardHeader
        icon={IconImage}
        title="Invoice Branding & Payment Details"
        description="Shown on every invoice, quote, and credit note — logo and bank/UPI details for getting paid."
      />
      <form onSubmit={handleSave} className="settings-form">
        <label>Logo
          <input type="file" accept="image/*" onChange={handleLogoChange} />
        </label>
        {business.logo_data_url && (
          <div className="logo-preview-row">
            <img src={business.logo_data_url} alt="Logo preview" className="logo-preview" />
            <button type="button" className="link-btn" onClick={() => setBusiness({ ...business, logo_data_url: "" })}>Remove logo</button>
          </div>
        )}

        <div className="field-row">
          <label>Bank account name
            <input value={business.bank_account_name || ""} onChange={(e) => setBusiness({ ...business, bank_account_name: e.target.value })} />
          </label>
          <label>Bank name
            <input value={business.bank_name || ""} onChange={(e) => setBusiness({ ...business, bank_name: e.target.value })} />
          </label>
        </div>
        <div className="field-row">
          <label>Account number
            <input value={business.bank_account_number || ""} onChange={(e) => setBusiness({ ...business, bank_account_number: e.target.value })} />
          </label>
          <label>IFSC code
            <input value={business.bank_ifsc || ""} onChange={(e) => setBusiness({ ...business, bank_ifsc: e.target.value })} />
          </label>
        </div>
        <label>UPI ID
          <input value={business.bank_upi_id || ""} onChange={(e) => setBusiness({ ...business, bank_upi_id: e.target.value })} placeholder="yourname@bank" />
        </label>
        <p className="muted" style={{ fontSize: 12, marginTop: -6 }}>
          Set this and a scannable QR code is added automatically to every unpaid invoice, the emailed/downloaded PDF, and the customer portal — the client scans it in any UPI app to pay you directly. BillItUp never handles the payment itself; you still mark the invoice paid once you see it land in your account.
        </p>

        <div className="field-row">
          <label>Authorized signatory name
            <input value={business.signature_name || ""} onChange={(e) => setBusiness({ ...business, signature_name: e.target.value })} />
          </label>
          <label>Signature image (optional — scanned/photo of a signature)
            <input type="file" accept="image/*" onChange={handleSignatureChange} />
          </label>
        </div>
        {business.signature_data_url && (
          <div className="logo-preview-row">
            <img src={business.signature_data_url} alt="Signature preview" className="logo-preview" />
            <button type="button" className="link-btn" onClick={() => setBusiness({ ...business, signature_data_url: "" })}>Remove signature</button>
          </div>
        )}

        {error && <p className="error">{error}</p>}
        {savedMsg && <p className="muted">{savedMsg}</p>}
        <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save branding & payment details"}</button>
      </form>
    </div>
  );
}

// A small library of Terms & Conditions blocks a business can pick between
// per invoice, rather than being stuck with one fixed paragraph — replaces
// the single free-text box this section used to be (2026-09-16). Its own
// save/add/delete calls go straight to /api/terms-templates rather than
// riding along on the Business Details "Save" button, since a template can
// be added or removed independently of the rest of this page.
function TermsTemplatesCard() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null); // null = not editing, "new" = adding
  const [form, setForm] = useState({ title: "", content: "", is_default: false });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => api.listTermsTemplates().then((list) => { setTemplates(list); setLoading(false); });
  useEffect(() => { load(); }, []);

  const startAdd = () => {
    setError("");
    setForm({
      title: templates.length === 0 ? "Standard Terms" : "",
      content: templates.length === 0 ? DEFAULT_TERMS_AND_CONDITIONS : "",
      is_default: templates.length === 0,
    });
    setEditingId("new");
  };
  const startEdit = (t) => {
    setError("");
    setForm({ title: t.title, content: t.content, is_default: !!t.is_default });
    setEditingId(t.id);
  };
  const cancelEdit = () => setEditingId(null);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      setError("Title and content are both required.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      if (editingId === "new") await api.createTermsTemplate(form);
      else await api.updateTermsTemplate(editingId, form);
      setEditingId(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (t) => {
    if (!window.confirm(`Delete the "${t.title}" template? This can't be undone.`)) return;
    await api.deleteTermsTemplate(t.id);
    load();
  };

  return (
    <div className="settings-card">
      <CardHeader
        icon={IconInvoice}
        title="Terms & Conditions"
        description="Save a few reusable blocks of wording and pick between them on each invoice, instead of one fixed paragraph for everyone."
      />

      {!loading && templates.length === 0 && editingId === null && (
        <p className="muted">
          Nothing saved yet, so every invoice prints with no Terms &amp; Conditions until you add one.
        </p>
      )}

      {templates.length > 0 && (
        <ul className="terms-template-list">
          {templates.map((t) => (
            <li key={t.id} className="terms-template-row">
              <div>
                <strong>{t.title}</strong>{t.is_default ? <span className="muted"> (default, used on a new invoice)</span> : null}
                <p className="muted terms-template-preview">{t.content}</p>
              </div>
              <div className="terms-template-actions">
                <button type="button" className="link-btn" onClick={() => startEdit(t)}>Edit</button>
                <button type="button" className="link-btn" onClick={() => handleDelete(t)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editingId !== null ? (
        <form onSubmit={handleSave} className="settings-form" style={{ marginTop: templates.length > 0 ? 16 : 0 }}>
          <label>Title
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Standard Terms, Advance Payment" />
          </label>
          <label>Content
            <textarea rows={5} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} />
            {" "}Make this the default for new invoices
          </label>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions" style={{ padding: 0 }}>
            <button type="button" className="link-btn" onClick={cancelEdit}>Cancel</button>
            <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save template"}</button>
          </div>
        </form>
      ) : (
        <button type="button" className="link-btn" onClick={startAdd}>+ Add a Terms &amp; Conditions template</button>
      )}
    </div>
  );
}

// Provider presets so most people never have to know what an SMTP host or
// port even is — pick the mail service they already use, get the right
// host/port filled in automatically, and a short guide to the one thing
// that actually trips people up: an app password is not their normal
// mail password (2026-09-15).
const EMAIL_PROVIDERS = [
  {
    id: "gmail",
    label: "Gmail",
    smtp_host: "smtp.gmail.com",
    smtp_port: 587,
    smtp_secure: false,
    guide: (
      <ol>
        <li>Turn on 2-Step Verification on your Google account, if it isn't already (Google Account → Security).</li>
        <li>
          Go to{" "}
          <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
            myaccount.google.com/apppasswords
          </a>{" "}
          and create an app password, name it "BillItUp".
        </li>
        <li>Paste that 16 character app password below as the SMTP password — not your normal Gmail password, that will not work.</li>
        <li>SMTP username is your full Gmail address.</li>
      </ol>
    ),
  },
  {
    id: "outlook",
    label: "Outlook / Office 365",
    smtp_host: "smtp-mail.outlook.com",
    smtp_port: 587,
    smtp_secure: false,
    guide: (
      <ol>
        <li>
          If your account has 2 step verification on, create an app password at{" "}
          <a href="https://account.microsoft.com/security" target="_blank" rel="noreferrer">
            account.microsoft.com/security
          </a>{" "}
          and use that below instead of your normal password.
        </li>
        <li>SMTP username is your full Outlook or Office 365 email address.</li>
        <li>If this is a work or school account, your IT admin may need to turn on SMTP sending first — ask them if this keeps failing.</li>
      </ol>
    ),
  },
  {
    id: "zoho",
    label: "Zoho Mail",
    smtp_host: "smtp.zoho.com",
    smtp_port: 465,
    smtp_secure: true,
    guide: (
      <ol>
        <li>
          Turn on 2 factor authentication in Zoho if it isn't already, then create an app password from{" "}
          <a href="https://accounts.zoho.com/home#security/security_pref" target="_blank" rel="noreferrer">
            your Zoho account security settings
          </a>
          .
        </li>
        <li>Use that app password below, not your normal Zoho password.</li>
        <li>SMTP username is your full Zoho Mail address. If your account is on zoho.in rather than zoho.com, use smtp.zoho.in as the host instead.</li>
      </ol>
    ),
  },
  { id: "other", label: "Other / custom", smtp_host: "", smtp_port: "", smtp_secure: false, guide: null },
];

function detectProvider(host) {
  const found = EMAIL_PROVIDERS.find((p) => p.id !== "other" && p.smtp_host === host);
  return found ? found.id : (host ? "other" : "gmail");
}

function EmailSettings({ business, setBusiness }) {
  const user = getUser();
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [error, setError] = useState("");
  const [testTo, setTestTo] = useState(user?.email || "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [providerId, setProviderId] = useState(() => detectProvider(business.smtp_host));

  const activeProvider = EMAIL_PROVIDERS.find((p) => p.id === providerId);

  const handlePickProvider = (p) => {
    setProviderId(p.id);
    if (p.id === "other") return; // leave whatever host/port they already have
    setBusiness({ ...business, smtp_host: p.smtp_host, smtp_port: p.smtp_port, smtp_secure: p.smtp_secure });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSavedMsg("");
    setSaving(true);
    try {
      const updated = await api.updateBusiness(business);
      setBusiness(updated);
      setSavedMsg("Saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const sendTestEmail = async (e) => {
    e.preventDefault();
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.sendTestEmail(testTo);
      setTestResult({ ok: true, to: res.sentTo });
    } catch (err) {
      setTestResult({ error: err.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="settings-card">
      <CardHeader
        icon={IconMail}
        title="Email (SMTP) Settings"
        description="Used to email invoices/quotes/credit notes to customers as a PDF. Pick your mail provider below for step by step setup, or choose Other for a custom SMTP account."
      />
      <div className="smtp-provider-row">
        {EMAIL_PROVIDERS.map((p) => (
          <button
            type="button"
            key={p.id}
            className={`smtp-provider-btn${providerId === p.id ? " active" : ""}`}
            onClick={() => handlePickProvider(p)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {activeProvider?.guide && (
        <div className="smtp-guide">
          <p>Setting up {activeProvider.label}:</p>
          {activeProvider.guide}
        </div>
      )}
      <form onSubmit={handleSave} className="settings-form">
        <div className="field-row">
          <label>SMTP host
            <input value={business.smtp_host || ""} onChange={(e) => setBusiness({ ...business, smtp_host: e.target.value })} placeholder="smtp.gmail.com" />
          </label>
          <label>SMTP port
            <input type="number" value={business.smtp_port || ""} onChange={(e) => setBusiness({ ...business, smtp_port: e.target.value })} placeholder="587" />
          </label>
        </div>
        <label className="checkbox-label">
          <input type="checkbox" checked={!!business.smtp_secure} onChange={(e) => setBusiness({ ...business, smtp_secure: e.target.checked })} />
          {" "}Use SSL (usually only for port 465)
        </label>
        <div className="field-row">
          <label>SMTP username
            <input value={business.smtp_user || ""} onChange={(e) => setBusiness({ ...business, smtp_user: e.target.value })} />
          </label>
          <label>SMTP password
            <input type="password" value={business.smtp_pass || ""} onChange={(e) => setBusiness({ ...business, smtp_pass: e.target.value })} placeholder="App password" />
          </label>
        </div>
        <div className="field-row">
          <label>"From" name
            <input value={business.smtp_from_name || ""} onChange={(e) => setBusiness({ ...business, smtp_from_name: e.target.value })} placeholder={business.name} />
          </label>
          <label>"From" email
            <input value={business.smtp_from_email || ""} onChange={(e) => setBusiness({ ...business, smtp_from_email: e.target.value })} placeholder="Defaults to SMTP username" />
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        {savedMsg && <p className="muted">{savedMsg}</p>}
        <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save email settings"}</button>
      </form>

      <form onSubmit={sendTestEmail} className="inline-form" style={{ marginTop: 16 }}>
        <input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" required />
        <button type="submit" disabled={testing}>{testing ? "Sending..." : "Send test email"}</button>
      </form>
      <p className="muted" style={{ marginTop: -8 }}>
        Save your settings above first, then send yourself a test email to confirm they actually work.
      </p>
      {testResult?.ok && <p className="muted">Test email sent to {testResult.to} — check your inbox (and spam folder).</p>}
      {testResult?.error && <p className="error">{testResult.error}</p>}
    </div>
  );
}

// Automatic payment reminder emails — runs hourly on the server, checking
// each unpaid invoice against these two settings (days before the due date,
// and how often to repeat once it's overdue). Reuses the same SMTP settings
// and "Payment Reminder" template as the manual "Send Payment Reminder"
// button on an invoice, so there's nothing new to configure there.
function AutoRemindersCard({ business, setBusiness }) {
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [error, setError] = useState("");

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSavedMsg("");
    setSaving(true);
    try {
      const updated = await api.updateBusiness(business);
      setBusiness(updated);
      setSavedMsg("Saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-card">
      <CardHeader
        icon={IconAlert}
        title="Automatic Payment Reminders"
        description="Automatically email customers about unpaid invoices, using your SMTP settings above and the Payment Reminder template below. Checked once an hour."
      />
      <form onSubmit={handleSave} className="settings-form">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={!!business.reminders_enabled}
            onChange={(e) => setBusiness({ ...business, reminders_enabled: e.target.checked })}
          />
          {" "}Send automatic payment reminders
        </label>
        <div className="field-row">
          <label>Days before the due date to remind
            <input
              type="number"
              min="0"
              value={business.reminder_days_before_due ?? 3}
              onChange={(e) => setBusiness({ ...business, reminder_days_before_due: e.target.value })}
            />
          </label>
          <label>Repeat an overdue reminder every (days)
            <input
              type="number"
              min="0"
              value={business.reminder_overdue_repeat_days ?? 7}
              onChange={(e) => setBusiness({ ...business, reminder_overdue_repeat_days: e.target.value })}
            />
          </label>
        </div>
        <p className="muted" style={{ marginTop: -8 }}>
          Set either to 0 to turn that reminder off. A reminder is only ever sent for an invoice that's still unpaid, and only once your email settings above are working.
        </p>
        {error && <p className="error">{error}</p>}
        {savedMsg && <p className="muted">{savedMsg}</p>}
        <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save reminder settings"}</button>
      </form>
    </div>
  );
}

const EMAIL_TEMPLATE_TYPES = [
  { id: "invoice", label: "Invoice" },
  { id: "quote", label: "Quote" },
  { id: "credit_note", label: "Credit Note" },
  { id: "reminder", label: "Payment Reminder" },
  { id: "receipt", label: "Payment Receipt" },
];

// Lets a business rewrite the wording of every outgoing document email
// without touching code — one subject/body pair per document type, with a
// small set of {{placeholders}} filled in automatically when it's actually
// sent. Leaving a field blank keeps the built-in default (shown as its
// placeholder text), so nobody has to fill all four in just to get started
// (2026-09-15).
function EmailTemplatesCard({ business, setBusiness }) {
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [error, setError] = useState("");
  const [activeType, setActiveType] = useState("invoice");
  const subjectRef = useRef(null);
  const bodyRef = useRef(null);

  const handleSave = async (e) => {
    e.preventDefault();
    setError("");
    setSavedMsg("");
    setSaving(true);
    try {
      const updated = await api.updateBusiness(business);
      setBusiness(updated);
      setSavedMsg("Saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const fallback = DEFAULT_EMAIL_TEMPLATES[activeType];
  const subjectKey = `email_subject_${activeType}`;
  const bodyKey = `email_body_${activeType}`;
  // Shown as the field's real, editable value whenever the business hasn't
  // written their own — not grey hint text — so what's on screen is exactly
  // what would be sent, and someone unfamiliar with {{tokens}} still has
  // working, ready-to-send wording to start from (2026-09-16).
  const subjectValue = business[subjectKey] ?? fallback.subject;
  const bodyValue = business[bodyKey] ?? fallback.body;

  const insertField = (ref, key, currentValue, token) => {
    const { newValue, newPos } = insertPlaceholderToken(ref.current, currentValue, token);
    setBusiness({ ...business, [key]: newValue });
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(newPos, newPos);
    });
  };

  return (
    <div className="settings-card">
      <CardHeader
        icon={IconMail}
        title="Email Templates"
        description="What a customer sees when you email them an invoice, quote, credit note, payment reminder, or payment receipt."
      />
      <div className="smtp-provider-row">
        {EMAIL_TEMPLATE_TYPES.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`smtp-provider-btn${activeType === t.id ? " active" : ""}`}
            onClick={() => setActiveType(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
        This starts filled in with ready-to-send wording you can edit freely, and what's shown is exactly what goes
        out. Use "Insert field" below each box to add something like the customer's name or the amount, without
        needing to type anything special.
      </p>
      <form onSubmit={handleSave} className="settings-form">
        <label>Subject
          <input
            ref={subjectRef}
            value={subjectValue}
            onChange={(e) => setBusiness({ ...business, [subjectKey]: e.target.value })}
          />
        </label>
        <InsertFieldSelect
          fields={FIELDS_BY_TEMPLATE_TYPE[activeType].map((token) => ({ token, label: FIELD_LABELS[token] }))}
          onInsert={(token) => insertField(subjectRef, subjectKey, subjectValue, token)}
        />
        <label>Message
          <textarea
            ref={bodyRef}
            rows={6}
            value={bodyValue}
            onChange={(e) => setBusiness({ ...business, [bodyKey]: e.target.value })}
          />
        </label>
        <InsertFieldSelect
          fields={FIELDS_BY_TEMPLATE_TYPE[activeType].map((token) => ({ token, label: FIELD_LABELS[token] }))}
          onInsert={(token) => insertField(bodyRef, bodyKey, bodyValue, token)}
        />
        {error && <p className="error">{error}</p>}
        {savedMsg && <p className="muted">{savedMsg}</p>}
        <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save email templates"}</button>
      </form>
    </div>
  );
}

function StaffManagement() {
  const [users, setUsers] = useState([]);
  const [loginEvents, setLoginEvents] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "cashier" });
  const [error, setError] = useState("");

  const load = () => api.listUsers().then(setUsers);
  useEffect(() => { load(); }, []);

  const toggleHistory = () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && loginEvents.length === 0) api.listLoginEvents().then(setLoginEvents);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.createUser(form);
      setForm({ name: "", email: "", password: "", role: "cashier" });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemove = async (id) => {
    await api.deleteUser(id);
    load();
  };

  return (
    <div className="settings-card">
      <CardHeader
        icon={IconTeam}
        title="Staff Logins"
        description="Add a login for a cashier at the counter, or an admin who needs full access. Staff never sign themselves up."
      />
      <form className="inline-form" onSubmit={handleAdd}>
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        <input placeholder="Temporary password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="cashier">Cashier</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit">Add login</button>
      </form>
      {error && <p className="error">{error}</p>}

      <table className="table">
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last Login</th><th /></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td><td>{u.email}</td><td>{u.role}</td>
              <td>{formatDateTime(u.last_login_at)}</td>
              <td>{u.role !== "owner" && <button className="link-btn" onClick={() => handleRemove(u.id)}>Remove</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <button type="button" className="link-btn" onClick={toggleHistory}>
        {showHistory ? "Hide recent login activity" : "Show recent login activity"}
      </button>
      {showHistory && (
        <table className="table">
          <thead><tr><th>Name</th><th>Role</th><th>Logged in at</th><th>IP address</th></tr></thead>
          <tbody>
            {loginEvents.length === 0 && (
              <tr><td colSpan={4} className="muted">No login activity recorded yet.</td></tr>
            )}
            {loginEvents.map((ev) => (
              <tr key={ev.id}>
                <td>{ev.name}</td><td>{ev.role}</td>
                <td>{formatDateTime(ev.logged_in_at)}</td>
                <td>{ev.ip_address || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// Backups run automatically on the server (once a day — see server/src/lib/
// backup.js), so there's nothing here to configure — just visibility into
// whether it's actually working, and a self-serve "run one now" button in
// the same spirit as "Send test email" above.
function BackupSettings() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [runningBackup, setRunningBackup] = useState(false);

  const load = () => api.getBackupStatus().then(setStatus).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  const backupNow = async () => {
    setError("");
    setRunningBackup(true);
    try {
      await api.backupNow();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunningBackup(false);
    }
  };

  return (
    <div className="settings-card">
      <CardHeader
        icon={IconCloud}
        title="Backups"
        description="Your invoice database is backed up automatically once a day, with nothing to configure."
      />
      <p className="muted">
        The last {status?.keep ?? "30"} backups are kept. Point the backup folder at OneDrive, Google Drive,
        or another sync tool (set <code>BILLITUP_BACKUP_DIR</code> in <code>server/.env</code>) so backups
        are copied off this machine automatically too.
      </p>
      {status && (
        <p className="muted">
          {status.count > 0
            ? <>Last backup: {formatDateTime(status.last?.at)} ({Math.round((status.last?.sizeBytes || 0) / 1024)} KB) —{" "}
                {status.count} backup{status.count === 1 ? "" : "s"} kept in <code>{status.dir}</code>.</>
            : "No backups yet — one runs automatically shortly after the server starts, or click below to run one now."}
        </p>
      )}
      {error && <p className="error">{error}</p>}
      <button type="button" onClick={backupNow} disabled={runningBackup}>
        {runningBackup ? "Backing up..." : "Back up now"}
      </button>
    </div>
  );
}

// A business's own connection to their personal Dropbox/Google Drive/
// OneDrive (2026-09-15) — separate from the whole-install backup above,
// which stays local/server-side only. This uploads a fresh export of just
// this one business's own data (see server/src/lib/cloudBackupExport.js),
// once a day alongside the server backup, or right away via "Back up now"
// above since that route now triggers both. Only providers the server
// actually has credentials for show a working Connect button — the rest
// show as not set up yet rather than being hidden outright, so it's clear
// more are coming rather than looking like a dead end.
function CloudBackupSettings() {
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [busyProvider, setBusyProvider] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const load = () => api.getCloudBackupStatus().then(setStatus).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  // Dropbox/Drive/OneDrive land the browser back here with ?cloud_backup=...
  // after the consent screen — read it once, refresh the real status from
  // the server (never trust the query string as the source of truth), then
  // strip it from the URL so refreshing the page doesn't keep re-showing it.
  const notice = searchParams.get("cloud_backup");
  useEffect(() => {
    if (!notice) return;
    load();
    const next = new URLSearchParams(searchParams);
    next.delete("cloud_backup");
    next.delete("provider");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice]);

  const connect = async (provider) => {
    setError("");
    setBusyProvider(provider);
    try {
      const { url } = await api.connectCloudBackup(provider);
      window.location.assign(url);
    } catch (err) {
      setError(err.message);
      setBusyProvider(null);
    }
  };

  const disconnect = async (provider) => {
    setBusyProvider(provider);
    try {
      await api.disconnectCloudBackup(provider);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyProvider(null);
    }
  };

  return (
    <div className="settings-card">
      <CardHeader
        icon={IconCloud}
        title="Cloud Backup"
        description="Connect your own Dropbox, Google Drive, or OneDrive so a copy of just your business's own data lands there automatically."
      />
      {notice === "connected" && (
        <p className="muted" style={{ color: "var(--accent)" }}>
          Connected. Your data will be uploaded there on the next daily backup, or click Back up now above.
        </p>
      )}
      {notice === "denied" && <p className="muted">Connection cancelled — nothing was changed.</p>}
      {(notice === "failed" || notice === "invalid_state") && (
        <p className="error">Something went wrong connecting that account. Please try again.</p>
      )}
      {error && <p className="error">{error}</p>}
      {!status ? (
        <p className="muted">Loading...</p>
      ) : (
        <div className="cloud-backup-list">
          {status.map((p) => (
            <div key={p.provider} className="cloud-backup-row">
              <div>
                <strong>{p.label}</strong>
                {p.connected ? (
                  <p className="muted" style={{ margin: "2px 0 0" }}>
                    Connected{p.account_label ? ` as ${p.account_label}` : ""}.
                    {p.last_upload_at && ` Last upload: ${formatDateTime(p.last_upload_at)}.`}
                    {p.last_upload_status === "error" && (
                      <span className="error"> Last upload failed — {p.last_error}</span>
                    )}
                  </p>
                ) : p.configured ? (
                  <p className="muted" style={{ margin: "2px 0 0" }}>Not connected yet.</p>
                ) : (
                  <p className="muted" style={{ margin: "2px 0 0" }}>Not set up on this install yet.</p>
                )}
              </div>
              {p.connected ? (
                <button type="button" className="link-btn" disabled={busyProvider === p.provider} onClick={() => disconnect(p.provider)}>
                  {busyProvider === p.provider ? "Disconnecting..." : "Disconnect"}
                </button>
              ) : (
                <button type="button" disabled={!p.configured || busyProvider === p.provider} onClick={() => connect(p.provider)}>
                  {busyProvider === p.provider ? "Connecting..." : `Connect ${p.label}`}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Self-service business deletion — no separate export pipeline is built for
// this; it points at the Excel export buttons already on Customers, Items,
// and the Invoices list (top of Dashboard), which is real, working data
// backup someone can do in one click before deleting anything.
function DangerZone({ business }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleDelete = async (e) => {
    e.preventDefault();
    setError("");
    setDeleting(true);
    try {
      const result = await api.deleteBusiness({ password, confirmBusinessName: confirmName });
      if (result.accountDeleted) {
        clearSession();
        window.location.assign("/login");
      } else {
        setSession(result.token, result.user);
        window.location.assign("/");
      }
    } catch (err) {
      setError(err.message);
      setDeleting(false);
    }
  };

  return (
    <div className="settings-card danger-card">
      <CardHeader
        icon={IconTrash}
        title="Delete This Business"
        description={`This permanently deletes ${business.name} — every customer, item, invoice, quote, credit note, and payment record — for anyone who has access to it. There's no undo.`}
      />
      <p className="muted">
        Before you do this, use the Export to Excel button on Customers, Items, and the Invoices list
        (Dashboard) to save a copy of anything you want to keep.
      </p>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} style={{ background: "#b3261e" }}>Delete this business...</button>
      )}
      {open && (
        <form onSubmit={handleDelete} className="settings-form">
          <label>Your password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <label>Type the business name (<strong>{business.name}</strong>) to confirm
            <input value={confirmName} onChange={(e) => setConfirmName(e.target.value)} required />
          </label>
          {error && <p className="error">{error}</p>}
          <div style={{ display: "flex", gap: 12 }}>
            <button type="submit" disabled={deleting} style={{ background: "#b3261e" }}>
              {deleting ? "Deleting..." : "Permanently delete this business"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setError(""); setPassword(""); setConfirmName(""); }} disabled={deleting}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
