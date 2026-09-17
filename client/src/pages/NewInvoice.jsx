import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, getUser } from "../lib/api";
import { emptyLine, lineAmount, computeTotals } from "../lib/lineItemMath";
import { formatMoney } from "../lib/format";
import ItemPicker from "../components/ItemPicker";
import CustomerPicker from "../components/CustomerPicker";
import TaxRateInput from "../components/TaxRateInput";
import UnitSelect from "../components/UnitSelect";
import CollapsibleSection from "../components/CollapsibleSection";
import { GST_TREATMENTS } from "../lib/gst";
import { CURRENCIES, currencySymbol } from "../lib/currencies";

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
  const [termsAndConditions, setTermsAndConditions] = useState("");
  const [termsTemplateId, setTermsTemplateId] = useState("custom");
  const [termsTemplates, setTermsTemplates] = useState([]);
  const [notes, setNotes] = useState("");
  const [ewayBillNumber, setEwayBillNumber] = useState("");
  const [ewayTransporterName, setEwayTransporterName] = useState("");
  const [ewayTransporterId, setEwayTransporterId] = useState("");
  const [ewayVehicleNumber, setEwayVehicleNumber] = useState("");
  const [ewayDistanceKm, setEwayDistanceKm] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [projectName, setProjectName] = useState("");
  const [milestoneLabel, setMilestoneLabel] = useState("");
  const [projectTotalAmount, setProjectTotalAmount] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingInvoice, setLoadingInvoice] = useState(isEdit);

  // Unbilled hours / billable expenses / retainer draw-down — only offered
  // when creating a brand new invoice, not when editing one, so a later edit
  // can never double-attach or re-draw-down the same entries (2026-09-16).
  const [unbilledTimeEntries, setUnbilledTimeEntries] = useState([]);
  const [selectedTimeEntryIds, setSelectedTimeEntryIds] = useState([]);
  const [billablePurchases, setBillablePurchases] = useState([]);
  const [selectedPurchaseIds, setSelectedPurchaseIds] = useState([]);
  const [retainerApplied, setRetainerApplied] = useState("");

  useEffect(() => {
    api.listCustomers().then(setCustomers);
    api.listItems().then(setItems);
    // A brand new invoice defaults to the business's own default currency —
    // an edit in progress below overwrites this with the invoice's actual
    // currency once it loads, so this only matters for a genuinely new
    // invoice (2026-09-16).
    api.getBusiness().then((b) => {
      setBusiness(b);
      if (!isEdit) setCurrency(b.default_currency || "INR");
    });
    // A brand new invoice starts on whichever saved Terms & Conditions
    // template is marked default (if any) — same "an edit overwrites this
    // once it loads" reasoning as currency above (2026-09-16).
    api.listTermsTemplates().then((list) => {
      setTermsTemplates(list);
      if (!isEdit) {
        const defaultTemplate = list.find((t) => t.is_default) || list[0];
        if (defaultTemplate) {
          setTermsTemplateId(defaultTemplate.id);
          setTermsAndConditions(defaultTemplate.content);
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setTermsAndConditions(inv.terms_and_conditions || "");
      setTermsTemplateId("custom");
      setNotes(inv.notes || "");
      setEwayBillNumber(inv.eway_bill_number || "");
      setEwayTransporterName(inv.eway_transporter_name || "");
      setEwayTransporterId(inv.eway_transporter_id || "");
      setEwayVehicleNumber(inv.eway_vehicle_number || "");
      setEwayDistanceKm(inv.eway_distance_km || "");
      setCurrency(inv.currency || "INR");
      setProjectName(inv.project_name || "");
      setMilestoneLabel(inv.milestone_label || "");
      setProjectTotalAmount(inv.project_total_amount || "");
      setLines(
        (inv.lineItems || []).map((li) => ({
          item_id: li.item_id || "",
          item_name: "", // resolved once the item catalog loads, see below
          description: li.description || "",
          qty: li.qty,
          rate: li.rate,
          discount: li.discount,
          tax_rate: li.tax_rate,
          unit: li.unit || "",
          hsn_sac_code: li.hsn_sac_code || "",
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
    setSelectedTimeEntryIds([]);
    setSelectedPurchaseIds([]);
    setRetainerApplied("");
    setLines((prev) => {
      const kept = prev.filter((l) => !l._time_entry_id && !l._billable_purchase_id);
      return kept.length > 0 ? kept : [emptyLine()];
    });
  };

  // Load this customer's unbilled hours + billable expenses whenever the
  // customer changes — new-invoice only (see the state comment above).
  useEffect(() => {
    if (isEdit || !customerId) {
      setUnbilledTimeEntries([]);
      setBillablePurchases([]);
      return;
    }
    api.getUnbilledTimeEntries(customerId).then(setUnbilledTimeEntries).catch(() => setUnbilledTimeEntries([]));
    api.getBillablePurchases(customerId).then(setBillablePurchases).catch(() => setBillablePurchases([]));
  }, [customerId, isEdit]);

  // Checking one of these adds a matching line item to the invoice itself
  // (that's the whole point — "turns into an invoice line"), tagged with
  // _time_entry_id/_billable_purchase_id so unchecking removes exactly that
  // line back out again rather than guessing by description text.
  const toggleTimeEntry = (te) => {
    const alreadyIn = selectedTimeEntryIds.includes(te.id);
    setSelectedTimeEntryIds((prev) => (alreadyIn ? prev.filter((x) => x !== te.id) : [...prev, te.id]));
    if (alreadyIn) {
      setLines((prev) => prev.filter((l) => l._time_entry_id !== te.id));
    } else {
      const label = [te.project_name, te.description].filter(Boolean).join(" — ") || "Time logged";
      setLines((prev) => [
        ...prev,
        { ...emptyLine(), description: `${label} (${te.entry_date})`, qty: te.hours, rate: te.rate, _time_entry_id: te.id },
      ]);
    }
  };
  const toggleBillablePurchase = (p) => {
    const alreadyIn = selectedPurchaseIds.includes(p.id);
    setSelectedPurchaseIds((prev) => (alreadyIn ? prev.filter((x) => x !== p.id) : [...prev, p.id]));
    if (alreadyIn) {
      setLines((prev) => prev.filter((l) => l._billable_purchase_id !== p.id));
    } else {
      setLines((prev) => [
        ...prev,
        { ...emptyLine(), description: p.description || "Reimbursable expense", qty: 1, rate: p.total, _billable_purchase_id: p.id },
      ]);
    }
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
          unit: item.unit || "",
          hsn_sac_code: item.hsn_sac_code || "",
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
    terms_and_conditions: termsAndConditions || null,
    notes: notes || null,
    currency,
    project_name: projectName || null,
    milestone_label: milestoneLabel || null,
    project_total_amount: projectTotalAmount || null,
    ...(isPremium && {
      eway_bill_number: ewayBillNumber || null,
      eway_transporter_name: ewayTransporterName || null,
      eway_transporter_id: ewayTransporterId || null,
      eway_vehicle_number: ewayVehicleNumber || null,
      eway_distance_km: ewayDistanceKm || null,
    }),
    lineItems: lines.map((l) => ({ ...l, item_id: l.item_id || null })),
    ...(!isEdit && {
      retainer_applied: retainerApplied || null,
      time_entry_ids: selectedTimeEntryIds,
      billable_purchase_ids: selectedPurchaseIds,
    }),
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

  const symbol = currencySymbol(currency);
  const userRole = getUser()?.role;
  // Boolean(...) matters here — SQLite stores require_invoice_approval as an
  // integer 0/1, not a real boolean, so "false" was actually the NUMBER 0.
  // React renders {0 && ...} as the literal text "0" (only false/null/
  // undefined are skipped), which is exactly the stray "0" that showed up
  // under the New Invoice heading for any business with the setting off
  // (2026-09-16).
  const willNeedApproval = Boolean(!isEdit && business?.require_invoice_approval && !["owner", "admin"].includes(userRole));
  const retainerBalance = Number(selectedCustomer?.retainer_balance) || 0;

  if (loadingInvoice) return <p className="muted">Loading...</p>;

  const hasMilestoneData = !!(projectName || milestoneLabel || projectTotalAmount);
  const hasEwayData = !!(ewayBillNumber || ewayVehicleNumber || ewayTransporterName || ewayTransporterId || ewayDistanceKm);

  return (
    <div>
      <h1>{isEdit ? "Edit Invoice" : "New Invoice"}</h1>
      {isEdit && (
        <p className="muted">
          Saving will recalculate this invoice's total. The previous version is kept — see Edit History on the
          invoice once you're done.
        </p>
      )}
      {willNeedApproval && (
        <p className="muted">This invoice will need Owner/Admin approval before it can be sent.</p>
      )}
      <form onSubmit={(e) => e.preventDefault()}>
        <div className="invoice-form-grid">
          <div className="invoice-form-main">
            <section className="form-card">
              <h2>Invoice Details</h2>
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
              <label className="block" style={{ maxWidth: "none" }}>Subject (optional)
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Let your customer know what this invoice is for" />
              </label>
            </section>

            <section className="form-card">
              <h2>Line Items</h2>
              <div className="line-item-table-wrap">
                <table className="table line-item-table">
                  <thead>
                    <tr><th>Item &amp; Description</th><th>HSN/SAC</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Discount</th><th>Tax %</th><th>Amount</th><th /></tr>
                  </thead>
                  <tbody>
                    {lines.map((line, i) => {
                      const lineItemType = items.find((it) => String(it.id) === String(line.item_id))?.type || "goods";
                      return (
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
                          <td><input className="num" style={{ width: 80 }} value={line.hsn_sac_code || ""} onChange={(e) => updateLine(i, { hsn_sac_code: e.target.value })} /></td>
                          <td><input type="number" step="0.01" className="num" value={line.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} /></td>
                          <td><UnitSelect type={lineItemType} value={line.unit} onChange={(v) => updateLine(i, { unit: v })} /></td>
                          <td><input type="number" step="0.01" className="num" value={line.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} /></td>
                          <td><input type="number" step="0.01" className="num" value={line.discount} onChange={(e) => updateLine(i, { discount: e.target.value })} /></td>
                          <td><TaxRateInput className="num" value={line.tax_rate} onChange={(v) => updateLine(i, { tax_rate: v })} /></td>
                          <td className="num">{symbol}{formatMoney(lineAmount(line))}</td>
                          <td>{lines.length > 1 && <button type="button" className="link-btn" onClick={() => removeLine(i)}>Remove</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button type="button" className="link-btn" onClick={addLine}>+ Add line</button>

              {gstTreatment === "rcm" && (
                <p className="muted">
                  Reverse charge: the tax below is shown for your customer's own GST filing, but is not added to what
                  they owe you. They pay that GST directly to the government.
                </p>
              )}
              {gstTreatment === "none" && (
                <p className="muted">No GST will be added to this invoice, whatever tax % is set on a line above.</p>
              )}

              <div className="totals-box">
                <div><span>Sub Total</span><span>{symbol}{formatMoney(subTotal)}</span></div>
                <div><span>Discount</span><span>-{symbol}{formatMoney(discountTotal)}</span></div>
                <div><span>{gstTreatment === "rcm" ? "Tax (reverse charge)" : "Tax"}</span><span>{symbol}{formatMoney(gstTreatment === "none" ? 0 : taxTotal)}</span></div>
                <div className="grand-total"><span>Total</span><span>{symbol}{formatMoney(total)}</span></div>
              </div>
            </section>

            <section className="form-card">
              <h2>Terms &amp; Notes</h2>
              <label className="block" style={{ maxWidth: "none" }}>Payment Terms (optional)
                <input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="e.g. Net 15" />
              </label>
              <label className="block" style={{ maxWidth: "none" }}>Notes (optional, shown on the invoice)
                <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
              <label className="block" style={{ maxWidth: "none" }}>Terms &amp; Conditions (optional, printed on the invoice)
                <select
                  value={termsTemplateId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setTermsTemplateId(id);
                    if (id !== "custom") {
                      const picked = termsTemplates.find((t) => String(t.id) === String(id));
                      if (picked) setTermsAndConditions(picked.content);
                    }
                  }}
                >
                  {termsTemplates.map((t) => <option key={t.id} value={t.id}>{t.title}{t.is_default ? " (default)" : ""}</option>)}
                  <option value="custom">Custom text</option>
                </select>
              </label>
              {termsTemplates.length === 0 && (
                <p className="muted" style={{ marginTop: -8, fontSize: 13 }}>
                  Save a reusable Terms &amp; Conditions template in Settings to pick from here next time.
                </p>
              )}
              <label className="block" style={{ maxWidth: "none" }}>
                <textarea rows={4} value={termsAndConditions} onChange={(e) => { setTermsAndConditions(e.target.value); setTermsTemplateId("custom"); }} />
              </label>
            </section>
          </div>

          <div className="invoice-form-sidebar">
            <section className="form-card">
              <h2>Invoice Settings</h2>
              <label className="block" style={{ maxWidth: "none" }}>Currency
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>)}
                </select>
              </label>
              <label className="block" style={{ maxWidth: "none" }}>GST Number (optional)
                <input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="Defaults from the customer's GSTIN" />
              </label>
              <label className="block" style={{ maxWidth: "none" }}>GST Treatment
                <select value={gstTreatment} onChange={(e) => setGstTreatment(e.target.value)}>
                  {GST_TREATMENTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
            </section>

            <CollapsibleSection title="Project / Milestone Billing" defaultOpen={isEdit && hasMilestoneData}>
              <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                Billing a project in stages? Give it a name and, optionally, a total value — every invoice you raise
                with the same project name (for this customer) is added up automatically and shown on each one.
              </p>
              <label className="block" style={{ maxWidth: "none" }}>Project name
                <input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. Website Redesign" />
              </label>
              <label className="block" style={{ maxWidth: "none" }}>Milestone label
                <input value={milestoneLabel} onChange={(e) => setMilestoneLabel(e.target.value)} placeholder="e.g. Milestone 1 of 3, Advance" />
              </label>
              <label className="block" style={{ maxWidth: "none" }}>Project total (optional)
                <input type="number" step="0.01" value={projectTotalAmount} onChange={(e) => setProjectTotalAmount(e.target.value)} placeholder={`Total ${currency} value of the whole project`} />
              </label>
            </CollapsibleSection>

            {!isEdit && customerId && (unbilledTimeEntries.length > 0 || billablePurchases.length > 0 || retainerBalance > 0) && (
              <section className="form-card">
                <h2>Unbilled Hours, Expenses &amp; Retainer</h2>
                {unbilledTimeEntries.length > 0 && (
                  <div className="block">
                    <p className="muted" style={{ marginTop: 0, marginBottom: 4, fontSize: 13 }}>Add unbilled hours logged for this customer:</p>
                    {unbilledTimeEntries.map((te) => (
                      <label key={te.id} className="checkbox-row">
                        <input type="checkbox" checked={selectedTimeEntryIds.includes(te.id)} onChange={() => toggleTimeEntry(te)} />
                        {te.entry_date}: {te.hours}h{te.project_name ? ` (${te.project_name})` : ""}{te.description ? `, ${te.description}` : ""} @ {symbol}{formatMoney(te.rate)}/hr
                      </label>
                    ))}
                  </div>
                )}
                {billablePurchases.length > 0 && (
                  <div className="block">
                    <p className="muted" style={{ marginTop: 0, marginBottom: 4, fontSize: 13 }}>Add billable expenses logged for this customer:</p>
                    {billablePurchases.map((p) => (
                      <label key={p.id} className="checkbox-row">
                        <input type="checkbox" checked={selectedPurchaseIds.includes(p.id)} onChange={() => toggleBillablePurchase(p)} />
                        {p.purchase_date}: {p.description || "Expense"}, {symbol}{formatMoney(p.total)}
                      </label>
                    ))}
                  </div>
                )}
                {retainerBalance > 0 && (
                  <label className="block" style={{ maxWidth: "none" }}>
                    Apply from retainer balance ({symbol}{formatMoney(retainerBalance)} available)
                    <input
                      type="number" step="0.01" min="0" max={retainerBalance}
                      value={retainerApplied}
                      onChange={(e) => setRetainerApplied(e.target.value)}
                      placeholder="0.00"
                    />
                  </label>
                )}
              </section>
            )}

            {isPremium ? (
              <CollapsibleSection title="E-Way Bill Details" defaultOpen={isEdit && hasEwayData}>
                <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
                  BillItUp doesn't generate the e-way bill itself — record the details of one you've already generated
                  on the government portal, and it will show on this invoice.
                </p>
                <label className="block" style={{ maxWidth: "none" }}>E-Way Bill Number
                  <input value={ewayBillNumber} onChange={(e) => setEwayBillNumber(e.target.value)} />
                </label>
                <label className="block" style={{ maxWidth: "none" }}>Vehicle Number
                  <input value={ewayVehicleNumber} onChange={(e) => setEwayVehicleNumber(e.target.value)} placeholder="e.g. TN09AB1234" />
                </label>
                <label className="block" style={{ maxWidth: "none" }}>Transporter Name
                  <input value={ewayTransporterName} onChange={(e) => setEwayTransporterName(e.target.value)} />
                </label>
                <label className="block" style={{ maxWidth: "none" }}>Transporter ID (GSTIN, optional)
                  <input value={ewayTransporterId} onChange={(e) => setEwayTransporterId(e.target.value)} />
                </label>
                <label className="block" style={{ maxWidth: "none" }}>Distance (km, optional)
                  <input type="number" step="0.1" value={ewayDistanceKm} onChange={(e) => setEwayDistanceKm(e.target.value)} />
                </label>
              </CollapsibleSection>
            ) : (
              business && (
                <p className="muted">
                  E-Way Bill tracking for invoices involving goods movement is a premium feature. Get in touch to
                  upgrade — everything else stays free.
                </p>
              )
            )}
          </div>
        </div>

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
