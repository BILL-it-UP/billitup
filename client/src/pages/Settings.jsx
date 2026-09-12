import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getUser, setSession, clearSession } from "../lib/api";
import { formatDateTime } from "../lib/format";

export default function Settings() {
  const user = getUser();
  const [business, setBusiness] = useState(null);
  const [savedMsg, setSavedMsg] = useState("");
  const [error, setError] = useState("");

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
      {isFirstTimeSetup && (
        <p className="muted">Finish setting up your business — fill in the details below, then add your branding and bank details further down.</p>
      )}

      <form onSubmit={handleSave} className="settings-form">
        <label>Business name
          <input value={business.name || ""} onChange={(e) => setBusiness({ ...business, name: e.target.value })} />
        </label>
        <label>Address
          <input value={business.address || ""} onChange={(e) => setBusiness({ ...business, address: e.target.value })} />
        </label>
        <label>Phone
          <input value={business.phone || ""} onChange={(e) => setBusiness({ ...business, phone: e.target.value })} />
        </label>
        <label>Email
          <input value={business.email || ""} onChange={(e) => setBusiness({ ...business, email: e.target.value })} />
        </label>
        <label>Website
          <input value={business.website || ""} onChange={(e) => setBusiness({ ...business, website: e.target.value })} />
        </label>
        <label>GSTIN (leave blank if not GST-registered)
          <input value={business.gstin || ""} onChange={(e) => setBusiness({ ...business, gstin: e.target.value })} />
        </label>
        <label>Invoice number prefix
          <input value={business.invoice_prefix || ""} onChange={(e) => setBusiness({ ...business, invoice_prefix: e.target.value })} />
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
            Applies from your next new invoice onward — invoices you've already created keep their existing numbers.
          </p>
        )}
        <label>Quote number prefix
          <input value={business.quote_prefix || ""} onChange={(e) => setBusiness({ ...business, quote_prefix: e.target.value })} />
        </label>
        <label>Credit note number prefix
          <input value={business.credit_note_prefix || ""} onChange={(e) => setBusiness({ ...business, credit_note_prefix: e.target.value })} />
        </label>
        {error && <p className="error">{error}</p>}
        {savedMsg && <p className="muted">{savedMsg}</p>}
        <button type="submit">Save</button>
      </form>

      <InvoiceBrandingSettings business={business} setBusiness={setBusiness} />

      <EmailSettings business={business} setBusiness={setBusiness} />

      {user?.role === "owner" && <FirmManagement />}

      {user?.role === "owner" && <StaffManagement />}

      {user?.role === "owner" && <BackupSettings />}

      {user?.role === "owner" && <DangerZone business={business} />}
    </div>
  );
}

