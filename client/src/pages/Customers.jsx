import { useEffect, useMemo, useState } from "react";
import { api, getUser } from "../lib/api";
import { exportSheet } from "../lib/exportExcel";
import { INDIAN_STATES } from "../lib/gst";

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({ name: "", phone: "", email: "", billing_address: "", pincode: "", country: "India", gstin: "", state: "" });
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [portalBusyId, setPortalBusyId] = useState(null);
  const [portalNotes, setPortalNotes] = useState({}); // customer id -> { message, link }
  const canManage = ["owner", "admin"].includes(getUser()?.role);

  // Each customer's own portal login — a real email + password account they
  // set up from a link we email them, so they can see every invoice
  // addressed to them and its status without calling to ask. Turning it off
  // cuts them off right away (checked on every portal request server-side,
  // not just at login) rather than just hiding a link.
  const setNote = (customerId, note) => setPortalNotes((prev) => ({ ...prev, [customerId]: note }));

  const togglePortal = async (customer) => {
    const turningOn = customer.portal_status === "off" || customer.portal_status === "no_email";
    setPortalBusyId(customer.id);
    setNote(customer.id, null);
    try {
      const updated = await api.setCustomerPortalEnabled(customer.id, turningOn);
      setCustomers((prev) => prev.map((c) => (c.id === customer.id ? { ...c, ...updated } : c)));
      if (updated.email_warning) setNote(customer.id, { message: updated.email_warning, link: updated.invite_link });
      else if (turningOn && updated.portal_status === "invited") setNote(customer.id, { message: "Invite emailed to the customer." });
    } catch (err) {
      setError(err.message);
    } finally {
      setPortalBusyId(null);
    }
  };

  const resendInvite = async (customer) => {
    setPortalBusyId(customer.id);
    setNote(customer.id, null);
    try {
      const result = await api.resendCustomerPortalInvite(customer.id);
      setNote(customer.id, result.email_warning ? { message: result.email_warning, link: result.invite_link } : { message: "Invite emailed to the customer." });
    } catch (err) {
      setError(err.message);
    } finally {
      setPortalBusyId(null);
    }
  };

  const copyInviteLink = async (link) => {
    try { await navigator.clipboard.writeText(link); } catch { window.prompt("Copy this link:", link); }
  };

  const load = () => api.listCustomers().then(setCustomers);
  useEffect(() => { load(); }, []);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      (c.name || "").toLowerCase().includes(q) ||
      (c.phone || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.gstin || "").toLowerCase().includes(q)
    );
  }, [customers, search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.createCustomer(form);
      setForm({ name: "", phone: "", email: "", billing_address: "", pincode: "", country: "India", gstin: "", state: "" });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Customers</h1>
        {customers.length > 0 && (
          <button type="button" className="link-btn" onClick={() => exportCustomersToExcel(customers)}>
            Export to Excel
          </button>
        )}
      </div>
      {canManage ? (
        <form className="inline-form" onSubmit={handleSubmit}>
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <textarea
            className="address-textarea"
            rows={2}
            placeholder="Address (building, street, area...)"
            value={form.billing_address}
            onChange={(e) => setForm({ ...form, billing_address: e.target.value })}
          />
          <input className="pincode-input" placeholder="PIN code" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
          <input className="country-input" placeholder="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
          <input placeholder="GSTIN (optional)" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
          <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
            <option value="">State (for CGST/SGST vs IGST)</option>
            {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="submit">Add customer</button>
        </form>
      ) : (
        <p className="muted">Ask an Owner or Admin to add or edit customers.</p>
      )}
      {error && <p className="error">{error}</p>}

      {customers.length > 0 && (
        <div className="list-toolbar">
          <input
            type="search"
            placeholder="Search by name, phone, email, GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {filteredCustomers.length === 0 && customers.length > 0 && (
        <p className="list-empty-filtered">No customers match your search.</p>
      )}

      <table className="table">
        <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th>GSTIN</th><th>State</th><th>Portal</th></tr></thead>
        <tbody>
          {filteredCustomers.map((c) => {
            const busy = portalBusyId === c.id;
            const note = portalNotes[c.id];
            return (
              <tr key={c.id}>
                <td>{c.name}</td><td>{c.phone}</td><td>{c.email}</td>
                <td>{[c.billing_address, c.pincode, c.country].filter(Boolean).join(", ")}</td>
                <td>{c.gstin}</td><td>{c.state}</td>
                <td>
                  {c.portal_status === "no_email" && (
                    <span className="muted" title="Add an email address to give this customer portal access">Add email to enable</span>
                  )}
                  {c.portal_status === "off" && (
                    <button type="button" className="link-btn" disabled={busy} onClick={() => togglePortal(c)}>
                      {busy ? "Turning on..." : "Turn on portal access"}
                    </button>
                  )}
                  {c.portal_status === "invited" && (
                    <>
                      <span className="muted">Invite sent</span>
                      {" · "}
                      <button type="button" className="link-btn" disabled={busy} onClick={() => resendInvite(c)}>Resend</button>
                      {" · "}
                      <button type="button" className="link-btn" disabled={busy} onClick={() => togglePortal(c)}>Turn off</button>
                    </>
                  )}
                  {c.portal_status === "active" && (
                    <>
                      <span className="muted">Active</span>
                      {" · "}
                      <button type="button" className="link-btn" disabled={busy} onClick={() => resendInvite(c)} title="Send a link to reset their password">Reset link</button>
                      {" · "}
                      <button type="button" className="link-btn" disabled={busy} onClick={() => togglePortal(c)}>Turn off</button>
                    </>
                  )}
                  {note && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                      {note.message}
                      {note.link && (
                        <>
                          {" "}
                          <button type="button" className="link-btn" onClick={() => copyInviteLink(note.link)}>Copy link</button>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function exportCustomersToExcel(customers) {
  const rows = customers.map((c) => ({
    Name: c.name,
    Phone: c.phone || "",
    Email: c.email || "",
    "Billing Address": c.billing_address || "",
    "PIN Code": c.pincode || "",
    Country: c.country || "",
    GSTIN: c.gstin || "",
    State: c.state || "",
  }));
  exportSheet("customers.xlsx", "Customers", rows);
}
