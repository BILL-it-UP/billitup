import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, getUser } from "../lib/api";
import { emptyLine, computeTotals, isHeaderLine } from "../lib/lineItemMath";
import { formatMoney } from "../lib/format";
import LineItemsTable from "../components/LineItemsTable";
import UnsavedChangesGuard from "../components/UnsavedChangesGuard";
import { useDirtyGuard } from "../lib/useDirtyGuard";
import { GST_TREATMENTS } from "../lib/gst";

export default function NewCreditNote() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const canManageItems = ["owner", "admin"].includes(getUser()?.role);
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [items, setItems] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [creditNoteDate, setCreditNoteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [gstTreatment, setGstTreatment] = useState("gst");
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingCreditNote, setLoadingCreditNote] = useState(isEdit);

  useEffect(() => {
    api.listCustomers().then(setCustomers);
    api.listInvoices().then(setInvoices);
    api.listItems().then(setItems);
  }, []);

  // Edit mode: load the existing credit note and prefill every field, same
  // pattern as NewInvoice.jsx's own edit mode (2026-09-20).
  useEffect(() => {
    if (!isEdit) return;
    setLoadingCreditNote(true);
    api.getCreditNote(id).then((cn) => {
      setCustomerId(cn.customer_id || "");
      setInvoiceId(cn.invoice_id || "");
      setCreditNoteDate(cn.credit_note_date || "");
      setReason(cn.reason || "");
      setGstTreatment(cn.gst_treatment || "gst");
      setLines(
        (cn.lineItems || []).map((li) => {
          const match = li.item_id ? items.find((it) => String(it.id) === String(li.item_id)) : null;
          return {
            line_type: li.line_type || "item",
            item_id: li.item_id || "",
            item_name: match ? match.name : "",
            description: li.description || "",
            qty: li.qty, rate: li.rate, discount: li.discount, tax_rate: li.tax_rate,
          };
        })
      );
      setLoadingCreditNote(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Once the item catalog itself loads, backfill any line's item_name that
  // couldn't be resolved yet above.
  useEffect(() => {
    if (!isEdit || items.length === 0) return;
    setLines((prev) =>
      prev.map((line) => {
        if (!line.item_id || line.item_name) return line;
        const match = items.find((it) => String(it.id) === String(line.item_id));
        return match ? { ...line, item_name: match.name } : line;
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Only show invoices belonging to the selected customer, so it's not a
  // dropdown of every invoice the business has ever raised. In edit mode the
  // credit note's own current invoice is always included too, even once a
  // different customer is picked, so switching customers doesn't silently
  // drop it from the list before the change is saved.
  const customerInvoices = useMemo(() => {
    const forCustomer = invoices.filter((inv) => String(inv.customer_id) === String(customerId));
    if (invoiceId && !forCustomer.some((inv) => String(inv.id) === String(invoiceId))) {
      const current = invoices.find((inv) => String(inv.id) === String(invoiceId));
      if (current) return [current, ...forCustomer];
    }
    return forCustomer;
  }, [invoices, customerId, invoiceId]);

  const pickInvoice = (newId) => {
    setInvoiceId(newId);
    const invoice = invoices.find((inv) => String(inv.id) === String(newId));
    if (invoice && !customerId) setCustomerId(invoice.customer_id || "");
    if (invoice?.gst_treatment) setGstTreatment(invoice.gst_treatment);
  };

  // Adds a freshly created item ("+ Add New Item" from inside the line item
  // table's own item picker) to the catalog this page already has loaded, so
  // it shows up as a match on every other line's search too, the same
  // pattern as NewInvoice.jsx's own addCatalogItem (2026-09-21).
  const addCatalogItem = (item) => {
    setItems((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)));
  };
  // See NewInvoice.jsx's matching comment: updates the shared catalog only,
  // never this or any other line's own already-typed fields (2026-09-21).
  const updateCatalogItem = (item) => {
    setItems((prev) => prev.map((it) => (String(it.id) === String(item.id) ? item : it)).sort((a, b) => a.name.localeCompare(b.name)));
  };
  const rawTotals = computeTotals(lines);
  const { subTotal, discountTotal, taxTotal } = rawTotals;
  const total = gstTreatment === "gst" ? rawTotals.total : subTotal - discountTotal;

  const buildPayload = () => ({
    customer_id: customerId || null,
    invoice_id: invoiceId || null,
    credit_note_date: creditNoteDate || null,
    reason: reason || null,
    // When credited against an invoice, leave this out so the server
    // reuses that invoice's own GST treatment instead of overriding it.
    gst_treatment: invoiceId ? undefined : gstTreatment,
    lineItems: lines.map((l) => ({ ...l, item_id: l.item_id || null })),
  });

  // buildPayload doubles as the unsaved-changes guard's own dirty-check
  // snapshot, see useDirtyGuard's comment (2026-09-21).
  const { isDirty, markClean } = useDirtyGuard(buildPayload, !loadingCreditNote);

  const validate = () => {
    if (lines.filter((l) => !isHeaderLine(l)).length === 0) {
      return "Add at least one line item (a header alone is not enough).";
    }
    return "";
  };

  const performSave = async () => {
    if (isEdit) {
      await api.updateCreditNote(id, buildPayload());
      return null;
    }
    return api.createCreditNote(buildPayload());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setSaving(true);
    try {
      const creditNote = await performSave();
      markClean();
      navigate(isEdit ? `/credit-notes/${id}` : `/credit-notes/${creditNote.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Used by the unsaved-changes prompt's "Save & Leave" button: the same
  // save, but it never navigates to the credit note's own view page, since
  // Save & Leave should land wherever the user was actually trying to go
  // (2026-09-21).
  const handleSaveAndLeave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      throw new Error(validationError);
    }
    setError("");
    await performSave();
    markClean();
  };

  if (loadingCreditNote) return <p className="muted">Loading...</p>;

  return (
    <div>
      <h1>{isEdit ? "Edit Credit Note" : "New Credit Note"}</h1>
      <form onSubmit={handleSubmit}>
        <label className="block">Customer
          <select value={customerId} onChange={(e) => { setCustomerId(e.target.value); setInvoiceId(""); }}>
            <option value="">Select a customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block">Against invoice (optional — leave blank for a standalone credit)
          <select value={invoiceId} onChange={(e) => pickInvoice(e.target.value)}>
            <option value="">No invoice</option>
            {customerInvoices.map((inv) => (
              <option key={inv.id} value={inv.id}>{inv.invoice_number} — ₹{Number(inv.total).toFixed(2)}</option>
            ))}
          </select>
        </label>
        <div className="form-row">
          <label className="block">Credit note date
            <input type="date" value={creditNoteDate} onChange={(e) => setCreditNoteDate(e.target.value)} required />
          </label>
          <label className="block">Reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Returned goods, billing correction" />
          </label>
        </div>
        {!invoiceId && (
          <label className="block">GST Treatment
            <select value={gstTreatment} onChange={(e) => setGstTreatment(e.target.value)}>
              {GST_TREATMENTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
        )}
        {invoiceId && <p className="muted">GST treatment follows the invoice this credit note is against.</p>}

        <LineItemsTable
          lines={lines}
          setLines={setLines}
          items={items}
          canManageItems={canManageItems}
          onItemCreated={addCatalogItem}
          onItemUpdated={updateCatalogItem}
          symbol="₹"
        />

        <div className="totals-box">
          <div><span>Sub Total</span><span>₹{formatMoney(subTotal)}</span></div>
          <div><span>Discount</span><span>-₹{formatMoney(discountTotal)}</span></div>
          <div><span>Tax</span><span>₹{formatMoney(gstTreatment === "none" ? 0 : taxTotal)}</span></div>
          <div className="grand-total"><span>Total Credit</span><span>₹{formatMoney(total)}</span></div>
        </div>
        {invoiceId && (
          <p className="muted">
            {isEdit
              ? "Changing this amount or the invoice it's against updates that invoice's balance due to match."
              : "This amount will be deducted from that invoice's balance due."}
          </p>
        )}

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? "Saving..." : isEdit ? "Save Changes" : "Create Credit Note"}</button>
      </form>
      <UnsavedChangesGuard isDirty={isDirty} onSaveAndLeave={handleSaveAndLeave} />
    </div>
  );
}
