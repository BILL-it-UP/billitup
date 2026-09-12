import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, getUser } from "../lib/api";
import { emptyLine, lineAmount, computeTotals } from "../lib/lineItemMath";
import { formatMoney } from "../lib/format";
import ItemPicker from "../components/ItemPicker";

export default function NewInvoice() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const canManageItems = ["owner", "admin"].includes(getUser()?.role);
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [reference, setReference] = useState("");
  const [subject, setSubject] = useState("");
  const [gstin, setGstin] = useState("");
  const [terms, setTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingInvoice, setLoadingInvoice] = useState(isEdit);

  useEffect(() => {
    api.listCustomers().then(setCustomers);
    api.listItems().then(setItems);
  }, []);

  // Edit mode: load the existing invoice and prefill every field. Runs once
  // per invoice id — re-picking items below (once the catalog loads) is a
  // separate effect so this one doesn't need to wait on that.
  useEffect(() => {
    if (!isEdit) return;
    setLoadingInvoice(true);
    api.getInvoice(id).then((inv) => {
      setCustomerId(inv.customer_id || "");
      setInvoiceDate(inv.invoice_date || "");
      setDueDate(inv.due_date || "");
      setReference(inv.reference || "");
      setSubject(inv.subject || "");
      setGstin(inv.gstin || "");
      setTerms(inv.terms || "");
      setNotes(inv.notes || "");
      setLines(
        (inv.lineItems || []).map((li) => ({
          item_id: li.item_id || "",
          item_name: "", // resolved once the item catalog loads, see below
          description: li.description || "",
          qty: li.qty,
          rate: li.rate,
          discount: li.discount,
          tax_rate: li.tax_rate,
        }))
      );
      setLoadingInvoice(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // An invoice line only stores item_id + description, never the item's own
  // name — so once the catalog is loaded, look up each locked line's name by
  // its item_id purely so the ItemPicker has something to display.
  useEffect(() => {
    if (items.length === 0) return;
    setLines((prev) =>
      prev.map((line) => {
        if (!line.item_id || line.item_name) return line;
        const match = items.find((it) => String(it.id) === String(line.item_id));
        return match ? { ...line, item_name: match.name } : line;
      })
    );
  }, [items]);

  const pickCustomer = (id) => {
    setCustomerId(id);
    const customer = customers.find((c) => String(c.id) === String(id));
    setGstin(customer?.gstin || "");
  };

  const updateLine = (index, patch) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  // Selecting an item from the picker fills in its rate/tax and — only if the
  // description is still blank — its description too, so re-picking an item
  // never clobbers text the user already typed for this line.
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
  const { subTotal, discountTotal, taxTotal, total } = computeTotals(lines);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = {
        customer_id: customerId || null,
        invoice_date: invoiceDate || null,
        due_date: dueDate || null,
        reference: reference || null,
        subject: subject || null,
        gstin: gstin || null,
        terms: terms || null,
        notes: notes || null,
        lineItems: lines.map((l) => ({ ...l, item_id: l.item_id || null })),
      };
      if (isEdit) {
        await api.updateInvoice(id, payload);
        navigate(`/invoices/${id}`);
      } else {
        const invoice = await api.createInvoice(payload);
        navigate(`/invoices/${invoice.id}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loadingInvoice) return <p className="muted">Loading...</p>;

  return (
    <div>
      <h1>{isEdit ? "Edit Invoice" : "New Invoice"}</h1>
      {isEdit && (
        <p className="muted">
          Saving will recalculate this invoice's total. The previous version is kept — see Edit History on the
          invoice once you're done.
        </p>
      )}
      <form onSubmit={handleSubmit}>
        <div className="form-row">
          <label className="block">Customer
            <select value={customerId} onChange={(e) => pickCustomer(e.target.value)}>
              <option value="">Walk-in / no customer</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block">Invoice date
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
          </label>
          <label className="block">Due date (optional)
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="block">PO / Reference number (optional)
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. PO-4021" />
          </label>
        </div>
        <div className="form-row">
          <label className="block">GST Number (optional)
            <input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="Defaults from the customer's GSTIN" />
          </label>
          <label className="block" style={{ flex: 2 }}>Subject (optional)
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Let your customer know what this invoice is for" />
          </label>
        </div>

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
          <div className="grand-total"><span>Total</span><span>₹{formatMoney(total)}</span></div>
        </div>

        <label className="block">Terms (optional)
          <input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. Net 15" />
        </label>
        <label className="block">Notes (optional, shown on the invoice)
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Invoice"}
        </button>
      </form>
    </div>
  );
}