function FirmManagement() {
  const [businesses, setBusinesses] = useState([]);
  const user = getUser();

  const load = () => api.getMyBusinesses().then(setBusinesses);
  useEffect(() => { load(); }, []);

  const switchTo = async (businessId) => {
    if (businessId === user.business_id) return;
    const { token, user: switchedUser } = await api.switchBusiness(businessId);
    setSession(token, switchedUser);
    window.location.assign("/");
  };

  return (
    <div className="staff-section">
      <h2>Your Firms</h2>
      <p className="muted">
        Run more than one business? Add another firm here — it gets its own customers, invoices, and
        numbering, and you switch into it anytime from the dropdown at the top, all under this same login.
      </p>
      <table className="table">
        <thead><tr><th>Firm</th><th>Your Role</th><th /></tr></thead>
        <tbody>
          {businesses.map((b) => (
            <tr key={b.id}>
              <td>{b.name}{b.id === user.business_id && <span className="muted"> (active)</span>}</td>
              <td>{b.role}</td>
              <td>{b.id !== user.business_id && <button className="link-btn" onClick={() => switchTo(b.id)}>Switch to this firm</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link className="link-btn" to="/add-firm">+ Add another firm</Link>
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
    <div className="staff-section">
      <h2>Invoice Branding &amp; Payment Details</h2>
      <p className="muted">Shown on every invoice, quote, and credit note — logo, bank/UPI details for getting paid, and your standard terms.</p>
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

        <label>Bank account name
          <input value={business.bank_account_name || ""} onChange={(e) => setBusiness({ ...business, bank_account_name: e.target.value })} />
        </label>
        <label>Bank name
          <input value={business.bank_name || ""} onChange={(e) => setBusiness({ ...business, bank_name: e.target.value })} />
        </label>
        <label>Account number
          <input value={business.bank_account_number || ""} onChange={(e) => setBusiness({ ...business, bank_account_number: e.target.value })} />
        </label>
        <label>IFSC code
          <input value={business.bank_ifsc || ""} onChange={(e) => setBusiness({ ...business, bank_ifsc: e.target.value })} />
        </label>
        <label>UPI ID
          <input value={business.bank_upi_id || ""} onChange={(e) => setBusiness({ ...business, bank_upi_id: e.target.value })} placeholder="yourname@bank" />
        </label>

        <label>Terms &amp; Conditions
          <textarea rows={5} value={business.terms_and_conditions || ""} onChange={(e) => setBusiness({ ...business, terms_and_conditions: e.target.value })} placeholder="e.g. Payment due within 15 days. Late payments may attract interest." />
        </label>

        <label>Authorized signatory name
          <input value={business.signature_name || ""} onChange={(e) => setBusiness({ ...business, signature_name: e.target.value })} />
        </label>
        <label>Signature image (optional — scanned/photo of a signature)
          <input type="file" accept="image/*" onChange={handleSignatureChange} />
        </label>
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

function EmailSettings({ business, setBusiness }) {
  const user = getUser();
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [error, setError] = useState("");
  const [testTo, setTestTo] = useState(user?.email || "");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

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
    <div className="staff-section">
      <h2>Email (SMTP) Settings</h2>
      <p className="muted">
        Used to email invoices/quotes/credit notes to customers as a PDF. Bring your own mail account
        (e.g. a Gmail address with an app password) — BillItUp doesn't send email through a shared server.
      </p>
      <form onSubmit={handleSave} className="settings-form">
        <label>SMTP host
          <input value={business.smtp_host || ""} onChange={(e) => setBusiness({ ...business, smtp_host: e.target.value })} placeholder="smtp.gmail.com" />
        </label>
        <label>SMTP port
          <input type="number" value={business.smtp_port || ""} onChange={(e) => setBusiness({ ...business, smtp_port: e.target.value })} placeholder="587" />
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={!!business.smtp_secure} onChange={(e) => setBusiness({ ...business, smtp_secure: e.target.checked })} />
          {" "}Use SSL (usually only for port 465)
        </label>
        <label>SMTP username
          <input value={business.smtp_user || ""} onChange={(e) => setBusiness({ ...business, smtp_user: e.target.value })} />
        </label>
        <label>SMTP password
          <input type="password" value={business.smtp_pass || ""} onChange={(e) => setBusiness({ ...business, smtp_pass: e.target.value })} placeholder="App password" />
        </label>
        <label>"From" name
          <input value={business.smtp_from_name || ""} onChange={(e) => setBusiness({ ...business, smtp_from_name: e.target.value })} placeholder={business.name} />
        </label>
        <label>"From" email
          <input value={business.smtp_from_email || ""} onChange={(e) => setBusiness({ ...business, smtp_from_email: e.target.value })} placeholder="Defaults to SMTP username" />
        </label>
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
    <div className="staff-section">
      <h2>Staff Logins</h2>
      <p className="muted">Add a login for a cashier at the counter, or an admin who needs full access. Staff never sign themselves up.</p>

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
    <div className="staff-section">
      <h2>Backups</h2>
      <p className="muted">
        Your invoice database is backed up automatically once a day and the last {status?.keep ?? "30"} backups are
        kept. Point the backup folder at OneDrive, Google Drive, or another sync tool (set{" "}
        <code>BILLITUP_BACKUP_DIR</code> in <code>server/.env</code>) so backups are copied off this machine
        automatically too, with nothing extra to run.
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
    <div className="staff-section">
      <h2>Delete This Business</h2>
      <p className="muted">
        This permanently deletes {business.name} — every customer, item, invoice, quote, credit note, and
        payment record — for anyone who has access to it. There's no undo. Before you do this, use the
        Export to Excel button on Customers, Items, and the Invoices list (Dashboard) to save a copy of
        anything you want to keep.
      </p>
      {!open && (
        <button type="button" onClick={() => setOpen(true)}>Delete this business...</button>
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
