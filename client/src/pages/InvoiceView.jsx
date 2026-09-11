import { useParams } from "react-router-dom";
import InvoiceDetail from "../components/InvoiceDetail";

// Standalone full-page invoice view (deep links from email, Reports, etc.).
// The actual toolbar + document markup lives in components/InvoiceDetail so
// this page and the master-detail Invoices list can never drift apart.
export default function InvoiceView() {
  const { id } = useParams();
  return <InvoiceDetail invoiceId={id} standalone />;
}
