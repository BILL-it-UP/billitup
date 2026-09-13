import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { exportSheet } from "../lib/exportExcel";
import { INDIAN_STATES } from "../lib/gst";

// Vendors/suppliers a business buys from — the other side of Customers,
// kept as its own simple list so Purchases has someone to attach a bill to.
// Owner/Admin only, same sensitivity tier as Reports (see routes/vendors.js).
export default function Vendors() {
  const [vendors, setVendors] = useState([]);
  const [form, setForm] = useState({ name: "", phone: "", email: "", address: "", pincode: "", country: "India", gstin: "", state: "" });
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const load = () => api.listVendors().then(setVendors);
  useEffect(() => { load(); }, []);

  const filteredVendors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) =>
      (v.name || "").toLowerCase().includes(q) ||
      (v.phone || "").toLowerCase().includes(q) ||
      (v.email || "").toLowerCase().includes(q) ||
      (v.gstin || "").toLowerCase().includes(q)
    );
  }, [vendors, search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.createVendor(form);
      setForm({ name: "", phone: "", email: "", address: "", pincode: "", country: "India", gstin: "", state: "" });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Vendors</h1>
        {vendors.length > 0 && (
          <button type="button" className="link-btn" onClick={() => exportVendorsToExcel(vendors)}>
            Export to Excel
          </button>
        )}
      </div>

      <form className="inline-form" onSubmit={handleSubmit}>
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <textarea
          className="address-textarea"
          rows={2}
          placeholder="Address (building, street, area...)"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <input className="pincode-input" placeholder="PIN code" value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
        <input className="country-input" placeholder="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
        <input placeholder="GSTIN (optional)" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
        <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
          <option value="">State (optional)</option>
          {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="submit">Add vendor</button>
      </form>
      {error && <p className="error">{error}</p>}

      {vendors.length > 0 && (
        <div className="list-toolbar">
          <input
            type="search"
            placeholder="Search by name, phone, email, GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {vendors.length === 0 && <p className="muted">No vendors yet. Add one above to start logging purchases against them.</p>}
      {filteredVendors.length === 0 && vendors.length > 0 && (
        <p className="list-empty-filtered">No vendors match your search.</p>
      )}

      {filteredVendors.length > 0 && (
        <table className="table">
          <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th>GSTIN</th><th>State</th></tr></thead>
          <tbody>
            {filteredVendors.map((v) => (
              <tr key={v.id}>
                <td>{v.name}</td><td>{v.phone}</td><td>{v.email}</td>
                <td>{[v.address, v.pincode, v.country].filter(Boolean).join(", ")}</td>
                <td>{v.gstin}</td><td>{v.state}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function exportVendorsToExcel(vendors) {
  const rows = vendors.map((v) => ({
    Name: v.name, Phone: v.phone || "", Email: v.email || "",
    Address: v.address || "", "PIN Code": v.pincode || "", Country: v.country || "",
    GSTIN: v.gstin || "", State: v.state || "",
  }));
  exportSheet("vendors.xlsx", "Vendors", rows);
}
