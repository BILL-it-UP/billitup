import { db } from "../db.js";

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Assembles a GSTR-1-style breakdown of one calendar month's outward
// invoices, for a business to hand to their tax advisor or copy into the
// GST portal / a filing tool — this builds the numbers, it does not file
// anything itself. Deliberately a practical subset of the real GSTR-1
// return, matching what a services business like Naveen's actually needs:
//
// - B2B invoices (real GSTR-1 table 4): one row per invoice per distinct
//   tax rate used on it, for every invoice raised to a customer with a
//   GSTIN on file.
// - B2C summary (table 7): invoices to a customer with no GSTIN, bucketed
//   by place of supply + rate rather than listed invoice-by-invoice, same
//   as the real return does for smaller B2C supplies.
// - Nil rated / no GST (table 8): invoices marked "No GST" — listed
//   separately since no tax applies at all.
//
// Not covered (would need real accounting-side data BillItUp doesn't
// track): exports, advances received, amendments to a prior period, and
// HSN-wise summaries. Reverse-charge invoices are included in B2B/B2C with
// "Reverse Charge" marked Y, matching how the real return still requires
// reporting the supply even though the recipient pays the tax.
export function buildGstr1Report(businessId, month) {
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(businessId);

  const invoices = db
    .prepare(
      `SELECT invoices.*, customers.name AS customer_name, customers.gstin AS customer_gstin, customers.state AS customer_state
       FROM invoices LEFT JOIN customers ON customers.id = invoices.customer_id
       WHERE invoices.business_id = ? AND invoices.status <> 'cancelled' AND invoices.deleted_at IS NULL
         AND strftime('%Y-%m', invoices.invoice_date) = ?
       ORDER BY invoices.invoice_date, invoices.invoice_number`
    )
    .all(businessId, month);

  const b2b = [];
  const b2cBucket = new Map();
  const nilRated = [];

  for (const inv of invoices) {
    const placeOfSupply = inv.customer_state || business.state || "Unknown";

    if (inv.gst_treatment === "none") {
      nilRated.push({
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        customer_name: inv.customer_name || "",
        place_of_supply: placeOfSupply,
        invoice_value: round2(inv.total),
      });
      continue;
    }

    const sameState = !!business.state && !!inv.customer_state && business.state === inv.customer_state;
    const lineItems = db.prepare("SELECT * FROM invoice_line_items WHERE invoice_id = ? ORDER BY id ASC").all(inv.id);

    // GSTR-1 reports at invoice+rate granularity — an invoice with two
    // different tax rates on its lines becomes two rows, one per rate.
    const byRate = new Map();
    for (const line of lineItems) {
      const rate = Number(line.tax_rate) || 0;
      const taxable = Number(line.qty) * Number(line.rate) - Number(line.discount);
      byRate.set(rate, (byRate.get(rate) || 0) + taxable);
    }

    for (const [rate, taxableRaw] of byRate) {
      const taxable = round2(taxableRaw);
      const taxAmount = taxable * (rate / 100);
      const cgst = sameState ? round2(taxAmount / 2) : 0;
      const sgst = sameState ? round2(taxAmount / 2) : 0;
      const igst = sameState ? 0 : round2(taxAmount);

      if (inv.customer_gstin) {
        b2b.push({
          gstin: inv.customer_gstin,
          receiver_name: inv.customer_name || "",
          invoice_number: inv.invoice_number,
          invoice_date: inv.invoice_date,
          invoice_value: round2(inv.total),
          place_of_supply: placeOfSupply,
          reverse_charge: inv.gst_treatment === "rcm" ? "Y" : "N",
          rate,
          taxable_value: taxable,
          cgst, sgst, igst,
        });
      } else {
        const key = `${placeOfSupply}|${rate}`;
        const bucket = b2cBucket.get(key) || {
          place_of_supply: placeOfSupply, rate, taxable_value: 0, cgst: 0, sgst: 0, igst: 0,
        };
        bucket.taxable_value = round2(bucket.taxable_value + taxable);
        bucket.cgst = round2(bucket.cgst + cgst);
        bucket.sgst = round2(bucket.sgst + sgst);
        bucket.igst = round2(bucket.igst + igst);
        b2cBucket.set(key, bucket);
      }
    }
  }

  const b2cSummary = Array.from(b2cBucket.values()).sort((a, b) =>
    a.place_of_supply.localeCompare(b.place_of_supply) || a.rate - b.rate
  );

  const totals = {
    b2bCount: b2b.length,
    b2bTaxableValue: round2(b2b.reduce((s, r) => s + r.taxable_value, 0)),
    b2bTax: round2(b2b.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0)),
    b2cCount: b2cSummary.length,
    b2cTaxableValue: round2(b2cSummary.reduce((s, r) => s + r.taxable_value, 0)),
    b2cTax: round2(b2cSummary.reduce((s, r) => s + r.cgst + r.sgst + r.igst, 0)),
    nilRatedCount: nilRated.length,
    nilRatedValue: round2(nilRated.reduce((s, r) => s + r.invoice_value, 0)),
  };

  return { month, businessState: business.state || null, b2b, b2cSummary, nilRated, totals };
}
