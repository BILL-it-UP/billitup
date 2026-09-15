import { useEffect, useMemo, useState } from "react";
import { api, getUser } from "../lib/api";
import { exportSheet } from "../lib/exportExcel";
import { INDIAN_STATES } from "../lib/gst";

const BLANK_CUSTOMER_FORM = { name: "", phone: "", email: "", billing_address: "", pincode: "", country: "India", gstin: "", state: "" };

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(BLANK_CUSTOMER_FORM);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [portalBusyId, setPortalBusyId] = useState(null);
  const [portalNotes, setPortalNotes] = useState({}); // customer id -> { message, link }
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const canManage = ["owner", "admin"].includes(getUser()?.role);

  const startEdit = (c) => {
    setEditingId(c.id);
    setEditError("");
    setEditForm({
      name: c.name || "",
      phone: c.phone || "",
      email: c.email || "",
      billing_address: c.billing_address || "",
      pincode: c.pincode || "",
      country: c.country || "India",
      gstin: c.gstin || "",
      state: c.state || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
    setEditError("");
  };

  const saveEdit = async (id) => {
    setEditSaving(true);
    setEditError("");
    try {
      const updated = await api.updateCustomer(id, editForm);
      setCustomers((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
      cancelEdit();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  };

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

  const openAddModal = () => {
    setForm(BLANK_CUSTOMER_FORM);
    setError("");
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.createCustomer(form);
      setForm(BLANK_CUSTOMER_FORM);
      setShowAddModal(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Customers</h1>
        <div className="form-row" style={{ gap: 12 }}>
          {canManage && (
            <button type="button" onClick={openAddModal}>+ Add Customer</button>
          )}
          {customers.length > 0 && (
            <button type="button" className="link-btn" onClick={() => exportCustomersToExcel(customers)}>
              Export to Excel
            </button>
          )}
        </div>
      </div>
      {!canManage && <p className="muted">Ask an Owner or Admin to add or edit customers.</p>}
      {error && !showAddModal && <p className="error">{error}</p>}

      {showAddModal && (
        <div className="modal-backdrop" onMouseDown={closeAddModal}>
          <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Customer</h3>
              <button type="button" className="modal-close" onClick={closeAddModal} aria-label="Close">
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <label className="block">
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
              </label>
              <div className="form-row">
                <label className="block">
                  Phone
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </label>
                <label className="block">
                  Email
                  <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </label>
              </div>
              <label className="block">
                Address
                <textarea
                  rows={2}
                  placeholder="Building, street, area..."
                  value={form.billing_address}
                  onChange={(e) => setForm({ ...form, billing_address: e.target.value })}
                />
              </label>
              <div className="form-row">
                <label className="block">
                  PIN code
                  <input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
                </label>
                <label className="block">
                  Country
                  <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                </label>
              </div>
              <div className="form-row">
                <label className="block">
                  GSTIN (optional)
                  <input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
                </label>
                <label className="block">
                  State
                  <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
                    <option value="">Select (for CGST/SGST vs IGST)</option>
                    {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>
              {error && <p className="error">{error}</p>}
              <div className="modal-actions">
                <button type="button" className="link-btn" onClick={closeAddModal}>Cancel</button>
                <button type="submit">Add Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}

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
        <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th>GSTIN</th><th>State</th><th>Portal</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {filteredCustomers.map((c) => {
            const busy = portalBusyId === c.id;
            const note = portalNotes[c.id];
            const isEditing = editingId === c.id;

            if (isEditing) {
              return (
                <tr key={c.id}>
                  <td><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required /></td>
                  <td><input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></td>
                  <td><input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></td>
                  <td>
                    <textarea
                      className="address-textarea"
                      rows={2}
                      value={editForm.billing_address}
                      onChange={(e) => setEditForm({ ...editForm, billing_address: e.target.value })}
                    />
                    <input className="pincode-input" placeholder="PIN code" value={editForm.pincode} onChange={(e) => setEditForm({ ...editForm, pincode: e.target.value })} />
                    <input className="country-input" placeholder="Country" value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} />
                  </td>
                  <td><input value={editForm.gstin} onChange={(e) => setEditForm({ ...editForm, gstin: e.target.value })} /></td>
                  <td>
                    <select value={editForm.state} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}>
                      <option value="">State</option>
                      {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>Portal settings save separately</td>
                  <td>
                    <button type="button" className="link-btn" disabled={editSaving} onClick={() => saveEdit(c.id)}>{editSaving ? "Saving..." : "Save"}</button>
                    {" · "}
                    <button type="button" className="link-btn" disabled={editSaving} onClick={cancelEdit}>Cancel</button>
                    {editError && <div className="error" style={{ fontSize: 12, marginTop: 4 }}>{editError}</div>}
                  </td>
                </tr>
              );
            }

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
                {canManage && (
                  <td>
                    <button type="button" className="link-btn" onClick={() => startEdit(c)}>Edit</button>
                  </td>
                )}
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
