import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { getTemplate, mergeTemplate } from "../lib/emailTemplates";
import SendDocumentModal from "../components/SendDocumentModal";
import DocumentBrandHeader from "../components/DocumentBrandHeader";
import DocumentFooter from "../components/DocumentFooter";
import { GstBreakdown, GstNote } from "../components/GstBreakdown";
import { formatMoney, formatQty, formatDate } from "../lib/format";

export default function QuoteView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const [converting, setConverting] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);

  const load = () => api.getQuote(id).then(setQuote);
  useEffect(() => { load(); }, [id]);

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
        {error && <p className="error">{error}</p>}
      </div>

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
          <thead><tr><th>#</th><th>Item &amp; Description</th><th>Qty</th><th>Rate</th><th>Discount</th><th>Amount</th></tr></thead>
          <tbody>
            {lineItems.map((line, i) => (
              <tr key={line.id}>
                <td>{i + 1}</td><td>{line.description}</td><td>{formatQty(line.qty)}</td>
                <td>₹{formatMoney(line.rate)}</td><td>₹{formatMoney(line.discount)}</td>
                <td>₹{formatMoney(line.amount)}</td>
              </tr>
            ))}
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
