import { useEffect, useMemo, useState } from "react";
import { api, getUser } from "../lib/api";
import { exportSheet } from "../lib/exportExcel";

export default function Items() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: "", unit: "pcs", rate: "", tax_rate: "0", hsn_sac_code: "" });
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const canManage = ["owner", "admin"].includes(getUser()?.role);

  const load = () => api.listItems().then(setItems);
  useEffect(() => { load(); }, []);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      (i.name || "").toLowerCase().includes(q) ||
      (i.hsn_sac_code || "").toLowerCase().includes(q)
    );
  }, [items, search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.createItem({ ...form, rate: Number(form.rate), tax_rate: Number(form.tax_rate) });
      setForm({ name: "", unit: "pcs", rate: "", tax_rate: "0", hsn_sac_code: "" });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Items</h1>
        {items.length > 0 && (
          <button type="button" className="link-btn" onClick={() => exportItemsToExcel(items)}>
            Export to Excel
          </button>
        )}
      </div>
      {canManage ? (
        <form className="inline-form" onSubmit={handleSubmit}>
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="Unit (pcs, hrs...)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          <input placeholder="Rate (₹)" type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} required />
          <input placeholder="Tax %" type="number" step="0.01" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} />
          <input placeholder="HSN/SAC (optional)" value={form.hsn_sac_code} onChange={(e) => setForm({ ...form, hsn_sac_code: e.target.value })} />
          <button type="submit">Add item</button>
        </form>
      ) : (
        <p className="muted">Ask an Owner or Admin to add or edit items.</p>
      )}
      {error && <p className="error">{error}</p>}

      {items.length > 0 && (
        <div className="list-toolbar">
          <input
            type="search"
            placeholder="Search by name or HSN/SAC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {filteredItems.length === 0 && items.length > 0 && (
        <p className="list-empty-filtered">No items match your search.</p>
      )}

      <table className="table">
        <thead>
          <tr><th>Name</th><th>Unit</th><th>Rate</th><th>Tax %</th><th>HSN/SAC</th></tr>
        </thead>
        <tbody>
          {filteredItems.map((i) => (
            <tr key={i.id}>
              <td>{i.name}</td><td>{i.unit}</td><td>₹{i.rate}</td><td>{i.tax_rate}%</td><td>{i.hsn_sac_code}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function exportItemsToExcel(items) {
  const rows = items.map((i) => ({
    Name: i.name,
    Unit: i.unit || "",
    Rate: Number(i.rate),
    "Tax %": Number(i.tax_rate) || 0,
    "HSN/SAC": i.hsn_sac_code || "",
  }));
  exportSheet("items.xlsx", "Items", rows);
}
