import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatMoney, formatDateTime } from "../lib/format";
import ConfirmDialog from "../components/ConfirmDialog";

// One place to recover anything soft deleted across the app, or to finish
// the job with a real, permanent delete once you're sure. Every resource
// below shares the same three server calls (list the trash, restore, delete
// permanently — see server/src/db.js's deleted_at comment for the design),
// so this page is one small config table plus one generic table renderer
// rather than eight near-identical pages (2026-09-20).
const TABS = [
  {
    key: "items",
    label: "Items",
    list: () => api.listItemTrash(),
    restore: (id) => api.restoreItem(id),
    permanentDelete: (id) => api.permanentlyDeleteItem(id),
    nameOf: (row) => row.name,
    columns: [
      { header: "Name", render: (row) => row.name },
      { header: "Rate", render: (row) => `₹${formatMoney(row.rate)}` },
    ],
  },
  {
    key: "vendors",
    label: "Vendors",
    list: () => api.listVendorTrash(),
    restore: (id) => api.restoreVendor(id),
    permanentDelete: (id) => api.permanentlyDeleteVendor(id),
    nameOf: (row) => row.name,
    columns: [
      { header: "Name", render: (row) => row.name },
      { header: "Phone", render: (row) => row.phone || "—" },
      { header: "Email", render: (row) => row.email || "—" },
    ],
  },
  {
    key: "customers",
    label: "Customers",
    list: () => api.listCustomerTrash(),
    restore: (id) => api.restoreCustomer(id),
    permanentDelete: (id) => api.permanentlyDeleteCustomer(id),
    nameOf: (row) => row.name,
    columns: [
      { header: "Name", render: (row) => row.name },
      { header: "Phone", render: (row) => row.phone || "—" },
      { header: "Email", render: (row) => row.email || "—" },
    ],
  },
  {
    key: "quotes",
    label: "Quotes",
    list: () => api.listQuoteTrash(),
    restore: (id) => api.restoreQuote(id),
    permanentDelete: (id) => api.permanentlyDeleteQuote(id),
    nameOf: (row) => row.quote_number,
    columns: [
      { header: "Quote #", render: (row) => row.quote_number },
      { header: "Customer", render: (row) => row.customer_name || "—" },
      { header: "Total", render: (row) => `₹${formatMoney(row.total)}` },
    ],
  },
  {
    key: "credit_notes",
    label: "Credit Notes",
    list: () => api.listCreditNoteTrash(),
    restore: (id) => api.restoreCreditNote(id),
    permanentDelete: (id) => api.permanentlyDeleteCreditNote(id),
    nameOf: (row) => row.credit_note_number,
    columns: [
      { header: "Credit Note #", render: (row) => row.credit_note_number },
      { header: "Customer", render: (row) => row.customer_name || "—" },
      { header: "Against Invoice", render: (row) => row.invoice_number || "—" },
      { header: "Total", render: (row) => `₹${formatMoney(row.total)}` },
    ],
    restoreNote: (row) =>
      row.invoice_number
        ? `Restoring this moves ₹${formatMoney(row.total)} back off invoice ${row.invoice_number}'s balance due.`
        : null,
  },
  {
    key: "purchases",
    label: "Purchases",
    list: () => api.listPurchaseTrash(),
    restore: (id) => api.restorePurchase(id),
    permanentDelete: (id) => api.permanentlyDeletePurchase(id),
    nameOf: (row) => row.bill_number || `Purchase #${row.id}`,
    columns: [
      { header: "Vendor", render: (row) => row.vendor_name || "—" },
      { header: "Bill #", render: (row) => row.bill_number || "—" },
      { header: "Amount", render: (row) => `₹${formatMoney(row.amount)}` },
    ],
  },
  {
    key: "invoices",
    label: "Invoices",
    list: () => api.listInvoiceTrash(),
    restore: (id) => api.restoreInvoice(id),
    permanentDelete: (id) => api.permanentlyDeleteInvoice(id),
    nameOf: (row) => row.invoice_number,
    columns: [
      { header: "Invoice #", render: (row) => row.invoice_number },
      { header: "Customer", render: (row) => row.customer_name || "—" },
      { header: "Total", render: (row) => `₹${formatMoney(row.total)}` },
    ],
    permanentNote: "Deleting an invoice permanently also unwinds anything it affected — retainer credit, time entries or purchases marked billed, and any linked quote or recurring profile. This cannot be undone.",
  },
  {
    key: "recurring_invoices",
    label: "Recurring Invoices",
    list: () => api.listRecurringInvoiceTrash(),
    restore: (id) => api.restoreRecurringInvoice(id),
    permanentDelete: (id) => api.permanentlyDeleteRecurringInvoice(id),
    nameOf: (row) => `${row.customer_name || "this customer"}'s recurring profile`,
    columns: [
      { header: "Customer", render: (row) => row.customer_name || "—" },
      { header: "Frequency", render: (row) => row.frequency },
    ],
  },
];

