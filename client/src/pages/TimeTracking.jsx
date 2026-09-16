import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { formatMoney, formatDate } from "../lib/format";
import { useDateFormat } from "../lib/useDateFormat";

const todayStr = () => new Date().toISOString().slice(0, 10);

// A plain manual time log — log hours against a customer, then pull any
// still-unbilled entries onto an invoice as line items from the New Invoice
// page (see server/src/routes/time-entries.js). Deliberately just a date +
// hours entry, no start/stop timer widget, matching how the rest of
// BillItUp favors a quick form over a stateful one. Open to any logged-in
// role, same tier as recording a payment (2026-09-16).
export default function TimeTracking() {
  const [entries, setEntries] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({
    customer_id: "", project_name: "", description: "", entry_date: todayStr(), hours: "", rate: "",
  });
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const dateFormat = useDateFormat();

  const load = () => api.listTimeEntries().then(setEntries);
  useEffect(() => {
    load();
    api.listCustomers().then(setCustomers);
  }, []);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      (e.customer_name || "").toLowerCase().includes(q) ||
      (e.project_name || "").toLowerCase().includes(q) ||
      (e.description || "").toLowerCase().includes(q)
    );
  }, [entries, search]);

  const totals = useMemo(() => {
    return filteredEntries.reduce(
      (acc, e) => ({
        hours: acc.hours + Number(e.hours || 0),
        unbilledHours: acc.unbilledHours + (e.billed ? 0 : Number(e.hours || 0)),
        unbilledValue: acc.unbilledValue + (e.billed ? 0 : Number(e.hours || 0) * Number(e.rate || 0)),
      }),
      { hours: 0, unbilledHours: 0, unbilledValue: 0 }
    );
  }, [filteredEntries]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.entry_date || !form.hours) { setError("Date and hours are required"); return; }
    try {
      await api.createTimeEntry({ ...form, customer_id: form.customer_id || null, hours: Number(form.hours), rate: Number(form.rate) || 0 });
      setForm({ customer_id: "", project_name: "", description: "", entry_date: todayStr(), hours: "", rate: "" });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this time entry? This cannot be undone.")) return;
    try {
      await api.deleteTimeEntry(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Time Tracking</h1>
      </div>
      <p className="muted" style={{ marginTop: -8 }}>
        Log hours against a customer here, then add any unbilled entries onto their next invoice from the New
        Invoice page.
      </p>

      <form className="inline-form" onSubmit={handleSubmit}>
        <input type="date" value={form.entry_date} onChange={(e) => setForm({ ...form, entry_date: e.target.value })} required />
        <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })}>
          <option value="">Customer (optional)</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input placeholder="Project (optional)" value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} />
        <input placeholder="Description (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <input placeholder="Hours" type="number" step="0.25" min="0.01" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} required />
        <input placeholder="Rate (₹/hr)" type="number" step="0.01" min="0" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
        <button type="submit">Log time</button>
      </form>
      {error && <p className="error">{error}</p>}

      {entries.length > 0 && (
        <>
          <div className="stat-tiles" style={{ marginBottom: 16 }}>
            <div className="stat-tile">
              <span className="stat-label">Total Hours Logged</span>
              <span className="stat-value">{totals.hours.toFixed(2)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Unbilled Hours</span>
              <span className="stat-value">{totals.unbilledHours.toFixed(2)}</span>
            </div>
            <div className="stat-tile">
              <span className="stat-label">Unbilled Value</span>
              <span className="stat-value">₹{formatMoney(totals.unbilledValue)}</span>
            </div>
          </div>

          <div className="list-toolbar">
            <input
              type="search"
              placeholder="Search by customer, project, description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </>
      )}

      {entries.length === 0 && <p className="muted">No time logged yet.</p>}
      {filteredEntries.length === 0 && entries.length > 0 && (
        <p className="list-empty-filtered">No entries match your search.</p>
      )}

      {filteredEntries.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th><th>Customer</th><th>Project</th><th>Description</th>
              <th>Hours</th><th>Rate</th><th>Value</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((e) => (
              <tr key={e.id}>
                <td>{formatDate(e.entry_date, dateFormat)}</td>
                <td>{e.customer_name || "—"}</td>
                <td>{e.project_name}</td>
                <td>{e.description}</td>
                <td>{Number(e.hours).toFixed(2)}</td>
                <td>₹{formatMoney(e.rate)}</td>
                <td>₹{formatMoney(Number(e.hours) * Number(e.rate))}</td>
                <td>{e.billed ? "Billed" : "Unbilled"}</td>
                <td>{!e.billed && <button type="button" className="link-btn" onClick={() => handleDelete(e.id)}>Delete</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
