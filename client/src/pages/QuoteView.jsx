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
import { formatMoney, formatQty, formatDate } from "../lib/format";

export default function QuoteView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const [converting, setConverting] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = () => api.getQuote(id).then(setQuote);
  useEffect(() => { load(); }, [id]);
  useDocumentTitle(quote?.quote_number);

  if (!quote) return <p className="muted">Loading...</p>;

  const sendTemplate = getTemplate(quote.business, "quote");
  const sendVars = {
    business_name: quote.business?.name || "",
    customer_name: quote.customer?.name || "there",
    document_number: quote.quote_number,
    amount: Number(quote.total).toFixed(2),
    balance_due: "",
    due_date: quote.expiry_date ? ` (valid until ${quote.expiry_date})` : "",
  };
  const sendDefaults = {
    subject: mergeTemplate(sendTemplate.subject, sendVars),
    body: mergeTemplate(sendTemplate.body, sendVars),
  };

  const handleConvert = async () => {
    setError("");
    setConverting(true);
    try {
      const invoice = await api.convertQuote(id);
      navigate(`/invoices/${invoice.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setConverting(false);
    }
  };

  const { business, customer, lineItems } = quote;
  // Same two fixes as the Invoice document (FullInvoice.jsx): don't show a
  // Discount column full of "0.00"s when nothing on the quote uses it, and
  // render a multi-line description as real stacked lines rather than one
  // flat run of text (2026-09-21).
  const showDiscount = lineItems.some((l) => Number(l.discount) > 0);

  // A soft delete — the quote moves to Trash rather than vanishing outright,
  // so a misclick can always be undone (2026-09-20).
  const handleDelete = async () => {
    setDeleting(true);
    setError("");
    try {
      await api.deleteQuote(id);
      navigate("/quotes");
    } catch (err) {
      setError(err.message);
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="no-print toolbar">
        <button onClick={() => window.print()}>Print / Save PDF</button>
        <button type="button" onClick={() => setShowSendModal(true)}>Email to Customer</button>
        {quote.status !== "converted" && (
          <button onClick={handleConvert} disabled={converting}>
            {converting ? "Converting..." : "Convert to Invoice"}
          </button>
        )}
        {quote.status === "converted" && <span className="muted">Already converted to an invoice.</span>}
        <Link className="link-btn" to={`/quotes/${id}/edit`}>Edit</Link>
        <button type="button" className="link-btn" onClick={() => setConfirmingDelete(true)}>Delete</button>
        {error && <p className="error">{error}</p>}
      </div>

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this quote?"
          message={`Quote ${quote.quote_number} moves to Trash and disappears from your Quotes list. Restore it from Trash any time, or delete it permanently from there once you're sure.`}
          confirmLabel="Delete Quote"
          danger
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      <div className="invoice-doc invoice-full" style={{ width: "210mm" }}>
        <DocumentBrandHeader
          business={business} docLabel="Quote" docNumber={quote.quote_number}
          headline={{ label: "Total", value: `₹${formatMoney(quote.total)}` }}
        />

        <div className="invoice-parties">
          <div>
            <strong>To</strong>
            <p>{customer?.name || "—"}</p>
            {customer?.billing_address && <p>{customer.billing_address}</p>}
          </div>
          <div className="invoice-dates">
            <div><span>Quote Date :</span><span>{formatDate(quote.quote_date, quote.business?.date_format)}</span></div>
            {quote.expiry_date && <div><span>Valid Until :</span><span>{formatDate(quote.expiry_date, quote.business?.date_format)}</span></div>}
            {quote.reference && <div><span>Reference :</span><span>{quote.reference}</span></div>}
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
          <div><span>Sub Total</span><span>₹{formatMoney(quote.sub_total)}</span></div>
          <div><span>Discount</span><span>-₹{formatMoney(quote.discount)}</span></div>
          <GstBreakdown doc={quote} />
          <div className="grand-total"><span>Total</span><span>₹{formatMoney(quote.total)}</span></div>
        </div>
        <GstNote doc={quote} />

        {quote.notes && <p className="invoice-notes">{quote.notes}</p>}

        <DocumentFooter business={business} total={quote.total} />
      </div>

      {showSendModal && (
        <SendDocumentModal
          title={`Email Quote ${quote.quote_number}`}
          defaultTo={quote.customer?.email}
          defaultSubject={sendDefaults.subject}
          defaultBody={sendDefaults.body}
          onSend={async ({ to, subject, message }) => {
            await api.sendQuoteEmail(id, { to, subject, message });
            await load();
          }}
          onClose={() => setShowSendModal(false)}
        />
      )}
    </div>
  );
}
