import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function Items() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: "", unit: "pcs", rate: "", tax_rate: "0", hsn_sac_code: "" });
  const [error, setError] = useState("");

  const load = () => api.listItems().then(setItems);
  useEffect(() => { load(); }, []);

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
      <h1>Items</h1>
      <form className="inline-form" onSubmit={handleSubmit}>
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input placeholder="Unit (pcs, hrs...)" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
        <input placeholder="Rate (₹)" type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} required />
        <input placeholder="Tax %" type="number" step="0.01" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} />
        <input placeholder="HSN/SAC (optional)" value={form.hsn_sac_code} onChange={(e) => setForm({ ...form, hsn_sac_code: e.target.value })} />
        <button type="submit">Add item</button>
      </form>
      {error && <p className="error">{error}</p>}

      <table className="table">
        <thead>
          <tr><th>Name</th><th>Unit</th><th>Rate</th><th>Tax %</th><th>HSN/SAC</th></tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>{i.name}</td><td>{i.unit}</td><td>₹{i.rate}</td><td>{i.tax_rate}%</td><td>{i.hsn_sac_code}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
