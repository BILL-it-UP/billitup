import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { emptyLine, lineAmount, computeTotals } from "../lib/lineItemMath";

export default function NewCreditNote() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [items, setItems] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listCustomers().then(setCustomers);
    api.listInvoices().then(setInvoices);
    api.listItems().then(setItems);
  }, []);

  // Only show invoices belonging to the selected customer, so it's not a
  // dropdown of every invoice the business has ever raised.
  const customerInvoices = useMemo(
    () => invoices.filter((inv) => String(inv.customer_id) === String(customerId)),
    [invoices, customerId]
  );

  const pickInvoice = (id) => {
    setInvoiceId(id);
    const invoice = invoices.find((inv) => String(inv.id) === String(id));
    if (invoice && !customerId) setCustomerId(invoice.customer_id || "");
  };

  const updateLine = (index, patch) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };
  const pickItem = (index, itemId) => {
    const item = items.find((i) => String(i.id) === String(itemId));
    if (!item) return updateLine(index, { item_id: "" });
    updateLine(index, { item_id: item.id, description: item.name, rate: item.rate, tax_rate: item.tax_rate });
  };
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (index) => setLines((prev) => prev.filter((_, i) => i !== index));
  const { subTotal, discountTotal, taxTotal, total } = computeTotals(lines);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const creditNote = await api.createCreditNote({
        customer_id: customerId || null,
        invoice_id: invoiceId || null,
        reason: reason || null,
        lineItems: lines.map((l) => ({ ...l, item_id: l.item_id || null })),
      });
      navigate(`/credit-notes/${creditNote.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1>New Credit Note</h1>
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
        <label className="block">Reason
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Returned goods, billing correction" />
        </label>

        <table className="table line-item-table">
          <thead>
            <tr><th>Item</th><th>Description</th><th>Qty</th><th>Rate</th><th>Discount</th><th>Tax %</th><th>Amount</th><th /></tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td>
                  <select value={line.item_id} onChange={(e) => pickItem(i, e.target.value)}>
                    <option value="">Custom</option>
                    {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                  </select>
                </td>
                <td><input value={line.description} onChange={(e) => updateLine(i, { description: e.target.value })} required /></td>
                <td><input type="number" step="0.01" className="num" value={line.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} /></td>
                <td><input type="number" step="0.01" className="num" value={line.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} /></td>
                <td><input type="number" step="0.01" className="num" value={line.discount} onChange={(e) => updateLine(i, { discount: e.target.value })} /></td>
                <td><input type="number" step="0.01" className="num" value={line.tax_rate} onChange={(e) => updateLine(i, { tax_rate: e.target.value })} /></td>
                <td className="num">₹{lineAmount(line).toFixed(2)}</td>
                <td>{lines.length > 1 && <button type="button" className="link-btn" onClick={() => removeLine(i)}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="link-btn" onClick={addLine}>+ Add line</button>

        <div className="totals-box">
          <div><span>Sub Total</span><span>₹{subTotal.toFixed(2)}</span></div>
          <div><span>Discount</span><span>-₹{discountTotal.toFixed(2)}</span></div>
          <div><span>Tax</span><span>₹{taxTotal.toFixed(2)}</span></div>
          <div className="grand-total"><span>Total Credit</span><span>₹{total.toFixed(2)}</span></div>
        </div>
        {invoiceId && <p className="muted">This amount will be deducted from that invoice's balance due.</p>}

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? "Saving..." : "Create Credit Note"}</button>
      </form>
    </div>
  );
}
