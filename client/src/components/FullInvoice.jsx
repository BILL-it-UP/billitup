import DocumentBrandHeader from "./DocumentBrandHeader";
import DocumentFooter from "./DocumentFooter";
import { GstBreakdown, GstNote } from "./GstBreakdown";
import { formatMoney, formatQty, formatDate } from "../lib/format";
import { currencySymbol } from "../lib/currencies";

// The actual A4 invoice document — shared by the authenticated Invoice
// detail view, the master-detail Invoices list, and the public (no-login)
// invoice page, so all three can never drift apart visually.
export default function FullInvoice({ invoice }) {
  const { business, customer, lineItems } = invoice;
  const symbol = currencySymbol(invoice.currency);
  return (
    <>
      {invoice.status === "cancelled" && <div className="doc-cancelled-stamp">CANCELLED</div>}
      <DocumentBrandHeader
        business={business} docLabel="Invoice" docNumber={invoice.invoice_number}
        headline={{ label: "Balance Due", value: `${symbol}${formatMoney(invoice.balance_due)}` }}
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

      {(invoice.eway_bill_number || invoice.eway_transporter_name || invoice.eway_vehicle_number) && (
        <div className="invoice-eway">
          <strong>E-Way Bill</strong>
          <p>
            {invoice.eway_bill_number && <>E-Way Bill No: {invoice.eway_bill_number}<br /></>}
            {invoice.eway_transporter_name && (
              <>Transporter: {invoice.eway_transporter_name}{invoice.eway_transporter_id ? ` (${invoice.eway_transporter_id})` : ""}<br /></>
            )}
            {invoice.eway_vehicle_number && <>Vehicle Number: {invoice.eway_vehicle_number}<br /></>}
            {invoice.eway_distance_km ? <>Distance: {invoice.eway_distance_km} km</> : null}
          </p>
        </div>
      )}

      {invoice.project_name && (
        <div className="invoice-eway">
          <strong>Project / Milestone Billing</strong>
          <p>
            Project: {invoice.project_name}{invoice.milestone_label ? ` — ${invoice.milestone_label}` : ""}
            {invoice.project_total_amount != null && (
              <>
                <br />
                Project Total: {symbol}{formatMoney(invoice.project_total_amount)}
                {" · "}Billed To Date: {symbol}{formatMoney(invoice.project_billed_to_date)}
                {" · "}Remaining: {symbol}{formatMoney(invoice.project_remaining)}
              </>
            )}
          </p>
        </div>
      )}

      {(() => {
        // Older invoices (created before HSN/SAC and Unit were tracked per
        // line, 2026-09-17) never have these on their line items — the extra
        // column only shows up once there's actually something to put in it,
        // so a pre-existing invoice's printed layout never changes.
        const showHsn = lineItems.some((l) => l.hsn_sac_code);
        // Zoho's own printed invoices leave the Discount column off entirely
        // once a business never uses it, rather than showing a column of
        // "0.00"s on every line, a real gap Naveen flagged after comparing
        // a live Zoho invoice against ours side by side (2026-09-21). Same
        // treatment here: the column only earns its place once a line
        // actually has a discount on it.
        const showDiscount = lineItems.some((l) => Number(l.discount) > 0);
        const colCount = 5 + (showHsn ? 1 : 0) + (showDiscount ? 1 : 0);
        // A running count of real, billable lines only, skipping section
        // headers (see db.js's line_type comment) so a header never takes a
        // number of its own, the same way Zoho's own printed documents leave
        // a header row out of the numbering (2026-09-21).
        let itemNumber = 0;
        return (
          <table className="table doc-line-items">
            <thead>
              <tr>
                <th>#</th><th>Item &amp; Description</th>
                {showHsn && <th>HSN/SAC</th>}
                <th>Qty</th><th>Rate</th>{showDiscount && <th>Discount</th>}<th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line) => {
                if (line.line_type === "header") {
                  return (
                    <tr key={line.id} className="doc-line-header-row">
                      <td colSpan={colCount}>{line.description}</td>
                    </tr>
                  );
                }
                itemNumber += 1;
                // A description can be more than one line: the item's own
                // name on top, further detail (part numbers, a bundle's
                // contents) below it, the same shape Zoho prints, with the
                // first line carrying the weight. Rendered as real block
                // elements rather than relying on a literal "\n" and
                // white-space CSS, so it reads the same on screen, in the
                // printed PDF, and in the emailed copy (2026-09-21).
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
                    {showHsn && <td>{line.hsn_sac_code || ""}</td>}
                    <td>{formatQty(line.qty)}{line.unit ? ` ${line.unit}` : ""}</td>
                    <td>{symbol}{formatMoney(line.rate)}</td>
                    {showDiscount && <td>{symbol}{formatMoney(line.discount)}</td>}
                    <td>{symbol}{formatMoney(line.amount)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        );
      })()}

      <div className="totals-box">
        <div><span>Sub Total</span><span>{symbol}{formatMoney(invoice.sub_total)}</span></div>
        <div><span>Discount</span><span>-{symbol}{formatMoney(invoice.discount)}</span></div>
        <GstBreakdown doc={invoice} symbol={symbol} />
        <div className="grand-total"><span>Total</span><span>{symbol}{formatMoney(invoice.total)}</span></div>
        <div className="doc-balance-due-row"><span>Balance Due</span><span>{symbol}{formatMoney(invoice.balance_due)}</span></div>
      </div>
      <GstNote doc={invoice} />

      {invoice.notes && <p className="invoice-notes">{invoice.notes}</p>}

      <DocumentFooter
        business={business} total={invoice.total} upiQrDataUrl={invoice.upi_qr_data_url} currency={invoice.currency}
        termsAndConditions={invoice.terms_and_conditions}
      />
    </>
  );
}
