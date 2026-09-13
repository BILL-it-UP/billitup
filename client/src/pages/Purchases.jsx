import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { exportSheet } from "../lib/exportExcel";
import { formatMoney, formatDate } from "../lib/format";
import { useDateFormat } from "../lib/useDateFormat";
import TaxRateInput from "../components/TaxRateInput";

const todayStr = () => new Date().toISOString().slice(0, 10);

// A basic purchases/expenses log — bills a business receives from its
// vendors, logged for its own records and to see how much input tax it has
// paid (useful when working out GST input tax credit with a tax advisor).
// Deliberately simple: no approval flow, no linking a purchase to a specific
// invoice's cost — just a running record. Owner/Admin only.
export default function Purchases() {
  const [purchases, setPurchases] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState({
    vendor_id: "", purchase_date: todayStr(), bill_number: "", description: "", amount: "", tax_rate: "0", notes: "",
  });
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const dateFormat = useDateFormat();

  const load = () => api.listPurchases().then(setPurchases);
  useEffect(() => {
    load();
    api.listVendors().then(setVendors);
  }, []);

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
      await api.createPurchase({ ...form, vendor_id: form.vendor_id || null, amount: Number(form.amount), tax_rate: Number(form.tax_rate) });
      setForm({ vendor_id: "", purchase_date: todayStr(), bill_number: "", description: "", amount: "", tax_rate: "0", notes: "" });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this purchase record? This cannot be undone.")) return;
    await api.deletePurchase(id);
    load();
  };

  return (
    <div>
      <div className="page-header">
        <h1>Purchases</h1>
        {purchases.length > 0 && (
          <button type="button" className="link-btn" onClick={() => exportPurchasesToExcel(purchases)}>
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
      {error && <p className="error">{error}</p>}

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
              <th>Amount</th><th>Tax</th><th>Total</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filteredPurchases.map((p) => (
              <tr key={p.id}>
                <td>{formatDate(p.purchase_date, dateFormat)}</td>
                <td>{p.vendor_name || "—"}</td>
                <td>{p.bill_number}</td>
                <td>{p.description}</td>
                <td>₹{formatMoney(p.amount)}</td>
                <td>₹{formatMoney(p.tax_amount)} {p.tax_rate ? `(${p.tax_rate}%)` : ""}</td>
                <td>₹{formatMoney(p.total)}</td>
                <td><button type="button" className="link-btn" onClick={() => handleDelete(p.id)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function exportPurchasesToExcel(purchases) {
  const rows = purchases.map((p) => ({
    Date: p.purchase_date, Vendor: p.vendor_name || "", "Bill #": p.bill_number || "",
    Description: p.description || "", Amount: Number(p.amount), "Tax Rate %": Number(p.tax_rate) || 0,
    "Tax Amount": Number(p.tax_amount), Total: Number(p.total),
  }));
  exportSheet("purchases.xlsx", "Purchases", rows);
}
