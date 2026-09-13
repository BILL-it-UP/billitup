import { db } from "../db.js";

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// A practical helper summary for filling in GSTR-3B, the return where actual
// GST liability is declared and paid each period — separate from GSTR-1,
// which only reports individual invoices. This is deliberately a summary,
// not a line-by-line report, matching how GSTR-3B itself works.
//
// IMPORTANT: the tax amount for each bucket is recomputed directly from each
// invoice's own line items (qty * rate - discount, times that line's own
// tax_rate) — the same approach GSTR-1 uses (see gstr1.js) — rather than
// trusting the invoice-level cgst/sgst/igst columns. Those columns only
// started being populated once the GST-treatment feature was added; any
// invoice raised before that keeps a correct tax_rate on each line item (it
// always had one) but cgst/sgst/igst sit at 0. Recomputing from line items
// means this report gives the right total tax even for older invoices,
// instead of silently showing zero for them.
//
// Outward supplies are grouped by this invoice's own stored gst_treatment:
// - "gst" (regular/forward charge): the taxable value and tax the business
//   actually collected and owes — this is table 3.1(a) of the real return.
//   A reverse-charge (RCM) outward supply is ALSO reported under 3.1(a) by
//   the supplier (its taxable value counts), but the tax itself is payable
//   by the recipient, not the business raising the invoice — so it is kept
//   in its own bucket here and excluded from "tax collected".
// - "rcm": taxable value only, tax payable by the recipient directly.
// - "none": nil-rated / no-GST value, informational only — tax is always 0
//   here regardless of any stray tax_rate on a line, matching how the app
//   zeroes tax for No-GST documents at save time.
//
// Within the "gst" bucket, the recomputed tax is also split into CGST/SGST/
// IGST where the invoice's own stored split accounts for it; any leftover
// (from an invoice that predates the split, or where business/customer
// state wasn't set at the time) is reported separately as
// unsplitTax rather than silently dropped, so the total always reconciles.
//
// Purchases (from the Vendors/Purchases log) are totalled as a candidate
// figure for Table 4 (Eligible ITC) — the tax already paid on logged
// purchases for the period. This is a STARTING POINT, not a final ITC
// figure: real GSTR-3B eligibility also depends on things this software
// doesn't track (supplier GST filing status, blocked credits under section
// 17(5), any reverse-charge liability on the business's OWN purchases, and
// credit carried forward from a previous period).
export function buildGstr3bSummary(businessId, month) {
  const invoices = db
    .prepare(
      `SELECT id, gst_treatment, cgst, sgst, igst
       FROM invoices
       WHERE business_id = ? AND status <> 'cancelled' AND strftime('%Y-%m', invoice_date) = ?`
    )
    .all(businessId, month);

  const makeBucket = () => ({ count: 0, taxableValue: 0, taxAmount: 0, cgst: 0, sgst: 0, igst: 0 });
  const buckets = { gst: makeBucket(), rcm: makeBucket(), none: makeBucket() };

  const lineStmt = db.prepare("SELECT qty, rate, discount, tax_rate FROM invoice_line_items WHERE invoice_id = ?");

  for (const inv of invoices) {
    const treatment = buckets[inv.gst_treatment] ? inv.gst_treatment : "gst";
    const lines = lineStmt.all(inv.id);

    let taxable = 0;
    let tax = 0;
    for (const line of lines) {
      const lineTaxable = Number(line.qty) * Number(line.rate) - Number(line.discount || 0);
      taxable += lineTaxable;
      tax += lineTaxable * (Number(line.tax_rate) || 0) / 100;
    }
    if (treatment === "none") tax = 0; // No-GST documents never owe tax, regardless of a line's own rate.

    const b = buckets[treatment];
    b.count += 1;
    b.taxableValue += taxable;
    b.taxAmount += tax;
    b.cgst += Number(inv.cgst) || 0;
    b.sgst += Number(inv.sgst) || 0;
    b.igst += Number(inv.igst) || 0;
  }

  const finalizeOutward = (b) => {
    const taxAmount = round2(b.taxAmount);
    const cgst = round2(b.cgst);
    const sgst = round2(b.sgst);
    const igst = round2(b.igst);
    // Whatever the recomputed tax doesn't account for in the stored
    // CGST/SGST/IGST split (older invoices, or ones saved before a state
    // was set) is surfaced here instead of vanishing — the total still
    // reconciles: cgst + sgst + igst + unsplitTax === taxAmount.
    const unsplitTax = round2(Math.max(0, taxAmount - (cgst + sgst + igst)));
    return { count: b.count, taxableValue: round2(b.taxableValue), taxAmount, cgst, sgst, igst, unsplitTax };
  };

  const regular = finalizeOutward(buckets.gst);
  const reverseCharge = finalizeOutward(buckets.rcm);
  const nilRated = finalizeOutward(buckets.none);

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

  const taxCollected = regular.taxAmount; // Reverse-charge and nil-rated are excluded on purpose — see comment above.
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