export default function Trash() {
  const [activeKey, setActiveKey] = useState(TABS[0].key);
  const [rowsByTab, setRowsByTab] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [permanentTarget, setPermanentTarget] = useState(null); // { tab, row }

  const tab = useMemo(() => TABS.find((t) => t.key === activeKey), [activeKey]);
  const rows = rowsByTab[activeKey] || [];

  // Every tab's count is loaded up front so the tab strip can show how many
  // items are waiting in each one, not just the tab currently open.
  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all(TABS.map((t) => t.list().then((rows) => [t.key, rows])))
      .then((pairs) => setRowsByTab(Object.fromEntries(pairs)))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const restore = async (row) => {
    setBusyId(row.id);
    setError("");
    try {
      await tab.restore(row.id);
      setRowsByTab((prev) => ({ ...prev, [tab.key]: prev[tab.key].filter((r) => r.id !== row.id) }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const confirmPermanentDelete = async () => {
    if (!permanentTarget) return;
    const { tab: targetTab, row } = permanentTarget;
    setBusyId(row.id);
    setError("");
    try {
      await targetTab.permanentDelete(row.id);
      setRowsByTab((prev) => ({ ...prev, [targetTab.key]: prev[targetTab.key].filter((r) => r.id !== row.id) }));
      setPermanentTarget(null);
    } catch (err) {
      setError(err.message);
      setPermanentTarget(null);
    } finally {
      setBusyId(null);
    }
  };

  const totalCount = TABS.reduce((sum, t) => sum + (rowsByTab[t.key]?.length || 0), 0);

  return (
    <div>
      <div className="page-header">
        <h1>Trash</h1>
      </div>
      <p className="muted">
        Anything deleted across BillItUp lands here first instead of vanishing outright. Restore a row any time, or
        delete it permanently once you're sure, permanent deletes cannot be undone.
      </p>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading...</p>}

      {!loading && (
        <>
          <div className="list-toolbar" style={{ flexWrap: "wrap" }}>
            {TABS.map((t) => {
              const count = rowsByTab[t.key]?.length || 0;
              return (
                <button
                  key={t.key}
                  type="button"
                  className={`link-btn${activeKey === t.key ? " active" : ""}`}
                  style={activeKey === t.key ? { fontWeight: 600, textDecoration: "underline" } : undefined}
                  onClick={() => setActiveKey(t.key)}
                >
                  {t.label}{count > 0 ? ` (${count})` : ""}
                </button>
              );
            })}
          </div>

          {totalCount === 0 && <p className="muted">Trash is empty across every resource. Nothing to restore or clean up.</p>}

          {totalCount > 0 && rows.length === 0 && <p className="muted">No {tab.label.toLowerCase()} in Trash.</p>}

          {rows.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  {tab.columns.map((col) => <th key={col.header}>{col.header}</th>)}
                  <th>Deleted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    {tab.columns.map((col) => <td key={col.header}>{col.render(row)}</td>)}
                    <td>{formatDateTime(row.deleted_at)}</td>
                    <td>
                      <button type="button" className="link-btn" disabled={busyId === row.id} onClick={() => restore(row)}>
                        {busyId === row.id ? "Restoring..." : "Restore"}
                      </button>
                      {" · "}
                      <button type="button" className="link-btn" disabled={busyId === row.id} onClick={() => setPermanentTarget({ tab, row })}>
                        Delete Permanently
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      {permanentTarget && (
        <ConfirmDialog
          title="Delete this permanently?"
          message={
            <div>
              <p className="muted">
                {permanentTarget.tab.nameOf(permanentTarget.row)} will be removed for good, this cannot be undone.
              </p>
              {permanentTarget.tab.permanentNote && <p className="muted">{permanentTarget.tab.permanentNote}</p>}
            </div>
          }
          confirmLabel="Delete Permanently"
          danger
          busy={busyId === permanentTarget.row.id}
          onConfirm={confirmPermanentDelete}
          onCancel={() => setPermanentTarget(null)}
        />
      )}

      <p className="muted" style={{ marginTop: 24 }}>
        Looking for something specific? Check <Link to="/quotes">Quotes</Link>, <Link to="/credit-notes">Credit Notes</Link>,{" "}
        <Link to="/">Invoices</Link>, <Link to="/customers">Customers</Link>, <Link to="/items">Items</Link>,{" "}
        <Link to="/vendors">Vendors</Link>, <Link to="/purchases">Purchases</Link> or{" "}
        <Link to="/recurring-invoices">Recurring Invoices</Link> for anything still active.
      </p>
    </div>
  );
}
