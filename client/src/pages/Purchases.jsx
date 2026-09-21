import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { exportSheet } from "../lib/exportExcel";
import { formatMoney, formatDate } from "../lib/format";
import { useDateFormat } from "../lib/useDateFormat";
import TaxRateInput from "../components/TaxRateInput";

const todayStr = () => new Date().toISOString().slice(0, 10);
const DAY_MS = 24 * 60 * 60 * 1000;

// Section 43B(h): an MSME vendor with no written agreement must be paid
// within 15 days, or 45 days if there is one — miss that and interest runs
// at three times the RBI bank rate until it's paid. This is a plain
// reminder calculation from what's on file, not a filing itself, so it
// deliberately doesn't compound and just wants a rough number to flag
// (2026-09-16).
function msmeInterestInfo(purchase, rbiBankRate) {
  if (!purchase.vendor_is_msme) return null;
  const deadlineDays = purchase.vendor_has_written_agreement ? 45 : 15;
  const start = new Date(purchase.purchase_date);
  const deadline = new Date(start.getTime() + deadlineDays * DAY_MS);
  const end = purchase.paid_date ? new Date(purchase.paid_date) : new Date();
  if (end <= deadline) return { deadline, overdue: false };
  const daysOverdue = Math.ceil((end - deadline) / DAY_MS);
  const rate = Number(rbiBankRate) || 0;
  const interest = Number(purchase.total) * (3 * rate / 100 / 365) * daysOverdue;
  return { deadline, overdue: true, daysOverdue, interest };
}

