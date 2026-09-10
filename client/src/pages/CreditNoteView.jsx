import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import SendEmailButton from "../components/SendEmailButton";

export default function CreditNoteView() {
  const { id } = useParams();
  const [creditNote, setCreditNote] = useState(null);

  useEffect(() => { api.getCreditNote(id).then(setCreditNote); }, [id]);

  if (!creditNote) return <p className="muted">Loading...</p>;

  const { business, customer, invoice, lineItems } = creditNote;

  return (
    <div>
      <div className="no-print toolbar">
        <button onClick={() => window.print()}>Print / Save PDF</button>
        <SendEmailButton
          defaultTo={customer?.email}
          onSend={(to) => api.sendCreditNoteEmail(id, { to })}
        />
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
            <h3>Credit Note #{creditNote.credit_note_number}</h3>
            {invoice && <p>Against Invoice: {invoice.invoice_number}</p>}
          </div>
        </div>

        <div className="invoice-parties">
          <div>
            <strong>To</strong>
            <p>{customer?.name || "—"}</p>
            {customer?.billing_address && <p>{customer.billing_address}</p>}
          </div>
          <div className="invoice-dates">
            <p>Date: {creditNote.credit_note_date}</p>
            {creditNote.reason && <p>Reason: {creditNote.reason}</p>}
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
          <div><span>Sub Total</span><span>₹{Number(creditNote.sub_total).toFixed(2)}</span></div>
          <div><span>Discount</span><span>-₹{Number(creditNote.discount).toFixed(2)}</span></div>
          <div><span>Tax</span><span>₹{Number(creditNote.tax_total).toFixed(2)}</span></div>
          <div className="grand-total"><span>Total Credit</span><span>₹{Number(creditNote.total).toFixed(2)}</span></div>
        </div>

        {creditNote.notes && <p className="invoice-notes">{creditNote.notes}</p>}
        {invoice && (
          <p className="no-print muted">
            <Link to={`/invoices/${invoice.id}`}>View original invoice {invoice.invoice_number} →</Link>
          </p>
        )}
      </div>
    </div>
  );
}
