import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, getUser } from "../lib/api";
import { emptyLine, lineAmount, computeTotals } from "../lib/lineItemMath";
import { formatMoney } from "../lib/format";
import ItemPicker from "../components/ItemPicker";
import TaxRateInput from "../components/TaxRateInput";
import { GST_TREATMENTS } from "../lib/gst";

export default function NewQuote() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const canManageItems = ["owner", "admin"].includes(getUser()?.role);
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [quoteDate, setQuoteDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expiryDate, setExpiryDate] = useState("");
  const [reference, setReference] = useState("");
  const [gstTreatment, setGstTreatment] = useState("gst");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingQuote, setLoadingQuote] = useState(isEdit);

  useEffect(() => {
    api.listCustomers().then(setCustomers);
    api.listItems().then(setItems);
  }, []);

  // Edit mode: load the existing quote and prefill every field, same pattern
  // as NewInvoice.jsx's own edit mode (2026-09-20).
  useEffect(() => {
    if (!isEdit) return;
    setLoadingQuote(true);
    api.getQuote(id).then((q) => {
      setCustomerId(q.customer_id || "");
      setQuoteDate(q.quote_date || "");
      setExpiryDate(q.expiry_date || "");
      setReference(q.reference || "");
      setGstTreatment(q.gst_treatment || "gst");
      setNotes(q.notes || "");
      setLines(
        (q.lineItems || []).map((li) => {
          const match = li.item_id ? items.find((it) => String(it.id) === String(li.item_id)) : null;
          return {
            item_id: li.item_id || "",
            item_name: match ? match.name : "",
            description: li.description || "",
            qty: li.qty, rate: li.rate, discount: li.discount, tax_rate: li.tax_rate,
          };
        })
      );
      setLoadingQuote(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Once the item catalog itself loads, backfill any line's item_name that
  // couldn't be resolved yet above (items hadn't loaded at that point).
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
      quote_date: quoteDate || null,
      expiry_date: expiryDate || null,
      reference: reference || null,
      gst_treatment: gstTreatment,
      notes: notes || null,
      lineItems: lines.map((l) => ({ ...l, item_id: l.item_id || null })),
    };
    try {
      if (isEdit) {
        await api.updateQuote(id, payload);
        navigate(`/quotes/${id}`);
      } else {
        const quote = await api.createQuote(payload);
        navigate(`/quotes/${quote.id}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loadingQuote) return <p className="muted">Loading...</p>;

  return (
    <div>
      <h1>{isEdit ? "Edit Quote" : "New Quote"}</h1>
      <form onSubmit={handleSubmit}>
        <label className="block">Customer
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Select a customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="form-row">
          <label className="block">Quote date
            <input type="date" value={quoteDate} onChange={(e) => setQuoteDate(e.target.value)} required />
          </label>
          <label className="block">Valid until (optional)
            <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </label>
          <label className="block">PO / Reference number (optional)
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. PO-4021" />
          </label>
          <label className="block">GST Treatment
            <select value={gstTreatment} onChange={(e) => setGstTreatment(e.target.value)}>
              {GST_TREATMENTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
        </div>
        {gstTreatment === "rcm" && (
          <p className="muted">
            Reverse charge: the tax below is shown for your customer's own GST filing, but is not added to what
            they owe you.
          </p>
        )}
        {gstTreatment === "none" && <p className="muted">No GST will be added to this quote.</p>}

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
          <div><span>{gstTreatment === "rcm" ? "Tax (reverse charge)" : "Tax"}</span><span>₹{formatMoney(gstTreatment === "none" ? 0 : taxTotal)}</span></div>
          <div className="grand-total"><span>Total</span><span>₹{formatMoney(total)}</span></div>
        </div>

        <label className="block">Notes (optional, shown on the quote)
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? "Saving..." : isEdit ? "Save Changes" : "Create Quote"}</button>
      </form>
    </div>
  );
}
