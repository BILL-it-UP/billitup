import { formatMoney } from "../lib/format";

// Shown inside a document's totals box instead of one flat "Tax" line,
// whenever the CGST/SGST/IGST split is known — same-state supplies split the
// tax into CGST+SGST, inter-state supplies show it as IGST. Falls back to a
// single "Tax" line for older documents saved before this split existed
// (cgst/sgst/igst all zero but tax_total isn't).
export function GstBreakdown({ doc }) {
  const cgst = Number(doc.cgst) || 0;
  const sgst = Number(doc.sgst) || 0;
  const igst = Number(doc.igst) || 0;
  const taxTotal = Number(doc.tax_total) || 0;
  const taxLabel = doc.gst_treatment === "rcm" ? " (reverse charge)" : "";

  if (!cgst && !sgst && !igst) {
    return <div><span>Tax{taxLabel}</span><span>₹{formatMoney(taxTotal)}</span></div>;
  }

  return (
    <>
      {cgst > 0 && <div><span>CGST{taxLabel}</span><span>₹{formatMoney(cgst)}</span></div>}
      {sgst > 0 && <div><span>SGST{taxLabel}</span><span>₹{formatMoney(sgst)}</span></div>}
      {igst > 0 && <div><span>IGST{taxLabel}</span><span>₹{formatMoney(igst)}</span></div>}
    </>
  );
}

// A short explanatory line under the totals box for the two non-default GST
// treatments, so the reason the total looks the way it does is never a mystery.
export function GstNote({ doc }) {
  if (doc.gst_treatment === "rcm") {
    return (
      <p className="muted doc-gst-note">
        Tax payable on reverse charge basis: Yes. GST shown above is payable by the recipient directly to the
        government and is not included in the amount above.
      </p>
    );
  }
  if (doc.gst_treatment === "none") {
    return <p className="muted doc-gst-note">No GST charged on this document.</p>;
  }
  return null;
}
