// Invoice numbering. By default a business just has one counter
// (businesses.next_invoice_number) that counts up forever — simple, and how
// BillItUp has always worked, so this stays the default for every existing
// installation.
//
// A business can opt in (Settings > "Reset invoice numbers every financial
// year") to Indian financial-year-based numbering instead: numbers restart
// at 1 every April, and the financial year is baked into the number itself
// (e.g. INV-2026-27-000001), which is how most Indian accounting software
// numbers invoices. This is opt-in and OFF by default specifically so it
// never changes numbering for a business that's already issued invoices
// under the old flat scheme.
import { db } from "../db.js";

// India's financial year runs 1 April to 31 March. For a date in
// Jan/Feb/Mar it belongs to the FY that STARTED the previous April.
export function financialYearKey(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0 = Jan
  const fyStart = month >= 3 ? year : year - 1; // April (index 3) onward = current calendar year
  const fyEndShort = String((fyStart + 1) % 100).padStart(2, "0");
  return { fyKey: `${fyStart}-${fyEndShort}`, fyStart, fyEndShort };
}

// Returns the invoice number to use next, AND a `commit` function that must
// be called inside the same db.transaction() as the insert, so the counter
// bump and the invoice row are always created together (never a gap or a
// duplicate number from two requests racing each other).
export function nextInvoiceNumber(business) {
  const prefix = business.invoice_prefix || "INV-";

  if (!business.reset_invoice_numbering_yearly) {
    const number = business.next_invoice_number;
    return {
      invoiceNumber: `${prefix}${String(number).padStart(6, "0")}`,
      commit: () => {
        db.prepare("UPDATE businesses SET next_invoice_number = next_invoice_number + 1 WHERE id = ?").run(business.id);
      },
    };
  }

  const { fyKey } = financialYearKey();
  let counter = db
    .prepare("SELECT next_number FROM invoice_number_counters WHERE business_id = ? AND fy_key = ?")
    .get(business.id, fyKey);
  const number = counter ? counter.next_number : 1;

  return {
    invoiceNumber: `${prefix}${fyKey}-${String(number).padStart(6, "0")}`,
    commit: () => {
      if (counter) {
        db.prepare("UPDATE invoice_number_counters SET next_number = next_number + 1 WHERE business_id = ? AND fy_key = ?")
          .run(business.id, fyKey);
      } else {
        db.prepare("INSERT INTO invoice_number_counters (business_id, fy_key, next_number) VALUES (?, ?, ?)")
          .run(business.id, fyKey, 2);
      }
    },
  };
}
