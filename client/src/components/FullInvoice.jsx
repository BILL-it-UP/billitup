import DocumentBrandHeader from "./DocumentBrandHeader";
import DocumentFooter from "./DocumentFooter";
import { GstBreakdown, GstNote } from "./GstBreakdown";
import { formatMoney, formatQty, formatDate } from "../lib/format";

// The actual A4 invoice document — shared by the authenticated Invoice
// detail view, the master-detail Invoices list, and the public (no-login)
// invoice page, so all three can never drift apart visually.
export default function FullInvoice({ invoice }) {
  const { business, customer, lineItems } = invoice;
  return (
    <>
      {invoice.status === "cancelled" && <div className="doc-cancelled-stamp">CANCELLED</div>}
      <DocumentBrandHeader
        business={business} docLabel="Invoice" docNumber={invoice.invoice_number}
        headline={{ label: "Balance Due", value: `₹${formatMoney(invoice.balance_due)}` }}
      />

      <div className="invoice-parties">
        <div>
          <strong>Bill To</strong>
          <p>{customer?.name || "Walk-in customer"}</p>
          {customer?.billing_address && <p>{customer.billing_address}</p>}
          {(invoice.gstin || customer?.gstin) && <p>GSTIN: {invoice.gstin || customer.gstin}</p>}
        </div>
        <div className="invoice-dates">
          <div><span>Invoice Date :</span><span>{formatDate(invoice.invoice_date, invoice.business?.date_format)}</span></div>
          {invoice.terms && <div><span>Terms :</span><span>{invoice.terms}</span></div>}
          {invoice.due_date && <div><span>Due Date :</span><span>{formatDate(invoice.due_date, invoice.business?.date_format)}</span></div>}
          {invoice.reference && <div><span>Reference :</span><span>{invoice.reference}</span></div>}
        </div>
      </div>

      {invoice.subject && <p className="invoice-subject"><strong>Subject:</strong> {invoice.subject}</p>}

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
        <div><span>Sub Total</span><span>₹{formatMoney(invoice.sub_total)}</span></div>
        <div><span>Discount</span><span>-₹{formatMoney(invoice.discount)}</span></div>
        <GstBreakdown doc={invoice} />
        <div className="grand-total"><span>Total</span><span>₹{formatMoney(invoice.total)}</span></div>
        <div className="doc-balance-due-row"><span>Balance Due</span><span>₹{formatMoney(invoice.balance_due)}</span></div>
      </div>
      <GstNote doc={invoice} />

      {invoice.notes && <p className="invoice-notes">{invoice.notes}</p>}

      <DocumentFooter business={business} total={invoice.total} />
    </>
  );
}
