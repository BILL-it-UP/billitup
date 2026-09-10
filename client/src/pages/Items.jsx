import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function Items() {
  const [items, setItems] = useState([]);
  const [business, setBusiness] = useState(null);
  const [form, setForm] = useState({ name: "", unit: "pcs", rate: "", tax_rate: "0", hsn_sac_code: "", stock_qty: "", low_stock_threshold: "" });
  const [error, setError] = useState("");

  const load = () => api.listItems().then(setItems);
  useEffect(() => {
    load();
    api.getBusiness().then(setBusiness);
  }, []);

  const inventoryEnabled = !!business?.inventory_enabled;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.createItem({
        ...form,
        rate: Number(form.rate),
        tax_rate: Number(form.tax_rate),
        stock_qty: inventoryEnabled && form.stock_qty !== "" ? Number(form.stock_qty) : undefined,
        low_stock_threshold: inventoryEnabled && form.low_stock_threshold !== "" ? Number(form.low_stock_threshold) : undefined,
      });
      setForm({ name: "", unit: "pcs", rate: "", tax_rate: "0", hsn_sac_code: "", stock_qty: "", low_stock_threshold: "" });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h1>Items</h1>
      <form className="inline-form" onSubmit={handleSubmit}>
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input placeholder="Unit (pcs, kg...)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
        <input placeholder="Rate (₹)" type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} required />
        <input placeholder="Tax %" type="number" step="0.01" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} />
        <input placeholder="HSN/SAC (optional)" value={form.hsn_sac_code} onChange={(e) => setForm({ ...form, hsn_sac_code: e.target.value })} />
        {inventoryEnabled && (
          <>
            <input placeholder="Opening stock" type="number" step="0.01" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: e.target.value })} />
            <input placeholder="Low stock alert at" type="number" step="0.01" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} />
          </>
        )}
        <button type="submit">Add item</button>
      </form>
      {error && <p className="error">{error}</p>}

      <table className="table">
        <thead>
          <tr>
            <th>Name</th><th>Unit</th><th>Rate</th><th>Tax %</th><th>HSN/SAC</th>
            {inventoryEnabled && <th>Stock</th>}
            {inventoryEnabled && <th />}
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <ItemRow key={i.id} item={i} inventoryEnabled={inventoryEnabled} onChanged={load} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ItemRow({ item, inventoryEnabled, onChanged }) {
  const [adjusting, setAdjusting] = useState(false);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const isLowStock = item.stock_qty != null && item.low_stock_threshold != null && item.stock_qty <= item.low_stock_threshold;

  const handleAdjust = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.adjustItemStock(item.id, { delta: Number(delta), reason: reason || null });
      setDelta("");
      setReason("");
      setAdjusting(false);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <>
      <tr>
        <td>{item.name}</td><td>{item.unit}</td><td>₹{item.rate}</td><td>{item.tax_rate}%</td><td>{item.hsn_sac_code}</td>
        {inventoryEnabled && (
          <td>
            {item.stock_qty ?? "—"}
            {isLowStock && <span className="badge badge-overdue" style={{ marginLeft: 6 }}>Low stock</span>}
          </td>
        )}
        {inventoryEnabled && (
          <td><button type="button" className="link-btn" onClick={() => setAdjusting((v) => !v)}>Adjust stock</button></td>
        )}
      </tr>
      {inventoryEnabled && adjusting && (
        <tr>
          <td colSpan={7}>
            <form className="inline-form" onSubmit={handleAdjust}>
              <input type="number" step="0.01" placeholder="+10 or -2" value={delta} onChange={(e) => setDelta(e.target.value)} required />
              <input placeholder="Reason (restock, damage, correction...)" value={reason} onChange={(e) => setReason(e.target.value)} />
              <button type="submit">Save</button>
              {error && <span className="error">{error}</span>}
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
