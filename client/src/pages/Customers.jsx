import { useEffect, useMemo, useState } from "react";
import { api, getUser } from "../lib/api";
import { exportSheet } from "../lib/exportExcel";
import { INDIAN_STATES } from "../lib/gst";
import { formatAddressLines } from "../lib/format";
import ConfirmDialog from "../components/ConfirmDialog";

const BLANK_CUSTOMER_FORM = {
  name: "", phone: "", email: "", gstin: "",
  billing_address: "", billing_address_line2: "", billing_city: "", state: "", pincode: "", country: "India",
  shipping_address: "", shipping_address_line2: "", shipping_city: "", shipping_state: "", shipping_pincode: "", shipping_country: "",
};

// One combined postal address line, used for the customer list's Address
// column and the Excel export. Built from the same individual Street 1/
// Street 2/City/State/Pin Code/Country fields (2026-09-22) that print as
// separate lines on a document, joined back into the single readable line
// those two spots already showed, rather than adding a wide run of
// near-empty columns for each part.
function joinAddress(address) {
  return formatAddressLines(address).join(", ");
}

// Billing and Shipping each get the same Street 1/Street 2/City/State/Pin
// Code/Country shape, matching Zoho's own customer form (Naveen's
// reference, 2026-09-22). One shared component instead of writing the same
// six fields out twice per modal (Add and Edit), so the two can't drift.
function AddressFields({ title, values, onChange, extra, stateHint }) {
  const set = (field) => (e) => onChange(field, e.target.value);
  return (
    <fieldset className="address-fields">
      <legend>
        <span>{title}</span>
        {extra}
      </legend>
      <label className="block">
        Street 1
        <input value={values.line1} onChange={set("line1")} placeholder="Building, street, area..." />
      </label>
      <label className="block">
        Street 2 (optional)
        <input value={values.line2} onChange={set("line2")} />
      </label>
      <div className="form-row">
        <label className="block">
          City
          <input value={values.city} onChange={set("city")} />
        </label>
        <label className="block">
          PIN code
          <input value={values.pincode} onChange={set("pincode")} />
        </label>
      </div>
      <div className="form-row">
        <label className="block">
          State
          <select value={values.state} onChange={set("state")}>
            <option value="">{stateHint || "Select"}</option>
            {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="block">
          Country
          <input value={values.country} onChange={set("country")} />
        </label>
      </div>
    </fieldset>
  );
}

// Reads/writes a form's (either the Add form or the Edit form, both share
// the same BLANK_CUSTOMER_FORM shape) Billing or Shipping fields through
// the generic line1/line2/city/state/pincode/country shape AddressFields
// speaks, so the same fieldset markup serves both address blocks and both
// modals without repeating six field bindings four times over (2026-09-22).
function billingFieldsProps(state, setter) {
  const map = { line1: "billing_address", line2: "billing_address_line2", city: "billing_city", state: "state", pincode: "pincode", country: "country" };
  return {
    values: { line1: state.billing_address, line2: state.billing_address_line2, city: state.billing_city, state: state.state, pincode: state.pincode, country: state.country },
    onChange: (field, value) => setter((prev) => ({ ...prev, [map[field]]: value })),
  };
}

function shippingFieldsProps(state, setter) {
  const map = { line1: "shipping_address", line2: "shipping_address_line2", city: "shipping_city", state: "shipping_state", pincode: "shipping_pincode", country: "shipping_country" };
  return {
    values: { line1: state.shipping_address, line2: state.shipping_address_line2, city: state.shipping_city, state: state.shipping_state, pincode: state.shipping_pincode, country: state.shipping_country },
    onChange: (field, value) => setter((prev) => ({ ...prev, [map[field]]: value })),
  };
}

// Zoho's own customer form has a "Copy billing address" shortcut under
// Shipping Address (Naveen's reference screenshot, 2026-09-22) for the
// common case where the two match. State intentionally maps to the
// billing-only `state` field (the one that drives CGST/SGST vs IGST), not
// `shipping_state`, since that's what "the billing state" means here.
function copyBillingToShipping(setter) {
  setter((prev) => ({
    ...prev,
    shipping_address: prev.billing_address,
    shipping_address_line2: prev.billing_address_line2,
    shipping_city: prev.billing_city,
    shipping_state: prev.state,
    shipping_pincode: prev.pincode,
    shipping_country: prev.country,
  }));
}

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(BLANK_CUSTOMER_FORM);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [portalBusyId, setPortalBusyId] = useState(null);
  const [portalNotes, setPortalNotes] = useState({}); // customer id -> { message, link }
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const canManage = ["owner", "admin"].includes(getUser()?.role);

  // Inline "Add Credit"/"Add Debit" against a customer's prepaid retainer
  // balance — same collapsed-until-clicked pattern as the portal column
  // above, rather than a separate page for something this small (2026-09-16).
  const [retainerOpenId, setRetainerOpenId] = useState(null);
  const [retainerForm, setRetainerForm] = useState({ amount: "", type: "credit", note: "" });
  const [retainerBusy, setRetainerBusy] = useState(false);
  const [retainerError, setRetainerError] = useState("");

  const openRetainerForm = (customerId) => {
    setRetainerOpenId(customerId);
    setRetainerForm({ amount: "", type: "credit", note: "" });
    setRetainerError("");
  };

  const submitRetainer = async (e, customer) => {
    e.preventDefault();
    setRetainerBusy(true);
    setRetainerError("");
    try {
      const updated = await api.addRetainerTransaction(customer.id, retainerForm);
      setCustomers((prev) => prev.map((c) => (c.id === customer.id ? { ...c, ...updated } : c)));
      setRetainerOpenId(null);
    } catch (err) {
      setRetainerError(err.message);
    } finally {
      setRetainerBusy(false);
    }
  };

  // A popup instead of an in-row edit (2026-09-15) — the old inline row
  // squeezed the address, PIN code and country into one cramped cell, which
  // Naveen flagged as looking awkward. Mirrors the Add Customer modal below.
  const startEdit = (c) => {
    setEditTarget(c);
    setEditError("");
    setEditForm({
      name: c.name || "",
      phone: c.phone || "",
      email: c.email || "",
      gstin: c.gstin || "",
      billing_address: c.billing_address || "",
      billing_address_line2: c.billing_address_line2 || "",
      billing_city: c.billing_city || "",
      state: c.state || "",
      pincode: c.pincode || "",
      country: c.country || "India",
      shipping_address: c.shipping_address || "",
      shipping_address_line2: c.shipping_address_line2 || "",
      shipping_city: c.shipping_city || "",
      shipping_state: c.shipping_state || "",
      shipping_pincode: c.shipping_pincode || "",
      shipping_country: c.shipping_country || "",
    });
  };

  const cancelEdit = () => {
    setEditTarget(null);
    setEditForm(null);
    setEditError("");
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setEditSaving(true);
    setEditError("");
    try {
      const updated = await api.updateCustomer(editTarget.id, editForm);
      setCustomers((prev) => prev.map((c) => (c.id === editTarget.id ? { ...c, ...updated } : c)));
      cancelEdit();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  // A soft delete — the customer moves to Trash (see Support > ... no,
  // Trash.jsx from the sidebar) rather than vanishing outright, so a
  // misclick can always be undone (2026-09-20).
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteCustomer(deleteTarget.id);
      setCustomers((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err.message);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
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
            <button type="button" onClick={openAddModal} data-tour="customers-add-button">+ Add Customer</button>
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
          <div className="modal-panel wide" onMouseDown={(e) => e.stopPropagation()}>
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
                GSTIN (optional)
                <input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
              </label>
              <AddressFields
                title="Billing Address"
                stateHint="Select (for CGST/SGST vs IGST)"
                {...billingFieldsProps(form, setForm)}
              />
              <AddressFields
                title="Shipping Address (optional, if different)"
                extra={
                  <button type="button" className="link-btn" onClick={() => copyBillingToShipping(setForm)}>
                    Copy billing address
                  </button>
                }
                {...shippingFieldsProps(form, setForm)}
              />
              {error && <p className="error">{error}</p>}
              <div className="modal-actions">
                <button type="button" className="link-btn" onClick={closeAddModal}>Cancel</button>
                <button type="submit">Add Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="modal-backdrop" onMouseDown={cancelEdit}>
          <div className="modal-panel wide" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Customer</h3>
              <button type="button" className="modal-close" onClick={cancelEdit} aria-label="Close">
                &times;
              </button>
            </div>
            <form onSubmit={saveEdit}>
              <label className="block">
                Name
                <input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required autoFocus />
              </label>
              <div className="form-row">
                <label className="block">
                  Phone
                  <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                </label>
                <label className="block">
                  Email
                  <input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
                </label>
              </div>
              <label className="block">
                GSTIN (optional)
                <input value={editForm.gstin} onChange={(e) => setEditForm({ ...editForm, gstin: e.target.value })} />
              </label>
              <AddressFields
                title="Billing Address"
                stateHint="Select (for CGST/SGST vs IGST)"
                {...billingFieldsProps(editForm, setEditForm)}
              />
              <AddressFields
                title="Shipping Address (optional, if different)"
                extra={
                  <button type="button" className="link-btn" onClick={() => copyBillingToShipping(setEditForm)}>
                    Copy billing address
                  </button>
                }
                {...shippingFieldsProps(editForm, setEditForm)}
              />
              <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>Portal access is turned on or off from the Portal column, not here.</p>
              {editError && <p className="error">{editError}</p>}
              <div className="modal-actions">
                <button type="button" className="link-btn" onClick={cancelEdit}>Cancel</button>
                <button type="submit" disabled={editSaving}>{editSaving ? "Saving..." : "Save Changes"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this customer?"
          message={`"${deleteTarget.name}" moves to Trash and disappears from this list. Restore it from Trash any time, or delete it permanently from there once you're sure.`}
          confirmLabel="Delete Customer"
          danger
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
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
        <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th>GSTIN</th><th>State</th><th>Portal</th><th>Retainer</th>{canManage && <th></th>}</tr></thead>
        <tbody>
          {filteredCustomers.map((c) => {
            const busy = portalBusyId === c.id;
            const note = portalNotes[c.id];

            return (
              <tr key={c.id}>
                <td>{c.name}</td><td>{c.phone}</td><td>{c.email}</td>
                <td>{joinAddress({ line1: c.billing_address, line2: c.billing_address_line2, city: c.billing_city, state: c.state, pincode: c.pincode, country: c.country })}</td>
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
                <td>
                  ₹{Number(c.retainer_balance || 0).toFixed(2)}
                  {canManage && (
                    <>
                      {" · "}
                      <button type="button" className="link-btn" onClick={() => openRetainerForm(c.id)}>Adjust</button>
                    </>
                  )}
                  {retainerOpenId === c.id && (
                    <form className="inline-form" style={{ marginTop: 6 }} onSubmit={(e) => submitRetainer(e, c)}>
                      <select value={retainerForm.type} onChange={(e) => setRetainerForm({ ...retainerForm, type: e.target.value })}>
                        <option value="credit">Add Credit</option>
                        <option value="debit">Add Debit</option>
                      </select>
                      <input
                        type="number" step="0.01" min="0.01" placeholder="Amount"
                        value={retainerForm.amount}
                        onChange={(e) => setRetainerForm({ ...retainerForm, amount: e.target.value })}
                        required autoFocus
                      />
                      <input
                        placeholder="Note (optional)"
                        value={retainerForm.note}
                        onChange={(e) => setRetainerForm({ ...retainerForm, note: e.target.value })}
                      />
                      <button type="submit" disabled={retainerBusy}>{retainerBusy ? "Saving..." : "Save"}</button>
                      <button type="button" className="link-btn" onClick={() => setRetainerOpenId(null)}>Cancel</button>
                      {retainerError && <p className="error">{retainerError}</p>}
                    </form>
                  )}
                </td>
                {canManage && (
                  <td>
                    <button type="button" className="link-btn" onClick={() => startEdit(c)}>Edit</button>
                    {" · "}
                    <button type="button" className="link-btn" onClick={() => setDeleteTarget(c)}>Delete</button>
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
    "Billing Address": joinAddress({ line1: c.billing_address, line2: c.billing_address_line2, city: c.billing_city, state: c.state, pincode: c.pincode, country: c.country }),
    "Shipping Address": joinAddress({ line1: c.shipping_address, line2: c.shipping_address_line2, city: c.shipping_city, state: c.shipping_state, pincode: c.shipping_pincode, country: c.shipping_country }),
    GSTIN: c.gstin || "",
    State: c.state || "",
    "Retainer Balance": Number(c.retainer_balance || 0),
  }));
  exportSheet("customers.xlsx", "Customers", rows);
}
