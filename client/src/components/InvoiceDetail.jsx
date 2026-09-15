import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, getUser } from "../lib/api";
import { getTemplate, mergeTemplate } from "../lib/emailTemplates";
import SendDocumentModal from "./SendDocumentModal";
import ConfirmDialog from "./ConfirmDialog";
import RecordPaymentForm from "./RecordPaymentForm";
import FullInvoice from "./FullInvoice";
import EditHistory from "./EditHistory";

// The invoice detail pane: toolbar (Edit / Send / Share / Reminder /
// Print-PDF / Record Payment) plus the actual A4 document. Used both by the
// standalone /invoices/:id page and embedded as the right-hand pane of the
// master-detail Invoices list on the Dashboard, so the two never diverge.
export default function InvoiceDetail({ invoiceId, onChanged, standalone = false }) {
  const canEdit = ["owner", "admin"].includes(getUser()?.role);
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderResult, setReminderResult] = useState(null);
  const [statusBusy, setStatusBusy] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [confirmingMarkSent, setConfirmingMarkSent] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const autoSendConsumed = useRef(false);

  const load = () => api.getInvoice(invoiceId).then(setInvoice);
  useEffect(() => {
    setInvoice(null);
    setReminderResult(null);
    setError("");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  // "Create and Send" on the New Invoice page creates the invoice, then
  // lands here with ?send=1 so the send popup opens immediately instead of
  // making the user find the button themselves. Guarded by a ref (not just
  // the invoice state) so a later refresh() — recording a payment, say —
  // never reopens it a second time.
  useEffect(() => {
    if (invoice && !autoSendConsumed.current && searchParams.get("send") === "1") {
      autoSendConsumed.current = true;
      setShowSendModal(true);
      const next = new URLSearchParams(searchParams);
      next.delete("send");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice]);

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

  // Pre-fills the send popup with the business's own saved template (or the
  // built-in default), merged with this invoice's real numbers — so what
  // the popup shows is exactly what would go out, not raw {{placeholders}}.
  const sendTemplate = getTemplate(invoice.business, "invoice");
  const sendVars = {
    business_name: invoice.business?.name || "",
    customer_name: invoice.customer?.name || "there",
    document_number: invoice.invoice_number,
    amount: Number(invoice.total).toFixed(2),
    balance_due: Number(invoice.balance_due).toFixed(2),
    due_date: invoice.due_date ? ` (due ${invoice.due_date})` : "",
  };
  const sendDefaults = {
    subject: mergeTemplate(sendTemplate.subject, sendVars),
    body: mergeTemplate(sendTemplate.body, sendVars),
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

  const cancelInvoice = async () => {
    setError("");
    setStatusBusy(true);
    try {
      await api.setInvoiceStatus(invoiceId, "cancelled");
      setConfirmingCancel(false);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setStatusBusy(false);
    }
  };

  const reopenInvoice = async () => {
    setError("");
    setStatusBusy(true);
    try {
      await api.setInvoiceStatus(invoiceId, "draft");
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setStatusBusy(false);
    }
  };

  // For a draft that was handed to the customer some other way — in person,
  // WhatsApp, printed and posted — rather than emailed from here. Doesn't
  // send anything itself, just moves the invoice out of Draft so it stops
  // looking unfinished on the Dashboard.
  const markAsSent = async () => {
    setError("");
    setStatusBusy(true);
    try {
      await api.setInvoiceStatus(invoiceId, "sent");
      setConfirmingMarkSent(false);
      await refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setStatusBusy(false);
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
        {canEdit && <Link className="link-btn" to={`/invoices/${invoiceId}/edit`}>Edit</Link>}
        <button onClick={() => window.print()}>Print / Save PDF</button>
        <button type="button" onClick={() => setShowSendModal(true)}>Email to Customer</button>
        {shareUrl && <button type="button" onClick={copyLink}>{copied ? "Link copied!" : "Copy shareable link"}</button>}
        {invoice.is_overdue && (
          <button type="button" onClick={sendReminder} disabled={sendingReminder}>
            {sendingReminder ? "Sending..." : "Send Payment Reminder"}
          </button>
        )}
        {invoice.balance_due > 0 && invoice.status !== "cancelled" && (
          <RecordPaymentForm balanceDue={invoice.balance_due} onRecord={recordPayment} />
        )}
        {canEdit && invoice.status === "draft" && (
          <button type="button" className="btn-secondary" onClick={() => setConfirmingMarkSent(true)}>
            Mark as Sent
          </button>
        )}
        {canEdit && invoice.status !== "cancelled" && !confirmingCancel && (
          <button type="button" onClick={() => setConfirmingCancel(true)}>Cancel Invoice</button>
        )}
        {canEdit && confirmingCancel && (
          <span className="inline-confirm">
            Cancel this invoice?
            <button type="button" onClick={cancelInvoice} disabled={statusBusy}>{statusBusy ? "Cancelling..." : "Yes, cancel it"}</button>
            <button type="button" onClick={() => setConfirmingCancel(false)} disabled={statusBusy}>No</button>
          </span>
        )}
        {canEdit && invoice.status === "cancelled" && (
          <button type="button" onClick={reopenInvoice} disabled={statusBusy}>{statusBusy ? "Reopening..." : "Reopen (mark as Draft)"}</button>
        )}
      </div>
      {reminderResult?.ok && <p className="muted no-print">Reminder sent to {reminderResult.to}.</p>}
      {reminderResult?.error && <p className="error no-print">{reminderResult.error}</p>}
      {error && <p className="error no-print">{error}</p>}

      <div className="invoice-doc invoice-full" style={{ width: standalone ? "210mm" : "100%", maxWidth: "210mm" }}>
        <FullInvoice invoice={invoice} />
      </div>

      {canEdit && <EditHistory invoiceId={invoiceId} />}

      {showSendModal && (
        <SendDocumentModal
          title={`Email Invoice ${invoice.invoice_number}`}
          defaultTo={invoice.customer?.email}
          defaultSubject={sendDefaults.subject}
          defaultBody={sendDefaults.body}
          onSend={async ({ to, subject, message }) => {
            await api.sendInvoiceEmail(invoiceId, { to, subject, message });
            await refresh();
          }}
          onClose={() => setShowSendModal(false)}
        />
      )}

      {confirmingMarkSent && (
        <ConfirmDialog
          title="Mark this invoice as Sent?"
          message="Use this if you already handed the invoice to the customer some other way — in person, WhatsApp, printed and posted — instead of emailing it from here. This doesn't send anything itself, it just takes the invoice out of Draft."
          confirmLabel="Mark as Sent"
          busy={statusBusy}
          onConfirm={markAsSent}
          onCancel={() => setConfirmingMarkSent(false)}
        />
      )}
    </div>
  );
}
