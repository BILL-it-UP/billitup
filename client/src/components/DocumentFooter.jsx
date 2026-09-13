import { amountToWords } from "../lib/numberToWords";

// Shared footer for the full print/PDF views — amount in words, bank/payment
// details, terms & conditions, and a signature block. Each section only
// renders if the business has actually filled it in, so a business that
// hasn't set up bank details or T&C yet just gets a plain document.
export default function DocumentFooter({ business, total }) {
  const hasBankDetails = business.bank_account_name || business.bank_account_number || business.bank_ifsc || business.bank_upi_id;

  return (
    <div className="doc-footer">
      {total != null && <p className="doc-amount-words"><strong>Total In Words:</strong> {amountToWords(total)}</p>}

      {hasBankDetails && (
        <div className="doc-footer-section">
          {business.bank_account_name && <p>Account Name: {business.bank_account_name}</p>}
          {business.bank_name && <p>Bank: {business.bank_name}</p>}
          {business.bank_account_number && <p>Account Number: {business.bank_account_number}</p>}
          {business.bank_ifsc && <p>IFSC Code: {business.bank_ifsc}</p>}
          {business.bank_upi_id && <p>UPI: {business.bank_upi_id}</p>}
        </div>
      )}

      {business.terms_and_conditions && (
        <div className="doc-footer-section">
          <h4>Terms &amp; Conditions</h4>
          <p className="doc-terms">{business.terms_and_conditions}</p>
        </div>
      )}

      {(business.signature_data_url || business.signature_name) && (
        <div className="doc-signature">
          {business.signature_data_url
            ? <img src={business.signature_data_url} alt="Signature" className="doc-signature-img" />
            : <div className="doc-signature-line" />}
          <p>Authorized Signature{business.signature_name ? ` — ${business.signature_name}` : ""}</p>
        </div>
      )}

      <div className="doc-powered-by">
        <span>Powered by</span>
        <img src="/logo-header.png" alt="BillItUp" />
        <span className="doc-made-in-india">· Made with love in India</span>
      </div>
    </div>
  );
}