// A basic purchases/expenses log — bills a business receives from its
// vendors, logged for its own records and to see how much input tax it has
// paid (useful when working out GST input tax credit with a tax advisor).
// Deliberately simple: no approval flow — just a running record, plus the
// MSME interest flag above and an optional link to a customer for expenses
// that are billable back to them. Owner/Admin only.
export default function Purchases() {
  const [purchases, setPurchases] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [business, setBusiness] = useState(null);
  const [form, setForm] = useState({
    vendor_id: "", purchase_date: todayStr(), bill_number: "", description: "", amount: "", tax_rate: "0", notes: "",
    paid_date: "", billable_customer_id: "",
  });
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const dateFormat = useDateFormat();
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const load = () => api.listPurchases().then(setPurchases);
  useEffect(() => {
    load();
    api.listVendors().then(setVendors);
    api.listCustomers().then(setCustomers);
    api.getBusiness().then(setBusiness);
  }, []);

  // A popup edit, same shape as the inline Add form above it — the backend
  // route (PUT /api/purchases/:id) already existed for "Mark Paid Today",
  // this just exposes the rest of it (vendor, bill number, description,
  // amount, tax, billable customer) instead of only the paid date (2026-09-20).
  const startEdit = (p) => {
    setEditTarget(p);
    setEditError("");
    setEditForm({
      vendor_id: p.vendor_id || "", purchase_date: p.purchase_date, bill_number: p.bill_number || "",
      description: p.description || "", amount: p.amount, tax_rate: p.tax_rate || 0, notes: p.notes || "",
      paid_date: p.paid_date || "", billable_customer_id: p.billable_customer_id || "",
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
      await api.updatePurchase(editTarget.id, {
        ...editForm,
        vendor_id: editForm.vendor_id || null,
        amount: Number(editForm.amount),
        tax_rate: Number(editForm.tax_rate),
        paid_date: editForm.paid_date || null,
        billable_customer_id: editForm.billable_customer_id || null,
      });
      cancelEdit();
      load();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return purchases;
    return purchases.filter((p) =>
      (p.vendor_name || "").toLowerCase().includes(q) ||
      (p.bill_number || "").toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q)
    );
  }, [purchases, search]);

  const totals = useMemo(() => {
    return filteredPurchases.reduce(
      (acc, p) => ({
        amount: acc.amount + Number(p.amount || 0),
        tax: acc.tax + Number(p.tax_amount || 0),
        total: acc.total + Number(p.total || 0),
      }),
      { amount: 0, tax: 0, total: 0 }
    );
  }, [filteredPurchases]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.amount) { setError("Amount is required"); return; }
    try {
      await api.createPurchase({
        ...form, vendor_id: form.vendor_id || null, amount: Number(form.amount), tax_rate: Number(form.tax_rate),
        paid_date: form.paid_date || null, billable_customer_id: form.billable_customer_id || null,
      });
      setForm({ vendor_id: "", purchase_date: todayStr(), bill_number: "", description: "", amount: "", tax_rate: "0", notes: "", paid_date: "", billable_customer_id: "" });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this purchase record? It moves to Trash and can be restored from there.")) return;
    await api.deletePurchase(id);
    load();
  };

  const markPaidToday = async (purchase) => {
    await api.updatePurchase(purchase.id, { paid_date: todayStr() });
    load();
  };

  return (
    <div>
      <div className="page-header">
        <h1>Purchases</h1>
        {purchases.length > 0 && (
          <button type="button" className="link-btn" onClick={() => exportPurchasesToExcel(purchases, business?.rbi_bank_rate)}>
            Export to Excel
          </button>
        )}
      </div>

      {vendors.length === 0 && (
        <p className="muted">
          No vendors yet — <Link to="/vendors">add one first</Link>, or leave the vendor field blank below for a one-off purchase.
        </p>
      )}

      <form className="inline-form" onSubmit={handleSubmit}>
        <input type="date" value={form.purchase_date} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} required />
        <select value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}>
          <option value="">Vendor (optional)</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <input placeholder="Bill/reference number" value={form.bill_number} onChange={(e) => setForm({ ...form, bill_number: e.target.value })} />
        <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <input placeholder="Amount (₹, before tax)" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        <TaxRateInput value={form.tax_rate} onChange={(v) => setForm({ ...form, tax_rate: v })} />
        <button type="submit">Add purchase</button>
      </form>
      <div className="inline-form" style={{ marginTop: -8 }}>
        <label className="block" style={{ maxWidth: 220 }}>
          Paid on (optional)
          <input type="date" value={form.paid_date} onChange={(e) => setForm({ ...form, paid_date: e.target.value })} />
        </label>
        <label className="block" style={{ maxWidth: 260 }}>
          Billable to a customer (optional)
          <select value={form.billable_customer_id} onChange={(e) => setForm({ ...form, billable_customer_id: e.target.value })}>
            <option value="">Not billable</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="error">{error}</p>}

      {editTarget && (
        <div className="modal-backdrop" onMouseDown={cancelEdit}>
          <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edit Purchase</h3>
              <button type="button" className="modal-close" onClick={cancelEdit} aria-label="Close">
                &times;
              </button>
            </div>
            <form onSubmit={saveEdit}>
              <div className="form-row">
                <label className="block">
                  Date
                  <input type="date" value={editForm.purchase_date} onChange={(e) => setEditForm({ ...editForm, purchase_date: e.target.value })} required />
                </label>
                <label className="block">
                  Vendor
                  <select value={editForm.vendor_id} onChange={(e) => setEditForm({ ...editForm, vendor_id: e.target.value })}>
                    <option value="">Vendor (optional)</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label className="block">
                  Bill/reference number
                  <input value={editForm.bill_number} onChange={(e) => setEditForm({ ...editForm, bill_number: e.target.value })} />
                </label>
                <label className="block">
                  Description
                  <input value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                </label>
              </div>
              <div className="form-row">
                <label className="block">
                  Amount (₹, before tax)
                  <input type="number" step="0.01" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} required />
                </label>
                <label className="block">
                  Tax %
                  <TaxRateInput value={editForm.tax_rate} onChange={(v) => setEditForm({ ...editForm, tax_rate: v })} />
                </label>
              </div>
              <div className="form-row">
                <label className="block">
                  Paid on (optional)
                  <input type="date" value={editForm.paid_date} onChange={(e) => setEditForm({ ...editForm, paid_date: e.target.value })} />
                </label>
                <label className="block">
                  Billable to a customer (optional)
                  <select value={editForm.billable_customer_id} onChange={(e) => setEditForm({ ...editForm, billable_customer_id: e.target.value })}>
                    <option value="">Not billable</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              </div>
              <label className="block">
                Notes (optional)
                <textarea rows={2} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
              </label>
              {editError && <p className="error">{editError}</p>}
              <div className="modal-actions">
                <button type="button" className="link-btn" onClick={cancelEdit}>Cancel</button>
                <button type="submit" disabled={editSaving}>{editSaving ? "Saving..." : "Save Changes"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {purchases.length > 0 && (
        <>
          <div className="stat-tiles" style={{ marginBottom: 16 }}>
            <div className="stat-tile">
              <span className="stat-label">Total Purchases (taxable value)</span>
              <span className="stat-value">₹{formatMoney(totals.amount)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Total Tax Paid</span>
              <span className="stat-value">₹{formatMoney(totals.tax)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Total Spent</span>
              <span className="stat-value">₹{formatMoney(totals.total)}</span>
            </div>
          </div>

          <div className="list-toolbar">
            <input
              type="search"
              placeholder="Search by vendor, bill number, description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </>
      )}

      {purchases.length === 0 && <p className="muted">No purchases logged yet.</p>}
      {filteredPurchases.length === 0 && purchases.length > 0 && (
        <p className="list-empty-filtered">No purchases match your search.</p>
      )}

      {filteredPurchases.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th><th>Vendor</th><th>Bill #</th><th>Description</th>
              <th>Amount</th><th>Tax</th><th>Total</th><th>Paid</th><th>Billable To</th><th>MSME Interest</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filteredPurchases.map((p) => {
              const msme = msmeInterestInfo(p, business?.rbi_bank_rate);
              return (
                <tr key={p.id}>
                  <td>{formatDate(p.purchase_date, dateFormat)}</td>
                  <td>{p.vendor_name || "—"}</td>
                  <td>{p.bill_number}</td>
                  <td>{p.description}</td>
                  <td>₹{formatMoney(p.amount)}</td>
                  <td>₹{formatMoney(p.tax_amount)} {p.tax_rate ? `(${p.tax_rate}%)` : ""}</td>
                  <td>₹{formatMoney(p.total)}</td>
                  <td>
                    {p.paid_date
                      ? formatDate(p.paid_date, dateFormat)
                      : <button type="button" className="link-btn" onClick={() => markPaidToday(p)}>Mark Paid Today</button>}
                  </td>
                  <td>{p.billable_customer_name ? `${p.billable_customer_name}${p.billed_invoice_id ? " (billed)" : ""}` : "—"}</td>
                  <td>
                    {!msme ? "—" : msme.overdue
                      ? <span className="error">₹{formatMoney(msme.interest)} ({msme.daysOverdue}d past {p.vendor_has_written_agreement ? "45" : "15"}-day deadline)</span>
                      : <span className="muted">Due by {formatDate(msme.deadline.toISOString().slice(0, 10), dateFormat)}</span>}
                  </td>
                  <td>
                    <button type="button" className="link-btn" onClick={() => startEdit(p)}>Edit</button>
                    {" · "}
                    <button type="button" className="link-btn" onClick={() => handleDelete(p.id)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function exportPurchasesToExcel(purchases, rbiBankRate) {
  const rows = purchases.map((p) => {
    const msme = msmeInterestInfo(p, rbiBankRate);
    return {
      Date: p.purchase_date, Vendor: p.vendor_name || "", "Bill #": p.bill_number || "",
      Description: p.description || "", Amount: Number(p.amount), "Tax Rate %": Number(p.tax_rate) || 0,
      "Tax Amount": Number(p.tax_amount), Total: Number(p.total),
      "Paid On": p.paid_date || "", "Billable To": p.billable_customer_name || "",
      "MSME Vendor": p.vendor_is_msme ? "Yes" : "No",
      "MSME Interest Due": msme?.overdue ? Number(msme.interest.toFixed(2)) : 0,
    };
  });
  exportSheet("purchases.xlsx", "Purchases", rows);
}
