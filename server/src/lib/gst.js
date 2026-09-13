// Indian GST helpers, shared by invoices/quotes/credit-notes/recurring-invoices.
//
// gst_treatment on a document is one of:
//   "gst"  — regular (forward charge) GST: the tax is added to the total and
//            collected from the customer, same as BillItUp always did.
//   "rcm"  — reverse charge: the customer self-assesses and pays the GST
//            directly to the government, so it is NOT added to the amount
//            collected on this document. The tax is still calculated and
//            shown separately, marked "payable by recipient under reverse
//            charge", since the recipient needs that figure for their own
//            GST filing and the invoice needs to state RCM applies.
//   "none" — no GST at all (e.g. an unregistered business, or a supply that
//            is exempt) — no tax is calculated regardless of any line's
//            tax_rate.
export const GST_TREATMENTS = ["gst", "rcm", "none"];

// Current slabs since the September 2025 "GST 2.0" reform (0 / 5 / 18 / 40 —
// the old 12% and 28% general-goods slabs were folded into these; 28%
// survives only as a transitional rate for pan masala/tobacco). Kept as the
// quick-pick options in the UI; a business can still type any other rate for
// the handful of goods that fall outside these (jewellery at 3%, etc).
export const GST_RATE_OPTIONS = [0, 5, 18, 40];

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Splits a document's tax and total based on its GST treatment and whether
// the business and customer are in the same state (CGST+SGST) or different
// states (IGST). Returns the adjusted total/balanceBase to actually charge
// the customer — for "rcm" that excludes the tax; for "none" tax is zeroed.
export function applyGstTreatment({ subTotal, discountTotal, taxTotal, treatment, businessState, customerState }) {
  const t = GST_TREATMENTS.includes(treatment) ? treatment : "gst";

  if (t === "none") {
    return { treatment: t, taxTotal: 0, cgst: 0, sgst: 0, igst: 0, total: round2(subTotal - discountTotal) };
  }

  const sameState = !!businessState && !!customerState && businessState === customerState;
  let cgst = 0, sgst = 0, igst = 0;
  if (taxTotal > 0) {
    if (sameState) {
      cgst = round2(taxTotal / 2);
      sgst = round2(taxTotal - cgst);
    } else {
      igst = round2(taxTotal);
    }
  }

  if (t === "rcm") {
    // Tax is still computed/shown for the recipient's own filing, but is not
    // part of what this document actually collects.
    return { treatment: t, taxTotal, cgst, sgst, igst, total: round2(subTotal - discountTotal) };
  }

  // Regular GST — unchanged from BillItUp's original behaviour.
  return { treatment: t, taxTotal, cgst, sgst, igst, total: round2(subTotal - discountTotal + taxTotal) };
}

// A line's stored `amount` (qty*rate - discount + line tax) is only correct
// for regular GST — under "rcm"/"none" the tax isn't actually charged, so
// each line's printed amount should match that (base only), or the per-line
// figures on the document add up to more than the total shown below them.
export function adjustLineAmountsForTreatment(computedLines, treatment) {
  if (treatment === "gst") return computedLines;
  return computedLines.map((line) => ({
    ...line,
    amount: round2(Number(line.qty) * Number(line.rate) - Number(line.discount)),
  }));
}
