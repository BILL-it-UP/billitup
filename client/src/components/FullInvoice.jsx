import DocumentBrandHeader from "./DocumentBrandHeader";
import DocumentFooter from "./DocumentFooter";

// The actual A4 invoice document — shared by the authenticated Invoice
// detail view, the master-detail Invoices list, and the public (no-login)
// invoice page, so all three can never drift apart visually.
export default function FullInvoice({ invoice }) {
  const { business, customer, lineItems } = invoice;
  return (
    <>
      <DocumentBrandHeader
        business={business} docLabel="Invoice" docNumber={invoice.invoice_number}
        headline={{ label: "Balance Due", value: `₹${Number(invoice.balance_due).toFixed(2)}` }}
      />

      <div className="invoice-parties">
        <div>
          <strong>Bill To</strong>
          <p>{customer?.name || "Walk-in customer"}</p>
          {customer?.billing_address && <p>{customer.billing_address}</p>}
          {(invoice.gstin || customer?.gstin) && <p>GSTIN: {invoice.gstin || customer.gstin}</p>}
        </div>
        <div className="invoice-dates">
          <div><span>Invoice Date :</span><span>{invoice.invoice_date}</span></div>
          {invoice.terms && <div><span>Terms :</span><span>{invoice.terms}</span></div>}
          {invoice.due_date && <div><span>Due Date :</span><span>{invoice.due_date}</span></div>}
          {invoice.reference && <div><span>Reference :</span><span>{invoice.reference}</span></div>}
        </div>
      </div>

      {invoice.subject && <p className="invoice-subject"><strong>Subject:</strong> {invoice.subject}</p>}

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
        <div><span>Sub Total</span><span>₹{Number(invoice.sub_total).toFixed(2)}</span></div>
        <div><span>Discount</span><span>-₹{Number(invoice.discount).toFixed(2)}</span></div>
        <div><span>Tax</span><span>₹{Number(invoice.tax_total).toFixed(2)}</span></div>
        <div className="grand-total"><span>Total</span><span>₹{Number(invoice.total).toFixed(2)}</span></div>
        <div className="doc-balance-due-row"><span>Balance Due</span><span>₹{Number(invoice.balance_due).toFixed(2)}</span></div>
      </div>

      {invoice.notes && <p className="invoice-notes">{invoice.notes}</p>}

      <DocumentFooter business={business} total={invoice.total} />
    </>
  );
}
