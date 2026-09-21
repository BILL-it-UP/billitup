import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, getUser } from "../lib/api";
import { emptyLine, computeTotals, isHeaderLine } from "../lib/lineItemMath";
import { formatMoney } from "../lib/format";
import LineItemsTable from "../components/LineItemsTable";
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
            line_type: li.line_type || "item",
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

  // Adds a freshly created item ("+ Add New Item" from inside the line item
  // table's own item picker) to the catalog this page already has loaded, so
  // it shows up as a match on every other line's search too, the same
  // pattern as NewInvoice.jsx's own addCatalogItem (2026-09-21).
  const addCatalogItem = (item) => {
    setItems((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)));
  };
  const rawTotals = computeTotals(lines);
  const { subTotal, discountTotal, taxTotal } = rawTotals;
  const total = gstTreatment === "gst" ? rawTotals.total : subTotal - discountTotal;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (lines.filter((l) => !isHeaderLine(l)).length === 0) {
      setError("Add at least one line item (a header alone is not enough).");
      return;
    }
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

        <LineItemsTable
          lines={lines}
          setLines={setLines}
          items={items}
          canManageItems={canManageItems}
          onItemCreated={addCatalogItem}
          symbol="₹"
        />

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
