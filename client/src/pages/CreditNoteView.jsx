import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import SendEmailButton from "../components/SendEmailButton";
import DocumentBrandHeader from "../components/DocumentBrandHeader";
import DocumentFooter from "../components/DocumentFooter";

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
        <DocumentBrandHeader
          business={business} docLabel="Credit Note" docNumber={creditNote.credit_note_number}
          headline={{ label: "Total Credit", value: `₹${Number(creditNote.total).toFixed(2)}` }}
          extraMeta={invoice ? [`Against Invoice: ${invoice.invoice_number}`] : []}
        />

        <div className="invoice-parties">
          <div>
            <strong>To</strong>
            <p>{customer?.name || "—"}</p>
            {customer?.billing_address && <p>{customer.billing_address}</p>}
          </div>
          <div className="invoice-dates">
            <div><span>Date :</span><span>{creditNote.credit_note_date}</span></div>
            {creditNote.reason && <div><span>Reason :</span><span>{creditNote.reason}</span></div>}
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

        <DocumentFooter business={business} total={creditNote.total} />
      </div>
    </div>
  );
}
