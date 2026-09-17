import { useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import TaxRateInput from "./TaxRateInput";
import UnitSelect from "./UnitSelect";
import AccountSelect from "./AccountSelect";
import { unitsForType } from "../lib/units";
import { SALES_ACCOUNT_GROUPS, PURCHASE_ACCOUNT_GROUPS } from "../lib/accounts";

// The single item Add/Edit form, shared by the Items catalog page and the
// "+ Add New Item" quick-add opened from inside the invoice line item picker
// — one place to keep them from drifting apart. Structured after Zoho's own
// "New Item" popup: a Sales Information section (what a customer is billed
// and how the sale would be categorized) and a Purchase Information section
// (what it costs you and how a purchase would be categorized), each with
// their own description and account (2026-09-17). Editing an existing item
// is passed in as `item`; leaving it out opens this in Add mode instead.
export default function ItemFormModal({ item, initialName, onClose, onSaved }) {
  const isEdit = Boolean(item?.id);
  const [form, setForm] = useState({
    name: item?.name ?? initialName ?? "",
    type: item?.type || "service",
    unit: item?.unit || unitsForType(item?.type || "service")[0].value,
    rate: item?.rate ?? "",
    tax_rate: item?.tax_rate ?? "0",
    hsn_sac_code: item?.hsn_sac_code || "",
    description: item?.description || "",
    sales_account: item?.sales_account || "Sales",
    purchase_account: item?.purchase_account || "Cost of Goods Sold",
    cost_price: item?.cost_price ?? "",
    purchase_description: item?.purchase_description || "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Rendered via a portal (see below) and NOT as a nested <form> — this modal
  // is opened from inside the invoice/quote form when used as the quick-add,
  // and browsers silently break <form> elements nested inside another
  // <form>, so a plain div + button click (plus Enter-to-submit) is used.
  const handleSubmit = async () => {
    if (!form.name.trim() || !form.rate) {
      setError("Name and selling price are required.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const payload = {
        ...form,
        rate: Number(form.rate) || 0,
        tax_rate: Number(form.tax_rate) || 0,
        cost_price: form.cost_price === "" ? null : Number(form.cost_price),
      };
      const saved = isEdit ? await api.updateItem(item.id, payload) : await api.createItem(payload);
      onSaved(saved);
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
      <div className="modal-panel wide" onMouseDown={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="modal-header">
          <h3>{isEdit ? "Edit Item" : "New Item"}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div>
          <label className="block" style={{ maxWidth: "none" }}>
            Name
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              autoFocus
            />
          </label>
          <div className="radio-row">
            <label className="radio-option">
              <input
                type="radio" name="item-form-type" checked={form.type === "goods"}
                onChange={() => setForm({ ...form, type: "goods", unit: unitsForType("goods")[0].value })}
              />
              Goods
            </label>
            <label className="radio-option">
              <input
                type="radio" name="item-form-type" checked={form.type === "service"}
                onChange={() => setForm({ ...form, type: "service", unit: unitsForType("service")[0].value })}
              />
              Service
            </label>
          </div>

          <h4 className="modal-section-title">Sales Information</h4>
          <div className="form-row">
            <label className="block">
              Selling Price (₹)
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
              <TaxRateInput value={form.tax_rate} onChange={(v) => setForm({ ...form, tax_rate: v })} />
            </label>
            <label className="block">
              Unit
              <UnitSelect type={form.type} value={form.unit} onChange={(v) => setForm({ ...form, unit: v })} />
            </label>
          </div>
          <label className="block">
            Account
            <AccountSelect
              groups={SALES_ACCOUNT_GROUPS}
              value={form.sales_account}
              onChange={(v) => setForm({ ...form, sales_account: v })}
            />
          </label>
          <label className="block">
            Description (optional, fetched onto the invoice line when this item is picked)
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>

          <h4 className="modal-section-title">Purchase Information</h4>
          <p className="muted" style={{ marginTop: -4, marginBottom: 8, fontSize: 12 }}>
            For your own records only. BillItUp's Purchases page doesn't pull from this catalog yet, so nothing here
            changes what a customer sees or what you're billed.
          </p>
          <div className="form-row">
            <label className="block">
              Cost Price (₹, optional)
              <input
                type="number"
                step="0.01"
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
              />
            </label>
            <label className="block">
              Account
              <AccountSelect
                groups={PURCHASE_ACCOUNT_GROUPS}
                value={form.purchase_account}
                onChange={(v) => setForm({ ...form, purchase_account: v })}
              />
            </label>
          </div>
          <label className="block">
            Description (optional, for your own purchase records)
            <textarea
              rows={2}
              value={form.purchase_description}
              onChange={(e) => setForm({ ...form, purchase_description: e.target.value })}
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
              {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Item"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
