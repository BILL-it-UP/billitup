import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import SendEmailButton from "../components/SendEmailButton";
import DocumentBrandHeader from "../components/DocumentBrandHeader";
import DocumentFooter from "../components/DocumentFooter";

export default function InvoiceView() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderResult, setReminderResult] = useState(null);

  const load = () => api.getInvoice(id).then(setInvoice);
  useEffect(() => { load(); }, [id]);

  // A4 is the only paper size BillItUp targets — one fixed @page size for
  // every print/PDF, no paper-size switching needed.
  useEffect(() => {
    let styleTag = document.getElementById("dynamic-print-style");
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "dynamic-print-style";
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = `@page { size: A4; margin: 12mm; }`;
  }, []);

  if (!invoice) return <p className="muted">Loading...</p>;

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

  const shareUrl = invoice.public_token ? `${window.location.origin}/view/invoice/${invoice.public_token}` : null;
  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link:", shareUrl);
    }
  };

  const sendReminder = async () => {
    setSendingReminder(true);
    setReminderResult(null);
    try {
      const res = await api.sendInvoiceEmail(id, { to: invoice.customer?.email, reminder: true });
      setReminderResult({ ok: true, to: res.sentTo });
    } catch (err) {
      setReminderResult({ error: err.message });
    } finally {
      setSendingReminder(false);
    }
  };

  return (
    <div>
      <div className="no-print toolbar">
        <button onClick={() => window.print()}>Print / Save PDF</button>
        <SendEmailButton
          defaultTo={invoice.customer?.email}
          onSend={(to) => api.sendInvoiceEmail(id, { to })}
        />
        {shareUrl && <button type="button" onClick={copyLink}>{copied ? "Link copied!" : "Copy shareable link"}</button>}
        {invoice.is_overdue && (
          <button type="button" onClick={sendReminder} disabled={sendingReminder}>
            {sendingReminder ? "Sending..." : "Send Payment Reminder"}
          </button>
        )}
        {reminderResult?.ok && <span className="muted">Reminder sent to {reminderResult.to}.</span>}
        {reminderResult?.error && <span className="error">{reminderResult.error}</span>}
        {invoice.balance_due > 0 && (
          <form className="inline-form" onSubmit={recordPayment}>
            <input type="number" step="0.01" placeholder="Amount" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} required />
            <button type="submit">Record Payment</button>
          </form>
        )}
        {error && <p className="error">{error}</p>}
      </div>

      <div className="invoice-doc invoice-full" style={{ width: "210mm" }}>
        <FullInvoice invoice={invoice} />
      </div>
    </div>
  );
}

export function FullInvoice({ invoice }) {
  const { business, customer, lineItems } = invoice;
  return (
    <>
      <DocumentBrandHeader
        business={business} docLabel="Invoice" docNumber={invoice.invoice_number}
        headline={{ label: "Balance Due", value: `₹${Number(invoice.balance_due).toFixed(2)}` }}
      />

      <div className="invoice-parties">
        <div>
          <strong>Bill To</strong>
          <p>{customer?.name || "Walk-in customer"}</p>
          {customer?.billing_address && <p>{customer.billing_address}</p>}
          {customer?.gstin && <p>GSTIN: {customer.gstin}</p>}
        </div>
        <div className="invoice-dates">
          <div><span>Invoice Date :</span><span>{invoice.invoice_date}</span></div>
          {invoice.terms && <div><span>Terms :</span><span>{invoice.terms}</span></div>}
          {invoice.due_date && <div><span>Due Date :</span><span>{invoice.due_date}</span></div>}
          {invoice.reference && <div><span>Reference :</span><span>{invoice.reference}</span></div>}
        </div>
      </div>

      <table className="table doc-line-items">
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
        <div className="doc-balance-due-row"><span>Balance Due</span><span>₹{Number(invoice.balance_due).toFixed(2)}</span></div>
      </div>

      {invoice.notes && <p className="invoice-notes">{invoice.notes}</p>}

      <DocumentFooter business={business} total={invoice.total} />
    </>
  );
}
