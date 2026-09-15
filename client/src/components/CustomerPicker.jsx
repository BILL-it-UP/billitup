import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { INDIAN_STATES } from "../lib/gst";

// A type-to-search "Customer" field for the invoice form, matching the same
// pattern ItemPicker already uses for line items: search while typing, pick
// from the list, or add a brand new customer right here without leaving the
// form. There is deliberately no "walk-in / no customer" option — every
// BillItUp document is a real GST invoice billed to someone, unlike the
// plain <select> with a walk-in option this replaces (2026-09-15).
export default function CustomerPicker({ customers, customerId, customerName, onSelect, onCreated }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(customerName || "");
  const [showAddModal, setShowAddModal] = useState(false);
  const wrapRef = useRef(null);

  // Keep the visible text in sync when the parent changes the value from
  // outside (loading an existing invoice for editing, or a fresh new one).
  useEffect(() => {
    setQuery(customerName || "");
  }, [customerId, customerName]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  const handlePick = (customer) => {
    setQuery(customer.name);
    setOpen(false);
    onSelect(customer);
  };

  const handleClear = () => {
    setQuery("");
    onSelect(null);
    setOpen(true);
  };

  // "Confirmed" — a real customer is selected and the dropdown is closed.
  // While it's open we're still searching, so never show the locked view
  // mid-search.
  const confirmed = Boolean(customerId) && !open;

  return (
    <div className="item-picker customer-picker" ref={wrapRef}>
      {confirmed ? (
        <div className="item-picker-locked">
          <button type="button" className="item-picker-locked-name" onClick={() => setOpen(true)}>
            {customerName}
          </button>
          <button type="button" className="item-picker-locked-clear" onClick={handleClear} title="Change customer" aria-label="Change customer">
            &times;
          </button>
        </div>
      ) : (
        <input
          type="text"
          value={query}
          placeholder="Type to find a customer"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
        />
      )}
      {open && (
        <div className="item-picker-dropdown">
          {filtered.length === 0 && (
            <div className="item-picker-empty">No matching customer.</div>
          )}
          {filtered.map((c) => (
            <button
              type="button"
              key={c.id}
              className="item-picker-option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handlePick(c)}
            >
              <span className="item-picker-name">{c.name}</span>
              {c.gstin && <span className="item-picker-rate">{c.gstin}</span>}
            </button>
          ))}
          <button
            type="button"
            className="item-picker-add"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setShowAddModal(true);
              setOpen(false);
            }}
          >
            + Add New Customer
          </button>
        </div>
      )}
      {showAddModal && (
        <AddCustomerModal
          initialName={query}
          onClose={() => setShowAddModal(false)}
          onCreated={(customer) => {
            setShowAddModal(false);
            setQuery(customer.name);
            onCreated(customer);
          }}
        />
      )}
    </div>
  );
}

// Same field set as the "+ Add Customer" popup on the Customers page, kept
// deliberately in sync with it — this is just that same action reachable
// without leaving the invoice form.
function AddCustomerModal({ initialName, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: initialName || "",
    phone: "",
    email: "",
    billing_address: "",
    pincode: "",
    country: "India",
    gstin: "",
    state: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Rendered via a portal and NOT as a nested <form> — this modal opens from
  // inside the invoice form, and browsers silently break <form> elements
  // nested inside another <form> (same reasoning as ItemPicker's modal).
  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError("Name is required.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const created = await api.createCustomer(form);
      onCreated(created);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="modal-header">
          <h3>New Customer</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div>
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
            <button type="button" className="link-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving}>
              {saving ? "Adding..." : "Add Customer"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
