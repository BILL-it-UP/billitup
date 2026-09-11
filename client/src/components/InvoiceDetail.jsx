import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import SendEmailButton from "./SendEmailButton";
import RecordPaymentForm from "./RecordPaymentForm";
import FullInvoice from "./FullInvoice";

// The invoice detail pane: toolbar (Send / Share / Reminder / Print-PDF /
// Record Payment) plus the actual A4 document. Used both by the standalone
// /invoices/:id page and embedded as the right-hand pane of the
// master-detail Invoices list on the Dashboard, so the two never diverge.
//
// No "Edit" action here on purpose — BillItUp doesn't yet support editing an
// already-created invoice's line items server-side (only status changes and
// payments), so a button that didn't do anything real would be worse than
// no button.
export default function InvoiceDetail({ invoiceId, onChanged, standalone = false }) {
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderResult, setReminderResult] = useState(null);

  const load = () => api.getInvoice(invoiceId).then(setInvoice);
  useEffect(() => {
    setInvoice(null);
    setReminderResult(null);
    setError("");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  useEffect(() => {
    // Always set the A4 @page size, whether this is the standalone
    // /invoices/:id page or the embedded pane inside the Dashboard's
    // master-detail Invoices list — printing from either place should
    // produce the same A4 document.
    let styleTag = document.getElementById("dynamic-print-style");
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "dynamic-print-style";
      document.head.appendChild(styleTag);
    }
    styleTag.textContent = `@page { size: A4; margin: 12mm; }`;
  }, []);

  if (!invoice) return <p className="muted">Loading...</p>;

  const refresh = async () => {
    await load();
    onChanged?.();
  };

  const recordPayment = async (payload) => {
    setError("");
    try {
      await api.recordPayment(invoiceId, payload);
      await refresh();
    } catch (err) {
      setError(err.message);
      throw err;
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
      const res = await api.sendInvoiceEmail(invoiceId, { to: invoice.customer?.email, reminder: true });
      setReminderResult({ ok: true, to: res.sentTo });
    } catch (err) {
      setReminderResult({ error: err.message });
    } finally {
      setSendingReminder(false);
    }
  };

  return (
    <div>
      <div className="no-print toolbar invoice-toolbar">
        {!standalone && (
          <Link className="link-btn" to={`/invoices/${invoiceId}`} title="Open in its own page">↗ Open</Link>
        )}
        <button onClick={() => window.print()}>Print / Save PDF</button>
        <SendEmailButton
          defaultTo={invoice.customer?.email}
          onSend={async (to) => { await api.sendInvoiceEmail(invoiceId, { to }); await refresh(); }}
        />
        {shareUrl && <button type="button" onClick={copyLink}>{copied ? "Link copied!" : "Copy shareable link"}</button>}
        {invoice.is_overdue && (
          <button type="button" onClick={sendReminder} disabled={sendingReminder}>
            {sendingReminder ? "Sending..." : "Send Payment Reminder"}
          </button>
        )}
        {invoice.balance_due > 0 && (
          <RecordPaymentForm balanceDue={invoice.balance_due} onRecord={recordPayment} />
        )}
      </div>
      {reminderResult?.ok && <p className="muted no-print">Reminder sent to {reminderResult.to}.</p>}
      {reminderResult?.error && <p className="error no-print">{reminderResult.error}</p>}
      {error && <p className="error no-print">{error}</p>}

      <div className="invoice-doc invoice-full" style={{ width: standalone ? "210mm" : "100%", maxWidth: "210mm" }}>
        <FullInvoice invoice={invoice} />
      </div>
    </div>
  );
}
