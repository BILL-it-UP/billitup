import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import SendEmailButton from "../components/SendEmailButton";
import DocumentBrandHeader from "../components/DocumentBrandHeader";
import DocumentFooter from "../components/DocumentFooter";

export default function QuoteView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const [converting, setConverting] = useState(false);

  const load = () => api.getQuote(id).then(setQuote);
  useEffect(() => { load(); }, [id]);

  if (!quote) return <p className="muted">Loading...</p>;

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
        <SendEmailButton
          defaultTo={quote.customer?.email}
          onSend={(to) => api.sendQuoteEmail(id, { to })}
        />
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
          headline={{ label: "Total", value: `₹${Number(quote.total).toFixed(2)}` }}
        />

        <div className="invoice-parties">
          <div>
            <strong>To</strong>
            <p>{customer?.name || "—"}</p>
            {customer?.billing_address && <p>{customer.billing_address}</p>}
          </div>
          <div className="invoice-dates">
            <div><span>Quote Date :</span><span>{quote.quote_date}</span></div>
            {quote.expiry_date && <div><span>Valid Until :</span><span>{quote.expiry_date}</span></div>}
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
          <div><span>Sub Total</span><span>₹{Number(quote.sub_total).toFixed(2)}</span></div>
          <div><span>Discount</span><span>-₹{Number(quote.discount).toFixed(2)}</span></div>
          <div><span>Tax</span><span>₹{Number(quote.tax_total).toFixed(2)}</span></div>
          <div className="grand-total"><span>Total</span><span>₹{Number(quote.total).toFixed(2)}</span></div>
        </div>

        {quote.notes && <p className="invoice-notes">{quote.notes}</p>}

        <DocumentFooter business={business} total={quote.total} />
      </div>
    </div>
  );
}
