import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, getUser } from "../lib/api";
import { emptyLine, lineAmount, computeTotals } from "../lib/lineItemMath";
import { formatMoney } from "../lib/format";
import ItemPicker from "../components/ItemPicker";
import CustomerPicker from "../components/CustomerPicker";
import TaxRateInput from "../components/TaxRateInput";
import { GST_TREATMENTS } from "../lib/gst";

export default function NewInvoice() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);
  const canManageItems = ["owner", "admin"].includes(getUser()?.role);
  const [customers, setCustomers] = useState([]);
  const [items, setItems] = useState([]);
  const [business, setBusiness] = useState(null);
  const isPremium = business?.plan === "premium";
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [reference, setReference] = useState("");
  const [subject, setSubject] = useState("");
  const [gstin, setGstin] = useState("");
  const [gstTreatment, setGstTreatment] = useState("gst");
  const [terms, setTerms] = useState("");
  const [notes, setNotes] = useState("");
  const [ewayBillNumber, setEwayBillNumber] = useState("");
  const [ewayTransporterName, setEwayTransporterName] = useState("");
  const [ewayTransporterId, setEwayTransporterId] = useState("");
  const [ewayVehicleNumber, setEwayVehicleNumber] = useState("");
  const [ewayDistanceKm, setEwayDistanceKm] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingInvoice, setLoadingInvoice] = useState(isEdit);

  useEffect(() => {
    api.listCustomers().then(setCustomers);
    api.listItems().then(setItems);
    api.getBusiness().then(setBusiness);
  }, []);

  // Edit mode: load the existing invoice and prefill every field. Runs once
  // per invoice id — re-picking items below (once the catalog loads) is a
  // separate effect so this one doesn't need to wait on that.
  useEffect(() => {
    if (!isEdit) return;
    setLoadingInvoice(true);
    api.getInvoice(id).then((inv) => {
      setCustomerId(inv.customer_id || "");
      setCustomerName(inv.customer?.name || "");
      setInvoiceDate(inv.invoice_date || "");
      setDueDate(inv.due_date || "");
      setReference(inv.reference || "");
      setSubject(inv.subject || "");
      setGstin(inv.gstin || "");
      setGstTreatment(inv.gst_treatment || "gst");
      setTerms(inv.terms || "");
      setNotes(inv.notes || "");
      setEwayBillNumber(inv.eway_bill_number || "");
      setEwayTransporterName(inv.eway_transporter_name || "");
      setEwayTransporterId(inv.eway_transporter_id || "");
      setEwayVehicleNumber(inv.eway_vehicle_number || "");
      setEwayDistanceKm(inv.eway_distance_km || "");
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

  // CustomerPicker hands back the full customer object (or null when
  // cleared) rather than just an id, same as ItemPicker does for items.
  const pickCustomer = (customer) => {
    setCustomerId(customer?.id || "");
    setCustomerName(customer?.name || "");
    setGstin(customer?.gstin || "");
  };

  const handleCustomerCreated = (customer) => {
    setCustomers((prev) => [...prev, customer].sort((a, b) => a.name.localeCompare(b.name)));
    pickCustomer(customer);
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
  const rawTotals = computeTotals(lines);
  const { subTotal, discountTotal, taxTotal } = rawTotals;
  // Mirrors server/src/lib/gst.js: RCM and "no GST" don't add the tax to the
  // amount the customer actually owes — this is just the on-screen preview,
  // the server always recomputes and is the source of truth.
  const total = gstTreatment === "none" ? subTotal - discountTotal
    : gstTreatment === "rcm" ? subTotal - discountTotal
    : rawTotals.total;

  const buildPayload = () => ({
    customer_id: customerId || null,
    invoice_date: invoiceDate || null,
    due_date: dueDate || null,
    reference: reference || null,
    subject: subject || null,
    gstin: gstin || null,
    gst_treatment: gstTreatment,
    terms: terms || null,
    notes: notes || null,
    ...(isPremium && {
      eway_bill_number: ewayBillNumber || null,
      eway_transporter_name: ewayTransporterName || null,
      eway_transporter_id: ewayTransporterId || null,
      eway_vehicle_number: ewayVehicleNumber || null,
      eway_distance_km: ewayDistanceKm || null,
    }),
    lineItems: lines.map((l) => ({ ...l, item_id: l.item_id || null })),
  });

  // A new invoice is always saved as a real, numbered document the moment
  // it's created — "draft" vs "sent" is only ever a status label from here
  // on, never about whether it has a number yet. So all three actions below
  // share the same create call; they only differ in what happens right
  // after: nothing (stays Draft), an immediate status flip to Sent with no
  // email (mode "create" — handed over some other way), or landing on the
  // invoice with the send popup already open (mode "send").
  const selectedCustomer = customers.find((c) => String(c.id) === String(customerId));
  const customerHasEmail = Boolean(selectedCustomer?.email);

  const submit = async (mode) => {
    // mode: "draft" | "create" | "send"
    setError("");
    // No more "walk-in / no customer" invoices — every BillItUp invoice is a
    // real GST document billed to someone, so a customer is required before
    // this ever reaches the server (which enforces the same rule).
    if (!customerId) {
      setError("Please select or add a customer before creating this invoice.");
      return;
    }
    if (mode === "send" && !customerHasEmail) {
      setError("This customer has no email on file — add one to their record, or use Create instead and send the invoice another way.");
      return;
    }
    setSaving(mode);
    try {
      if (isEdit) {
        await api.updateInvoice(id, buildPayload());
        navigate(`/invoices/${id}`);
        return;
      }
      const invoice = await api.createInvoice(buildPayload());
      if (mode === "create") {
        await api.setInvoiceStatus(invoice.id, "sent");
      }
      navigate(mode === "send" ? `/invoices/${invoice.id}?send=1` : `/invoices/${invoice.id}`);
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
      <form onSubmit={(e) => e.preventDefault()}>
        <div className="form-row">
          <label className="block">Customer
            <CustomerPicker
              customers={customers}
              customerId={customerId}
              customerName={customerName}
              onSelect={pickCustomer}
              onCreated={handleCustomerCreated}
            />
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
          <label className="block">GST Treatment
            <select value={gstTreatment} onChange={(e) => setGstTreatment(e.target.value)}>
              {GST_TREATMENTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
        </div>
        {gstTreatment === "rcm" && (
          <p className="muted">
            Reverse charge: the tax below is shown for your customer's own GST filing, but is not added to what
            they owe you. They pay that GST directly to the government.
          </p>
        )}
        {gstTreatment === "none" && (
          <p className="muted">No GST will be added to this invoice, whatever tax % is set on a line below.</p>
        )}

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

        <label className="block">Terms (optional)
          <input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. Net 15" />
        </label>
        <label className="block">Notes (optional, shown on the invoice)
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {isPremium ? (
          <fieldset className="eway-fieldset">
            <legend>E-Way Bill Details (optional)</legend>
            <p className="muted" style={{ marginTop: 0 }}>
              BillItUp doesn't generate the e-way bill itself — record the details of one you've already generated
              on the government portal, and it will show on this invoice.
            </p>
            <div className="form-row">
              <label className="block">E-Way Bill Number
                <input value={ewayBillNumber} onChange={(e) => setEwayBillNumber(e.target.value)} />
              </label>
              <label className="block">Vehicle Number
                <input value={ewayVehicleNumber} onChange={(e) => setEwayVehicleNumber(e.target.value)} placeholder="e.g. TN09AB1234" />
              </label>
            </div>
            <div className="form-row">
              <label className="block">Transporter Name
                <input value={ewayTransporterName} onChange={(e) => setEwayTransporterName(e.target.value)} />
              </label>
              <label className="block">Transporter ID (GSTIN, optional)
                <input value={ewayTransporterId} onChange={(e) => setEwayTransporterId(e.target.value)} />
              </label>
              <label className="block">Distance (km, optional)
                <input type="number" step="0.1" value={ewayDistanceKm} onChange={(e) => setEwayDistanceKm(e.target.value)} />
              </label>
            </div>
          </fieldset>
        ) : (
          business && (
            <p className="muted">
              E-Way Bill tracking for invoices involving goods movement is a premium feature. Get in touch to
              upgrade — everything else stays free.
            </p>
          )
        )}

        {error && <p className="error">{error}</p>}
        {isEdit ? (
          <button type="button" disabled={saving} onClick={() => submit("create")}>
            {saving ? "Saving..." : "Save Changes"}
          </button>
        ) : (
          <div className="form-submit-row">
            <button type="button" className="btn-secondary" disabled={saving} onClick={() => submit("draft")}>
              {saving === "draft" ? "Saving..." : "Save as Draft"}
            </button>
            <button type="button" className="btn-secondary" disabled={saving} onClick={() => submit("create")}>
              {saving === "create" ? "Creating..." : "Create"}
            </button>
            <button type="button" disabled={saving || !customerHasEmail} title={!customerHasEmail ? "Add an email to this customer first" : undefined} onClick={() => submit("send")}>
              {saving === "send" ? "Sending..." : "Create and Send"}
            </button>
            {customerId && !customerHasEmail && (
              <p className="muted">This customer has no email on file, so Create and Send is disabled — add one on the Customers page, or use Create instead.</p>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
