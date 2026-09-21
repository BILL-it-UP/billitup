import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, getUser } from "../lib/api";
import { emptyLine, lineAmount, computeTotals } from "../lib/lineItemMath";
import { formatMoney } from "../lib/format";
import ItemPicker from "../components/ItemPicker";
import TaxRateInput from "../components/TaxRateInput";
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

  const updateLine = (index, patch) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };
  const pickItem = (index, item) => {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        if (!item) return { ...line, item_id: "", item_name: "" };
        return {
          ...line,
          item_id: item.id,
          item_name: item.name,
          rate: item.rate,
          tax_rate: item.tax_rate,
          description: line.description || item.description || item.name,
        };
      })
    );
  };

  const handleItemCreated = (index, item) => {
    setItems((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)));
    pickItem(index, item);
  };
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (index) => setLines((prev) => prev.filter((_, i) => i !== index));
  const rawTotals = computeTotals(lines);
  const { subTotal, discountTotal, taxTotal } = rawTotals;
  const total = gstTreatment === "gst" ? rawTotals.total : subTotal - discountTotal;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    const payload = {
      customer_id: customerId || null,
      invoice_id: invoiceId || null,
      credit_note_date: creditNoteDate || null,
      reason: reason || null,
      // When credited against an invoice, leave this out so the server
      // reuses that invoice's own GST treatment instead of overriding it.
      gst_treatment: invoiceId ? undefined : gstTreatment,
      lineItems: lines.map((l) => ({ ...l, item_id: l.item_id || null })),
    };
    try {
      if (isEdit) {
        await api.updateCreditNote(id, payload);
        navigate(`/credit-notes/${id}`);
      } else {
        const creditNote = await api.createCreditNote(payload);
        navigate(`/credit-notes/${creditNote.id}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
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

        <table className="table line-item-table">
          <thead>
            <tr><th>Item &amp; Description</th><th>Qty</th><th>Rate</th><th>Discount</th><th>Tax %</th><th>Amount</th><th /></tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td className="line-item-details">
                  <ItemPicker
                    items={items}
                    itemId={line.item_id}
                    itemName={line.item_name}
                    description={line.description}
                    canManage={canManageItems}
                    onSelect={(item) => pickItem(i, item)}
                    onTextChange={(text) => updateLine(i, { item_id: "", item_name: text })}
                    onDescriptionChange={(text) => updateLine(i, { description: text })}
                    onItemCreated={(item) => handleItemCreated(i, item)}
                  />
                </td>
                <td><input type="number" step="0.01" className="num" value={line.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} /></td>
                <td><input type="number" step="0.01" className="num" value={line.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} /></td>
                <td><input type="number" step="0.01" className="num" value={line.discount} onChange={(e) => updateLine(i, { discount: e.target.value })} /></td>
                <td><TaxRateInput className="num" value={line.tax_rate} onChange={(v) => updateLine(i, { tax_rate: v })} /></td>
                <td className="num">₹{formatMoney(lineAmount(line))}</td>
                <td>{lines.length > 1 && <button type="button" className="link-btn" onClick={() => removeLine(i)}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="link-btn" onClick={addLine}>+ Add line</button>

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
    </div>
  );
}
