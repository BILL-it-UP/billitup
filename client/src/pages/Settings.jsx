import { useEffect, useState } from "react";
import { api, getUser } from "../lib/api";

const PAPER_SIZES = [
  { value: "A4", label: "A4" },
  { value: "THERMAL_3IN", label: '3" Thermal' },
  { value: "THERMAL_4IN", label: '4" Thermal' },
];

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
        <p className="muted">Finish setting up your business — fill in the details below and choose how invoices should behave.</p>
      )}

      <form onSubmit={handleSave} className="settings-form">
        <label>Business name
          <input value={business.name || ""} onChange={(e) => setBusiness({ ...business, name: e.target.value })} />
        </label>
        <label>Business type
          <input value={business.business_type || ""} onChange={(e) => setBusiness({ ...business, business_type: e.target.value })} />
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
        <label>Quote number prefix
          <input value={business.quote_prefix || ""} onChange={(e) => setBusiness({ ...business, quote_prefix: e.target.value })} />
        </label>
        <label>Credit note number prefix
          <input value={business.credit_note_prefix || ""} onChange={(e) => setBusiness({ ...business, credit_note_prefix: e.target.value })} />
        </label>
        <label>Default paper size (used when opening an invoice)
          <select value={business.default_paper_size || "A4"} onChange={(e) => setBusiness({ ...business, default_paper_size: e.target.value })}>
            {PAPER_SIZES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
        <label className="checkbox-label">
          <input type="checkbox" checked={!!business.inventory_enabled} onChange={(e) => setBusiness({ ...business, inventory_enabled: e.target.checked })} />
          {" "}Track stock quantity for items (decrements automatically when invoiced)
        </label>

        {error && <p className="error">{error}</p>}
        {savedMsg && <p className="muted">{savedMsg}</p>}
        <button type="submit">Save</button>
      </form>

      <EmailSettings business={business} setBusiness={setBusiness} />

      {user?.role === "owner" && <StaffManagement />}
    </div>
  );
}

function EmailSettings({ business, setBusiness }) {
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
    </div>
  );
}

function StaffManagement() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "cashier" });
  const [error, setError] = useState("");

  const load = () => api.listUsers().then(setUsers);
  useEffect(() => { load(); }, []);

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
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th /></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td><td>{u.email}</td><td>{u.role}</td>
              <td>{u.role !== "owner" && <button className="link-btn" onClick={() => handleRemove(u.id)}>Remove</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
