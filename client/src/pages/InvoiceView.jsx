import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";

// Paper size presets: id -> { label, @page CSS size, content width for the on-screen/print preview }
const PAPER_SIZES = {
  A4: { label: "A4", pageSize: "A4", width: "210mm", mode: "full" },
  THERMAL_3IN: { label: '3" Thermal', pageSize: "80mm auto", width: "76mm", mode: "receipt" },
  THERMAL_4IN: { label: '4" Thermal', pageSize: "104mm auto", width: "100mm", mode: "receipt" },
};

export default function InvoiceView() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [paperSize, setPaperSize] = useState("A4");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [error, setError] = useState("");

  const load = () => api.getInvoice(id).then((inv) => {
    setInvoice(inv);
    if (inv.business?.default_paper_size && PAPER_SIZES[inv.business.default_paper_size]) {
      setPaperSize(inv.business.default_paper_size);
    }
  });
  useEffect(() => { load(); }, [id]);

  // Inject the correct @page size for the currently selected paper — @page rules
  // can't be scoped with a normal CSS selector, so we swap a <style> tag's content instead.
  useEffect(() => {
    const preset = PAPER_SIZES[paperSize];
    let styleTag = document.getElementById("dynamic-print-style");
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "dynamic-print-style";
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = `@page { size: ${preset.pageSize}; margin: ${preset.mode === "full" ? "12mm" : "2mm"}; }`;
  }, [paperSize]);

  if (!invoice) return <p className="muted">Loading...</p>;

  const preset = PAPER_SIZES[paperSize];
  const recordPayment = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.recordPayment(id, { amount: Number(paymentAmount), mode: "cash" });
      setPaymentAmount("");
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="no-print toolbar">
        <label>Paper size:{" "}
          <select value={paperSize} onChange={(e) => setPaperSize(e.target.value)}>
            {Object.entries(PAPER_SIZES).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
          </select>
        </label>
        <button onClick={() => window.print()}>Print / Save PDF</button>
        {invoice.balance_due > 0 && (
          <form className="inline-form" onSubmit={recordPayment}>
            <input type="number" step="0.01" placeholder="Amount" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required />
            <button type="submit">Record Payment</button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      <div className={`invoice-doc invoice-${preset.mode}`} style={{ width: preset.width }}>
        {preset.mode === "full" ? <FullInvoice invoice={invoice} /> : <ReceiptInvoice invoice={invoice} />}
      </div>
    </div>
  );
}

function FullInvoice({ invoice }) {
  const { business, customer, lineItems } = invoice;
  return (
    <>
      <div className="invoice-header">
        <div>
          <h2>{business.name}</h2>
          {business.address && <p>{business.address}</p>}
          {business.phone && <p>{business.phone}</p>}
          {business.email && <p>{business.email}</p>}
          {business.gstin && <p>GSTIN: {business.gstin}</p>}
        </div>
        <div className="invoice-meta">
          <h3>#{invoice.invoice_number}</h3>
          <p>Balance Due: ₹{Number(invoice.balance_due).toFixed(2)}</p>
        </div>
      </div>

      <div className="invoice-parties">
        <div>
          <strong>Bill To</strong>
          <p>{customer?.name || "Walk-in customer"}</p>
          {customer?.billing_address && <p>{customer.billing_address}</p>}
          {customer?.gstin && <p>GSTIN: {customer.gstin}</p>}
        </div>
        <div className="invoice-dates">
          <p>Invoice Date: {invoice.invoice_date}</p>
          {invoice.terms && <p>Terms: {invoice.terms}</p>}
          {invoice.due_date && <p>Due Date: {invoice.due_date}</p>}
          {invoice.reference && <p>Reference: {invoice.reference}</p>}
        </div>
      </div>

      <table className="table">
        <thead><tr><th>#</th><th>Item &amp; Description</th><th>Qty</th><th>Rate</th><th>Discount</th><th>Amount</th></tr></thead>
        <tbody>
          {lineItems.map((line, i) => (
            <tr key={line.id}>
              <td>{i + 1}</td><td>{line.description}</td><td>{line.qty}</td>
              <td>₹{Number(line.rate).toFixed(2)}</td><td>₹{Number(line.discount).toFixed(2)}</td>
              <td>₹{Number(line.amount).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="totals-box">
        <div><span>Sub Total</span><span>₹{Number(invoice.sub_total).toFixed(2)}</span></div>
        <div><span>Discount</span><span>-₹{Number(invoice.discount).toFixed(2)}</span></div>
        <div><span>Tax</span><span>₹{Number(invoice.tax_total).toFixed(2)}</span></div>
        <div className="grand-total"><span>Total</span><span>₹{Number(invoice.total).toFixed(2)}</span></div>
        <div><span>Balance Due</span><span>₹{Number(invoice.balance_due).toFixed(2)}</span></div>
      </div>

      {invoice.notes && <p className="invoice-notes">{invoice.notes}</p>}
    </>
  );
}

function ReceiptInvoice({ invoice }) {
  const { business, lineItems } = invoice;
  return (
    <div className="receipt">
      <div className="receipt-center">
        <strong>{business.name}</strong>
        {business.address && <div>{business.address}</div>}
        {business.phone && <div>{business.phone}</div>}
      </div>
      <div className="receipt-divider" />
      <div>#{invoice.invoice_number} · {invoice.invoice_date}</div>
      <div className="receipt-divider" />
      {lineItems.map((line) => (
        <div className="receipt-line" key={line.id}>
          <div>{line.description}</div>
          <div className="receipt-line-detail">
            <span>{line.qty} x ₹{Number(line.rate).toFixed(2)}</span>
            <span>₹{Number(line.amount).toFixed(2)}</span>
          </div>
        </div>
      ))}
      <div className="receipt-divider" />
      <div className="receipt-line-detail"><span>Sub Total</span><span>₹{Number(invoice.sub_total).toFixed(2)}</span></div>
      <div className="receipt-line-detail"><span>Tax</span><span>₹{Number(invoice.tax_total).toFixed(2)}</span></div>
      <div className="receipt-line-detail receipt-total"><span>Total</span><span>₹{Number(invoice.total).toFixed(2)}</span></div>
      <div className="receipt-divider" />
      <div className="receipt-center">Thank you!</div>
    </div>
  );
}
