import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import SendEmailButton from "../components/SendEmailButton";
import DocumentBrandHeader from "../components/DocumentBrandHeader";
import DocumentFooter from "../components/DocumentFooter";
import { GstBreakdown, GstNote } from "../components/GstBreakdown";
import { formatMoney, formatQty, formatDate } from "../lib/format";

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
          headline={{ label: "Total Credit", value: `₹${formatMoney(creditNote.total)}` }}
          extraMeta={invoice ? [`Against Invoice: ${invoice.invoice_number}`] : []}
        />

        <div className="invoice-parties">
          <div>
            <strong>To</strong>
            <p>{customer?.name || "—"}</p>
            {customer?.billing_address && <p>{customer.billing_address}</p>}
          </div>
          <div className="invoice-dates">
            <div><span>Date :</span><span>{formatDate(creditNote.credit_note_date, creditNote.business?.date_format)}</span></div>
            {creditNote.reason && <div><span>Reason :</span><span>{creditNote.reason}</span></div>}
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
    </div>
  );
}
