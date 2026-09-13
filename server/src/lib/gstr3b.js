import { db } from "../db.js";

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// A practical helper summary for filling in GSTR-3B, the return where actual
// GST liability is declared and paid each period — separate from GSTR-1,
// which only reports individual invoices. This is deliberately a summary,
// not a line-by-line report, matching how GSTR-3B itself works.
//
// Outward supplies are grouped by this invoice's own stored gst_treatment:
// - "gst" (regular/forward charge): the taxable value and CGST/SGST/IGST the
//   business actually collected and owes — this is table 3.1(a) of the real
//   return. A reverse-charge (RCM) outward supply is ALSO reported under
//   3.1(a) by the supplier (its taxable value counts), but the tax itself is
//   payable by the recipient, not the business raising the invoice — so it
//   is kept in its own bucket here and excluded from "tax collected".
// - "rcm": taxable value only, tax payable by the recipient directly.
// - "none": nil-rated / no-GST value, informational only.
//
// Purchases (from the Vendors/Purchases log) are totalled as a candidate
// figure for Table 4 (Eligible ITC) — the tax already paid on logged
// purchases for the period. This is a STARTING POINT, not a final ITC
// figure: real GSTR-3B eligibility also depends on things this software
// doesn't track (supplier GST filing status, blocked credits under section
// 17(5), any reverse-charge liability on the business's OWN purchases, and
// credit carried forward from a previous period).
export function buildGstr3bSummary(businessId, month) {
  const outwardRows = db
    .prepare(
      `SELECT gst_treatment,
        COUNT(*) AS count,
        COALESCE(SUM(sub_total - discount), 0) AS taxable_value,
        COALESCE(SUM(cgst), 0) AS cgst,
        COALESCE(SUM(sgst), 0) AS sgst,
        COALESCE(SUM(igst), 0) AS igst
       FROM invoices
       WHERE business_id = ? AND status <> 'cancelled' AND strftime('%Y-%m', invoice_date) = ?
       GROUP BY gst_treatment`
    )
    .all(businessId, month);

  const bucket = (treatment) => {
    const row = outwardRows.find((r) => (r.gst_treatment || "gst") === treatment);
    return {
      count: row?.count || 0,
      taxableValue: round2(row?.taxable_value || 0),
      cgst: round2(row?.cgst || 0),
      sgst: round2(row?.sgst || 0),
      igst: round2(row?.igst || 0),
    };
  };

  const regular = bucket("gst");
  const reverseCharge = bucket("rcm");
  const nilRated = bucket("none");

  const purchasesRow = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount), 0) AS taxable_value, COALESCE(SUM(tax_amount), 0) AS tax_amount
       FROM purchases WHERE business_id = ? AND strftime('%Y-%m', purchase_date) = ?`
    )
    .get(businessId, month);

  const purchases = {
    count: purchasesRow.count,
    taxableValue: round2(purchasesRow.taxable_value),
    taxAmount: round2(purchasesRow.tax_amount),
  };

  const taxCollected = round2(regular.cgst + regular.sgst + regular.igst);
  const candidateItc = purchases.taxAmount;

  return {
    month,
    outward: { regular, reverseCharge, nilRated },
    purchases,
    taxCollected,
    candidateItc,
    roughNetPayable: round2(taxCollected - candidateItc),
  };
}
