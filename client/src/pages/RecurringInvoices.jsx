import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import { useDateFormat } from "../lib/useDateFormat";

const FREQUENCY_LABEL = { weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" };
const STATUS_LABEL = { active: "Active", paused: "Paused", ended: "Ended" };

export default function RecurringInvoices() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const dateFormat = useDateFormat();

  const load = () => api.listRecurringInvoices().then(setRows).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const toggleStatus = async (row) => {
    setBusyId(row.id);
    setError("");
    try {
      await api.setRecurringInvoiceStatus(row.id, row.status === "active" ? "paused" : "active");
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const generateNow = async (row) => {
    setBusyId(row.id);
    setError("");
    try {
      await api.generateRecurringInvoiceNow(row.id);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row) => {
    setBusyId(row.id);
    setError("");
    try {
      await api.deleteRecurringInvoice(row.id);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Recurring Invoices</h1>
        <Link className="btn" to="/recurring-invoices/new">+ New Recurring Invoice</Link>
      </div>
      <p className="muted">Set up an invoice once (e.g. a monthly retainer) and BillItUp raises it automatically on schedule — checked hourly, and generated as soon as the server is running once a date is due.</p>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading...</p>}
      {!loading && rows.length === 0 && <p className="muted">No recurring invoices set up yet.</p>}

      {rows.length > 0 && (
        <table className="table">
          <thead>
            <tr><th>Customer</th><th>Frequency</th><th>Next Invoice</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.customer_name || "—"}</td>
                <td>{FREQUENCY_LABEL[row.frequency] || row.frequency}{row.interval_count > 1 ? ` (every ${row.interval_count})` : ""}</td>
                <td>{row.status === "active" ? formatDate(row.next_invoice_date, dateFormat) : "—"}</td>
                <td><span className={`badge badge-${row.status === "active" ? "sent" : row.status === "ended" ? "draft" : "partially_paid"}`}>{STATUS_LABEL[row.status] || row.status}</span></td>
                <td>
                  {row.status !== "ended" && (
                    <>
                      <button type="button" className="link-btn" disabled={busyId === row.id} onClick={() => toggleStatus(row)}>
                        {row.status === "active" ? "Pause" : "Resume"}
                      </button>
                      {" · "}
                      <button type="button" className="link-btn" disabled={busyId === row.id} onClick={() => generateNow(row)}>Generate now</button>
                      {" · "}
                    </>
                  )}
                  <button type="button" className="link-btn" disabled={busyId === row.id} onClick={() => remove(row)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
