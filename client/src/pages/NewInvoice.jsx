import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

const emptyLine = () => ({ item_id: "", description: "", qty: 1, rate: 0, discount: 0, tax_rate: 0 });

export default function NewInvoice() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);
  const [customerId, setCustomerId] = useState("");
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
    updateLine(index, {
      item_id: item.id, description: item.name, rate: item.rate, tax_rate: item.tax_rate,
    });
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (index) => setLines((prev) => prev.filter((_, i) => i !== index));

  const lineAmount = (line) => {
    const base = Number(line.qty) * Number(line.rate) - Number(line.discount || 0);
    return base + base * (Number(line.tax_rate || 0) / 100);
  };
  const subTotal = lines.reduce((sum, l) => sum + Number(l.qty) * Number(l.rate), 0);
  const discountTotal = lines.reduce((sum, l) => sum + Number(l.discount || 0), 0);
  const taxTotal = lines.reduce((sum, l) => sum + (lineAmount(l) - (Number(l.qty) * Number(l.rate) - Number(l.discount || 0))), 0);
  const total = subTotal - discountTotal + taxTotal;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const invoice = await api.createInvoice({
        customer_id: customerId || null,
        lineItems: lines.map((l) => ({ ...l, item_id: l.item_id || null })),
      });
      navigate(`/invoices/${invoice.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1>New Invoice</h1>
      <form onSubmit={handleSubmit}>
        <label className="block">Customer
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">Walk-in / no customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
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
          <div className="grand-total"><span>Total</span><span>₹{total.toFixed(2)}</span></div>
        </div>

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving}>{saving ? "Saving..." : "Create Invoice"}</button>
      </form>
    </div>
  );
}
