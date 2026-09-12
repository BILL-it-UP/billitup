import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";

// A Zoho-style "type or click to select an item" combobox: type to search the
// item catalog, click a result to select it, or just keep typing free text to
// bill a custom (non-catalog) line. Owners/Admins also get an inline "+ Add
// New Item" option so they can add to the catalog without leaving the form.
export default function ItemPicker({ items, itemId, itemName, canManage, onSelect, onTextChange, onItemCreated }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(itemName || "");
  const [showAddModal, setShowAddModal] = useState(false);
  const wrapRef = useRef(null);

  // Keep the visible text in sync when the parent changes the line from
  // outside (e.g. a fresh empty line, or an item picked in another way).
  useEffect(() => {
    setQuery(itemName || "");
  }, [itemId, itemName]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = items.filter((it) =>
    it.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  const handlePick = (item) => {
    setQuery(item.name);
    setOpen(false);
    onSelect(item);
  };

  const handleInputChange = (e) => {
    const text = e.target.value;
    setQuery(text);
    setOpen(true);
    onTextChange(text);
  };

  return (
    <div className="item-picker" ref={wrapRef}>
      <input
        type="text"
        value={query}
        placeholder="Type or click to select an item"
        onFocus={() => setOpen(true)}
        onChange={handleInputChange}
      />
      {open && (
        <div className="item-picker-dropdown">
          {filtered.length === 0 && (
            <div className="item-picker-empty">
              No matching item — this line will be billed as a custom item.
            </div>
          )}
          {filtered.map((it) => (
            <button
              type="button"
              key={it.id}
              className="item-picker-option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handlePick(it)}
            >
              <span className="item-picker-name">{it.name}</span>
              <span className="item-picker-rate">₹{Number(it.rate || 0).toFixed(2)}</span>
            </button>
          ))}
          {canManage && (
            <button
              type="button"
              className="item-picker-add"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setShowAddModal(true);
                setOpen(false);
              }}
            >
              + Add New Item
            </button>
          )}
        </div>
      )}
      {showAddModal && (
        <AddItemModal
          initialName={query}
          onClose={() => setShowAddModal(false)}
          onCreated={(item) => {
            setShowAddModal(false);
            setQuery(item.name);
            onItemCreated(item);
          }}
        />
      )}
    </div>
  );
}

function AddItemModal({ initialName, onClose, onCreated }) {
  const [form, setForm] = useState({
    name: initialName || "",
    unit: "pcs",
    rate: "",
    tax_rate: "0",
    hsn_sac_code: "",
    description: "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Rendered via a portal (see below) and NOT as a nested <form> — this modal
  // is opened from inside the invoice/quote form, and browsers silently break
  // <form> elements nested inside another <form>, so a plain div + button
  // click (plus Enter-to-submit on the name field) is used instead.
  const handleSubmit = async () => {
    if (!form.name.trim() || !form.rate) {
      setError("Name and rate are required.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const created = await api.createItem({
        ...form,
        rate: Number(form.rate) || 0,
        tax_rate: Number(form.tax_rate) || 0,
      });
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
          <h3>New Item</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div>
          <label className="block">
            Name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </label>
          <div className="form-row">
            <label className="block">
              Rate (₹)
              <input
                type="number"
                step="0.01"
                value={form.rate}
                onChange={(e) => setForm({ ...form, rate: e.target.value })}
                required
              />
            </label>
            <label className="block">
              Tax %
              <input
                type="number"
                step="0.01"
                value={form.tax_rate}
                onChange={(e) => setForm({ ...form, tax_rate: e.target.value })}
              />
            </label>
            <label className="block">
              Unit
              <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </label>
          </div>
          <label className="block">
            Description (optional — fetched onto the invoice line when this item is picked)
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          <label className="block">
            HSN/SAC (optional)
            <input
              value={form.hsn_sac_code}
              onChange={(e) => setForm({ ...form, hsn_sac_code: e.target.value })}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="link-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" onClick={handleSubmit} disabled={saving}>
              {saving ? "Adding..." : "Add Item"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
