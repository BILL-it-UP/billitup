import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { exportSheet } from "../lib/exportExcel";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "sent", label: "Sent" },
  { value: "paid", label: "Paid" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
];

// A filter popup in front of the plain "Export to Excel" button on the
// Invoices list (2026-09-15), so exporting doesn't mean handing an
// accountant every invoice ever raised when they only asked for one
// customer's last quarter. Filtering happens entirely over the invoices
// already loaded on the Dashboard page — no extra API call needed, the
// same list that feeds the on-screen search/status filter already has
// everything (see server/src/routes/invoices.js GET /, no pagination).
export default function ExportInvoicesModal({ invoices, onClose }) {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [customer, setCustomer] = useState("all");
  const [status, setStatus] = useState("all");
  const [exporting, setExporting] = useState(false);

  const customerNames = useMemo(() => {
    const names = new Set(invoices.map((inv) => inv.customer_name).filter(Boolean));
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [invoices]);

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      if (fromDate && inv.invoice_date < fromDate) return false;
      if (toDate && inv.invoice_date > toDate) return false;
      if (customer !== "all" && inv.customer_name !== customer) return false;
      if (status === "overdue") {
        if (!inv.is_overdue) return false;
      } else if (status !== "all" && inv.status !== status) {
        return false;
      }
      return true;
    });
  }, [invoices, fromDate, toDate, customer, status]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = filtered.map((inv) => ({
        "Invoice #": inv.invoice_number,
        Customer: inv.customer_name || "",
        "Invoice Date": inv.invoice_date,
        "Due Date": inv.due_date || "",
        Status: inv.status,
        Total: Number(inv.total),
        "Balance Due": Number(inv.balance_due),
      }));
      await exportSheet("invoices.xlsx", "Invoices", rows);
      onClose();
    } finally {
      setExporting(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Export to Excel</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div>
          <div className="form-row">
            <label className="block">
              From date
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </label>
            <label className="block">
              To date
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </label>
          </div>
          <div className="form-row">
            <label className="block">
              Customer
              <select value={customer} onChange={(e) => setCustomer(e.target.value)}>
                <option value="all">All customers</option>
                {customerNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            {filtered.length === 0
              ? "No invoices match these filters."
              : `${filtered.length} invoice${filtered.length === 1 ? "" : "s"} will be exported.`}
          </p>
          <div className="modal-actions">
            <button type="button" className="link-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" onClick={handleExport} disabled={exporting || filtered.length === 0}>
              {exporting ? "Exporting..." : "Export to Excel"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
