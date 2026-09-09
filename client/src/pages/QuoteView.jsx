import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../lib/api";

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
        {quote.status !== "converted" && (
          <button onClick={handleConvert} disabled={converting}>
            {converting ? "Converting..." : "Convert to Invoice"}
          </button>
        )}
        {quote.status === "converted" && <span className="muted">Already converted to an invoice.</span>}
        {error && <p className="error">{error}</p>}
      </div>

      <div className="invoice-doc invoice-full" style={{ width: "210mm" }}>
        <div className="invoice-header">
          <div>
            <h2>{business.name}</h2>
            {business.address && <p>{business.address}</p>}
            {business.phone && <p>{business.phone}</p>}
            {business.gstin && <p>GSTIN: {business.gstin}</p>}
          </div>
          <div className="invoice-meta">
            <h3>Quote #{quote.quote_number}</h3>
          </div>
        </div>

        <div className="invoice-parties">
          <div>
            <strong>To</strong>
            <p>{customer?.name || "—"}</p>
            {customer?.billing_address && <p>{customer.billing_address}</p>}
          </div>
          <div className="invoice-dates">
            <p>Quote Date: {quote.quote_date}</p>
            {quote.expiry_date && <p>Valid Until: {quote.expiry_date}</p>}
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
          <div><span>Sub Total</span><span>₹{Number(quote.sub_total).toFixed(2)}</span></div>
          <div><span>Discount</span><span>-₹{Number(quote.discount).toFixed(2)}</span></div>
          <div><span>Tax</span><span>₹{Number(quote.tax_total).toFixed(2)}</span></div>
          <div className="grand-total"><span>Total</span><span>₹{Number(quote.total).toFixed(2)}</span></div>
        </div>

        {quote.notes && <p className="invoice-notes">{quote.notes}</p>}
      </div>
    </div>
  );
}
