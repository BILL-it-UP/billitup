import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../lib/api";
import FullInvoice from "../components/FullInvoice";

// Reached with no login — the destination of an invoice's "Copy shareable
// link" button, so a customer can view (and download a PDF of) exactly one
// invoice without a BillItUp account. Deliberately outside <Shell>: no nav,
// no other business data reachable from here.
export default function PublicInvoiceView() {
  const { token } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getPublicInvoice(token).then(setInvoice).catch((err) => setError(err.message));
  }, [token]);

  if (error) return <div className="public-invoice-page"><p className="error" style={{ textAlign: "center" }}>{error}</p></div>;
  if (!invoice) return <div className="public-invoice-page"><p className="muted" style={{ textAlign: "center" }}>Loading...</p></div>;

  return (
    <div className="public-invoice-page">
      <div className="no-print public-invoice-toolbar">
        <img src="/logo-header.png" alt="BillItUp" />
        <a href={api.publicInvoicePdfUrl(token)} target="_blank" rel="noreferrer">
          <button type="button">Download PDF</button>
        </a>
      </div>
      <div className="invoice-doc invoice-full" style={{ width: "210mm" }}>
        <FullInvoice invoice={invoice} />
      </div>
    </div>
  );
}
