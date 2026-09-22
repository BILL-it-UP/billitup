import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { getTemplate, mergeTemplate } from "../lib/emailTemplates";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import SendDocumentModal from "../components/SendDocumentModal";
import DocumentBrandHeader from "../components/DocumentBrandHeader";
import DocumentFooter from "../components/DocumentFooter";
import ConfirmDialog from "../components/ConfirmDialog";
import { GstBreakdown, GstNote } from "../components/GstBreakdown";
import { formatMoney, formatQty, formatDate, formatAddressLines } from "../lib/format";

export default function CreditNoteView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [creditNote, setCreditNote] = useState(null);
  const [showSendModal, setShowSendModal] = useState(false);
  const [error, setError] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = () => api.getCreditNote(id).then(setCreditNote);
  useEffect(() => { load(); }, [id]);
  useDocumentTitle(creditNote?.credit_note_number);

  if (!creditNote) return <p className="muted">Loading...</p>;

  // A soft delete — the credit note moves to Trash rather than vanishing
  // outright, and moves the credit it applied back onto its invoice's
  // balance at the same time, so a misclick can always be undone (2026-09-20).
  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await api.deleteCreditNote(id);
      navigate("/credit-notes");
    } catch (err) {
      setError(err.message);
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const { business, customer, invoice, lineItems } = creditNote;
  // Same two fixes as the Invoice document (FullInvoice.jsx): don't show a
  // Discount column full of "0.00"s when nothing on the credit note uses it,
  // and render a multi-line description as real stacked lines rather than
  // one flat run of text (2026-09-21).
  const showDiscount = lineItems.some((l) => Number(l.discount) > 0);

  const sendTemplate = getTemplate(business, "credit_note");
  const sendVars = {
    business_name: business?.name || "",
    customer_name: customer?.name || "there",
    document_number: creditNote.credit_note_number,
    amount: Number(creditNote.total).toFixed(2),
    balance_due: "",
    due_date: "",
  };
  const sendDefaults = {
    subject: mergeTemplate(sendTemplate.subject, sendVars),
    body: mergeTemplate(sendTemplate.body, sendVars),
  };

  return (
    <div>
      <div className="no-print toolbar">
        <button onClick={() => window.print()}>Print / Save PDF</button>
        <button type="button" onClick={() => setShowSendModal(true)}>Email to Customer</button>
        <Link className="link-btn" to={`/credit-notes/${id}/edit`}>Edit</Link>
        <button type="button" className="link-btn" onClick={() => setConfirmingDelete(true)}>Delete</button>
        {error && <p className="error">{error}</p>}
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this credit note?"
          message={`Credit Note ${creditNote.credit_note_number} moves to Trash and disappears from your Credit Notes list${invoice ? `, and ₹${formatMoney(creditNote.total)} moves back onto invoice ${invoice.invoice_number}'s balance due` : ""}. Restore it from Trash any time, or delete it permanently from there once you're sure.`}
          confirmLabel="Delete Credit Note"
          danger
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      <div className="invoice-doc invoice-full" style={{ width: "210mm" }}>
        <DocumentBrandHeader
          business={business} docLabel="Credit Note" docNumber={creditNote.credit_note_number}
          headline={{ label: "Total Credit", value: `₹${formatMoney(creditNote.total)}` }}
          extraMeta={invoice ? [`Against Invoice: ${invoice.invoice_number}`] : []}
        />

        <div className="invoice-parties">
          <div>
            <strong>To</strong>
            <p>{customer?.name || "—"}</p>
            {formatAddressLines({
              line1: customer?.billing_address, line2: customer?.billing_address_line2,
              city: customer?.billing_city, state: customer?.state,
              pincode: customer?.pincode, country: customer?.country,
            }).map((line, i) => <p key={i}>{line}</p>)}
          </div>
          <div className="invoice-dates">
            <div><span>Date :</span><span>{formatDate(creditNote.credit_note_date, creditNote.business?.date_format)}</span></div>
            {creditNote.reason && <div><span>Reason :</span><span>{creditNote.reason}</span></div>}
          </div>
        </div>

        <table className="table doc-line-items">
          <thead>
            <tr>
              <th>#</th><th>Item &amp; Description</th><th>Qty</th><th>Rate</th>
              {showDiscount && <th>Discount</th>}<th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const colCount = 5 + (showDiscount ? 1 : 0);
              // Skips section headers (see db.js's line_type comment) when
              // numbering, the same as FullInvoice.jsx (2026-09-21).
              let itemNumber = 0;
              return lineItems.map((line) => {
                if (line.line_type === "header") {
                  return (
                    <tr key={line.id} className="doc-line-header-row">
                      <td colSpan={colCount}>{line.description}</td>
                    </tr>
                  );
                }
                itemNumber += 1;
                const descLines = String(line.description || "").split("\n").filter(Boolean);
                return (
                  <tr key={line.id}>
                    <td>{itemNumber}</td>
                    <td>
                      {descLines.map((part, idx) => (
                        <div key={idx} className={idx === 0 ? "doc-line-desc-title" : "doc-line-desc-detail"}>
                          {part}
                        </div>
                      ))}
                    </td>
                    <td>{formatQty(line.qty)}</td>
                    <td>₹{formatMoney(line.rate)}</td>
                    {showDiscount && <td>₹{formatMoney(line.discount)}</td>}
                    <td>₹{formatMoney(line.amount)}</td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>

        <div className="totals-box">
          <div><span>Sub Total</span><span>₹{formatMoney(creditNote.sub_total)}</span></div>
          <div><span>Discount</span><span>-₹{formatMoney(creditNote.discount)}</span></div>
          <GstBreakdown doc={creditNote} />
          <div className="grand-total"><span>Total Credit</span><span>₹{formatMoney(creditNote.total)}</span></div>
        </div>
        <GstNote doc={creditNote} />

        {creditNote.notes && <p className="invoice-notes">{creditNote.notes}</p>}
        {invoice && (
          <p className="no-print muted">
            <Link to={`/invoices/${invoice.id}`}>View original invoice {invoice.invoice_number} →</Link>
          </p>
        )}

        <DocumentFooter business={business} total={creditNote.total} />
      </div>

      {showSendModal && (
        <SendDocumentModal
          title={`Email Credit Note ${creditNote.credit_note_number}`}
          defaultTo={customer?.email}
          defaultSubject={sendDefaults.subject}
          defaultBody={sendDefaults.body}
          onSend={async ({ to, subject, message }) => {
            await api.sendCreditNoteEmail(id, { to, subject, message });
            await load();
          }}
          onClose={() => setShowSendModal(false)}
        />
      )}
    </div>
  );
}
