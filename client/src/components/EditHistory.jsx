import { Fragment, useState } from "react";
import { api } from "../lib/api";
import { formatMoney, formatDateTime } from "../lib/format";

// Shows every edit made to this invoice's line items (see PUT /api/invoices/:id
// on the server, which snapshots the previous version before overwriting it) —
// who changed it, when, and the total before/after, with each row expandable
// to see exactly what the previous version's line items said. Collapsed
// behind a button until clicked, same pattern as "Show recent login
// activity" in Settings, so it doesn't clutter every invoice that's never
// been edited.
export default function EditHistory({ invoiceId }) {
  const [history, setHistory] = useState(null); // null = not loaded yet
  const [expandedId, setExpandedId] = useState(null);
  const [error, setError] = useState("");

  const load = () => api.getInvoiceHistory(invoiceId).then(setHistory).catch((err) => setError(err.message));

  return (
    <div className="no-print" style={{ marginTop: 16 }}>
      {history === null && (
        <button type="button" className="link-btn" onClick={load}>Show edit history</button>
      )}
      {error && <p className="error">{error}</p>}
      {history !== null && history.length === 0 && (
        <p className="muted">No edits recorded for this invoice yet.</p>
      )}
      {history !== null && history.length > 0 && (
        <>
          <h3>Edit History</h3>
          <table className="table">
            <thead><tr><th>Edited</th><th>By</th><th>Total before</th><th>Total after</th><th /></tr></thead>
            <tbody>
              {history.map((h) => (
                <Fragment key={h.id}>
                  <tr>
                    <td>{formatDateTime(h.created_at)}</td>
                    <td>{h.edited_by_name || "—"}</td>
                    <td>₹{formatMoney(h.previous_total)}</td>
                    <td>₹{formatMoney(h.new_total)}</td>
                    <td>
                      <button type="button" className="link-btn" onClick={() => setExpandedId(expandedId === h.id ? null : h.id)}>
                        {expandedId === h.id ? "Hide" : "View previous version"}
                      </button>
                    </td>
                  </tr>
                  {expandedId === h.id && (
                    <tr>
                      <td colSpan={5}>
                        <table className="table">
                          <thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
                          <tbody>
                            {h.snapshot.lineItems.map((li, idx) => (
                              <tr key={idx}>
                                <td>{li.description}</td>
                                <td>{formatMoney(li.qty)}</td>
                                <td>₹{formatMoney(li.rate)}</td>
                                <td>₹{formatMoney(li.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
