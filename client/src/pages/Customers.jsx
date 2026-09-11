import { useEffect, useState } from "react";
import { api, getUser } from "../lib/api";
import { exportSheet } from "../lib/exportExcel";

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({ name: "", phone: "", email: "", billing_address: "", gstin: "" });
  const [error, setError] = useState("");
  const canManage = ["owner", "admin"].includes(getUser()?.role);

  const load = () => api.listCustomers().then(setCustomers);
  useEffect(() => { load(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.createCustomer(form);
      setForm({ name: "", phone: "", email: "", billing_address: "", gstin: "" });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Customers</h1>
        {customers.length > 0 && (
          <button type="button" className="link-btn" onClick={() => exportCustomersToExcel(customers)}>
            Export to Excel
          </button>
        )}
      </div>
      {canManage ? (
        <form className="inline-form" onSubmit={handleSubmit}>
          <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input placeholder="Billing address" value={form.billing_address} onChange={(e) => setForm({ ...form, billing_address: e.target.value })} />
          <input placeholder="GSTIN (optional)" value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
          <button type="submit">Add customer</button>
        </form>
      ) : (
        <p className="muted">Ask an Owner or Admin to add or edit customers.</p>
      )}
      {error && <p className="error">{error}</p>}

      <table className="table">
        <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>GSTIN</th></tr></thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}><td>{c.name}</td><td>{c.phone}</td><td>{c.email}</td><td>{c.gstin}</td></tr>
          ))}
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
    "Billing Address": c.billing_address || "",
    GSTIN: c.gstin || "",
  }));
  exportSheet("customers.xlsx", "Customers", rows);
}
