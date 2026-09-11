import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { emptyLine, lineAmount, computeTotals } from "../lib/lineItemMath";
import { formatMoney } from "../lib/format";

const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export default function NewRecurringInvoice() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [intervalCount, setIntervalCount] = useState(1);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [dueInDays, setDueInDays] = useState("15");
  const [reference, setReference] = useState("");
  const [terms, setTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.listCustomers().then(setCustomers);
    api.listItems().then(setItems);
  }, []);

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
      await api.createRecurringInvoice({
        customer_id: customerId || null,
        frequency, interval_count: Number(intervalCount) || 1,
        start_date: startDate, end_date: endDate || null,
        due_in_days: dueInDays === "" ? null : Number(dueInDays),
        reference: reference || null, terms: terms || null, notes: notes || null,
        lineItems: lines.map((l) => ({ ...l, item_id: l.item_id || null })),
      });
      navigate("/recurring-invoices");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1>New Recurring Invoice</h1>
      <form onSubmit={handleSubmit}>
        <label className="block">Customer
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            <option value="">Select a customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>

        <div className="form-row">
          <label className="block">Repeats
            <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
          <label className="block">Every
            <input type="number" min="1" value={intervalCount} onChange={(e) => setIntervalCount(e.target.value)} />
          </label>
          <label className="block">Due (days after invoice date)
            <input type="number" min="0" value={dueInDays} onChange={(e) => setDueInDays(e.target.value)} />
          </label>
        </div>
        <div className="form-row">
          <label className="block">First invoice date
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </label>
          <label className="block">Ends on (optional)
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </label>
          <label className="block">PO / Reference number (optional)
            <input value={reference} onChange={(e) => setReference(e.target.value)} />
          </label>
        </div>

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
                <td><textarea rows={2} value={line.description} onChange={(e) => updateLine(i, { description: e.target.value })} placeholder="Add a line break to list multiple items under one line" required /></td>
                <td><input type="number" step="0.01" className="num" value={line.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} /></td>
                <td><input type="number" step="0.01" className="num" value={line.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} /></td>
                <td><input type="number" step="0.01" className="num" value={line.discount} onChange={(e) => updateLine(i, { discount: e.target.value })} /></td>
                <td><input type="number" step="0.01" className="num" value={line.tax_rate} onChange={(e) => updateLine(i, { tax_rate: e.target.value })} /></td>
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
          <div><span>Tax</span><span>₹{formatMoney(taxTotal)}</span></div>
          <div className="grand-total"><span>Total per invoice</span><span>₹{formatMoney(total)}</span></div>
        </div>

        <label className="block">Terms (optional)
          <input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. Net 15" />
        </label>
        <label className="block">Notes (optional, shown on each generated invoice)
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? "Saving..." : "Create Recurring Invoice"}</button>
      </form>
    </div>
  );
}
