import express from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { parseCsvToObjects } from "../lib/csv.js";
import { normalizeEmail } from "../lib/normalizeEmail.js";
import { applyGstTreatment, adjustLineAmountsForTreatment } from "../lib/gst.js";

const router = express.Router();
router.use(requireAuth);

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Zoho prints money as "INR 10000.00" on some exports (Item.csv) and as a
// plain number on others (Invoice.csv). Strip anything that isn't part of
// the number itself rather than assuming one or the other.
function parseZohoAmount(str) {
  if (str == null || str === "") return 0;
  const cleaned = String(str).replace(/[^0-9.-]/g, "");
  return Number(cleaned) || 0;
}

function cleanText(v) {
  const s = (v || "").trim();
  return s || null;
}

// Same totals math as routes/invoices.js's computeLineTotals, duplicated
// rather than exported from there, so importing never risks changing how a
// normal, hand-typed invoice is created.
function computeLineTotals(lineItems) {
  let subTotal = 0;
  let taxTotal = 0;
  let discountTotal = 0;
  const computedLines = lineItems.map((line) => {
    const qty = Number(line.qty) || 0;
    const rate = Number(line.rate) || 0;
    const discount = Number(line.discount) || 0;
    const taxRate = Number(line.tax_rate) || 0;
    const lineBase = qty * rate - discount;
    const lineTax = lineBase * (taxRate / 100);
    const amount = lineBase + lineTax;
    subTotal += qty * rate;
    discountTotal += discount;
    taxTotal += lineTax;
    return { ...line, qty, rate, discount, tax_rate: taxRate, amount };
  });
  const total = subTotal - discountTotal + taxTotal;
  return { computedLines, subTotal, discountTotal, taxTotal, total };
}

// A Zoho invoice is "Draft" and nothing else lines up with BillItUp's
// draft/sent/paid/partially_paid vocabulary. "Overdue" and the rare
// "Signed" status both just mean "a real invoice, nothing paid on it yet"
// as far as BillItUp is concerned, so the actual Balance vs Total is what
// decides paid/partially_paid, exactly like recording a payment does today
// (see routes/invoices.js's POST /:id/payments).
function deriveStatus(total, balance, zohoStatus) {
  if (zohoStatus === "Draft") return "draft";
  if (balance <= 0.01) return "paid";
  if (balance < total - 0.01) return "partially_paid";
  return "sent";
}

// Item Name, case/whitespace-insensitively. The same key used to decide
// whether a Zoho item/customer/invoice already has a match in BillItUp, so
// re-running an import (e.g. after fixing one CSV) never creates duplicates.
function matchKey(name) {
  return (name || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Upserts by name: an existing item is left completely untouched (never
// overwritten with whatever the CSV says its rate is today), only a
// genuinely new name gets created. Returns a name -> id map covering both,
// so invoice lines can be linked to the item catalog when a name matches.
function importItems(businessId, csvText) {
  const rows = parseCsvToObjects(csvText);
  const existing = db.prepare("SELECT id, name FROM items WHERE business_id = ?").all(businessId);
  const byName = new Map(existing.map((i) => [matchKey(i.name), i.id]));
  const insert = db.prepare(
    `INSERT INTO items (business_id, name, description, unit, rate, tax_rate, type, sales_account, purchase_account, cost_price, purchase_description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    const name = cleanText(row["Item Name"]);
    if (!name) continue;
    const key = matchKey(name);
    if (byName.has(key)) {
      skipped++;
      continue;
    }
    const type = (row["Product Type"] || "").trim().toLowerCase() === "service" ? "service" : "goods";
    const result = insert.run(
      businessId, name, cleanText(row["Description"]), cleanText(row["Usage unit"]) || "pcs",
      parseZohoAmount(row["Rate"]), Number(row["Tax Percentage"]) || 0, type,
      cleanText(row["Account"]) || "Sales", cleanText(row["Purchase Account"]) || "Cost of Goods Sold",
      parseZohoAmount(row["Purchase Rate"]) || null, cleanText(row["Purchase Description"])
    );
    byName.set(key, result.lastInsertRowid);
    created++;
  }
  return { created, skipped, byName };
}

// Same upsert-by-name approach as items above, plus a Zoho Contact ID ->
// BillItUp customer id map so invoice rows (which reference the Zoho
// Customer ID, not the name) can be linked even when two customers share a
// display name. A business contact's Company Name is preferred over its
// Display Name, matching what Zoho itself shows as the "Customer Name" on
// that contact's own invoices.
function importCustomers(businessId, csvText) {
  const rows = parseCsvToObjects(csvText);
  const existing = db.prepare("SELECT id, name FROM customers WHERE business_id = ?").all(businessId);
  const byName = new Map(existing.map((c) => [matchKey(c.name), c.id]));
  const byZohoId = new Map();
  const insert = db.prepare(
    `INSERT INTO customers (business_id, name, phone, email, billing_address, shipping_address, pincode, country, gstin, state, portal_token)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  let created = 0;
  let skipped = 0;
  for (const row of rows) {
    const name = cleanText(row["Company Name"]) || cleanText(row["Display Name"]);
    if (!name) continue;
    const key = matchKey(name);
    let customerId = byName.get(key);
    if (customerId) {
      skipped++;
    } else {
      const billingAddress = [row["Billing Address"], row["Billing Street2"], row["Billing City"]]
        .map((s) => (s || "").trim()).filter(Boolean).join(", ") || null;
      const shippingAddress = [row["Shipping Address"], row["Shipping Street2"], row["Shipping City"]]
        .map((s) => (s || "").trim()).filter(Boolean).join(", ") || null;
      const portalToken = randomUUID().replace(/-/g, "");
      const result = insert.run(
        businessId, name, cleanText(row["Phone"]) || cleanText(row["MobilePhone"]),
        normalizeEmail(row["EmailID"]), billingAddress, shippingAddress,
        cleanText(row["Billing Code"]), cleanText(row["Billing Country"]) || "India",
        cleanText(row["CF.GST NUMBER"]), cleanText(row["Billing State"]), portalToken
      );
      customerId = result.lastInsertRowid;
      byName.set(key, customerId);
      created++;
    }
    const zohoId = cleanText(row["Contact ID"]);
    if (zohoId) byZohoId.set(zohoId, customerId);
  }
  return { created, skipped, byName, byZohoId };
}

// Invoice.csv has one row per LINE ITEM, with every header-level field
// (Total, Balance, Customer ID, dates, notes...) repeated identically on
// every line of the same invoice, so lines are grouped by Invoice Number
// first, and only the first row of each group is read for those fields.
function groupInvoiceRows(csvText) {
  const rows = parseCsvToObjects(csvText);
  const groups = new Map();
  for (const row of rows) {
    const number = cleanText(row["Invoice Number"]);
    if (!number) continue;
    if (!groups.has(number)) groups.set(number, []);
    groups.get(number).push(row);
  }
  return groups;
}

function importInvoices(business, user, csvText, { byZohoId, itemsByName, recreatePayments }) {
  const groups = groupInvoiceRows(csvText);
  const existingNumbers = new Set(
    db.prepare("SELECT invoice_number FROM invoices WHERE business_id = ?").all(business.id).map((r) => r.invoice_number)
  );
  const existingCustomersByName = new Map(
    db.prepare("SELECT id, name FROM customers WHERE business_id = ?").all(business.id).map((c) => [matchKey(c.name), c.id])
  );

  const insertInvoice = db.prepare(
    `INSERT INTO invoices
      (business_id, customer_id, invoice_number, invoice_date, due_date, terms, reference, subject, gstin, status,
       sub_total, discount, tax_total, total, balance_due, notes, terms_and_conditions, public_token,
       gst_treatment, cgst, sgst, igst, currency, approval_status, created_by_user_id, created_by_role)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertLine = db.prepare(
    `INSERT INTO invoice_line_items (invoice_id, item_id, description, qty, rate, discount, tax_rate, amount, unit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertPayment = db.prepare(
    "INSERT INTO payments (invoice_id, amount, mode, notes, paid_at, tds_amount) VALUES (?, ?, ?, ?, ?, ?)"
  );

  let created = 0;
  let paymentsCreated = 0;
  const skipped = [];
  let maxImportedNumber = 0;
  const escapedPrefix = (business.invoice_prefix || "INV-").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const numberPattern = new RegExp(`^${escapedPrefix}0*(\\d+)$`);

  for (const [invoiceNumber, lines] of groups) {
    if (existingNumbers.has(invoiceNumber)) {
      skipped.push({ invoiceNumber, reason: "already exists" });
      continue;
    }
    const header = lines[0];
    const zohoCustomerId = cleanText(header["Customer ID"]);
    const customerName = cleanText(header["Customer Name"]);
    let customerId = zohoCustomerId ? byZohoId.get(zohoCustomerId) : null;
    if (!customerId && customerName) customerId = existingCustomersByName.get(matchKey(customerName));
    if (!customerId) {
      skipped.push({ invoiceNumber, reason: `customer "${customerName || "unknown"}" not found. Import contacts first, or create this customer manually` });
      continue;
    }

    const lineItems = lines.map((row) => ({
      item_id: itemsByName.get(matchKey(row["Item Name"])) || null,
      description: cleanText(row["Item Desc"]) || cleanText(row["Item Name"]) || "Item",
      qty: parseZohoAmount(row["Quantity"]) || 1,
      rate: parseZohoAmount(row["Item Price"]),
      discount: parseZohoAmount(row["Discount Amount"]),
      tax_rate: Number(row["Item Tax %"]) || 0,
      unit: cleanText(row["Usage unit"]),
    }));

    // A nonzero "Adjustment" (rounding, a manual correction) on the invoice
    // header doesn't have anywhere else to go, so it's rolled in as its own
    // line: still counted in the imported total rather than silently dropped.
    const adjustment = parseZohoAmount(header["Adjustment"]);
    if (adjustment) {
      lineItems.push({
        item_id: null,
        description: cleanText(header["Adjustment Description"]) || "Adjustment",
        qty: 1, rate: adjustment, discount: 0, tax_rate: 0, unit: null,
      });
    }

    const { computedLines, subTotal, discountTotal, taxTotal: rawTaxTotal, total: computedTotal } = computeLineTotals(lineItems);
    const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(customerId);
    const { treatment, taxTotal, cgst, sgst, igst, total } = applyGstTreatment({
      subTotal, discountTotal, taxTotal: rawTaxTotal, treatment: "gst",
      businessState: business.state, customerState: customer?.state,
    });
    const adjustedLines = adjustLineAmountsForTreatment(computedLines, treatment);

    // Zoho's own Balance is trusted directly for what's still owed, rather
    // than re-derived. It already accounts for TDS-deducted payments the way
    // Zoho itself books them, and it's the number whoever's importing
    // actually sees on their own Zoho dashboard, so the two should never
    // quietly disagree after import.
    const zohoTotal = parseZohoAmount(header["Total"]) || computedTotal;
    const balanceDue = Math.max(0, round2(parseZohoAmount(header["Balance"])));
    const status = deriveStatus(zohoTotal, balanceDue, header["Invoice Status"]);

    const invoiceId = db.transaction(() => {
      const result = insertInvoice.run(
        business.id, customerId, invoiceNumber,
        header["Invoice Date"] || new Date().toISOString().slice(0, 10), cleanText(header["Due Date"]),
        cleanText(header["Payment Terms Label"]), cleanText(header["PurchaseOrder"]), cleanText(header["Subject"]),
        cleanText(header["CF.GST NUMBER"]) || customer?.gstin || null, status,
        round2(subTotal), round2(discountTotal), round2(taxTotal), round2(total), balanceDue,
        cleanText(header["Notes"]), cleanText(header["Terms & Conditions"]),
        randomUUID().replace(/-/g, ""), treatment, cgst, sgst, igst,
        cleanText(header["Currency Code"]) || "INR", "not_required", user.userId, user.role
      );
      const id = result.lastInsertRowid;
      for (const line of adjustedLines) {
        insertLine.run(id, line.item_id || null, line.description, line.qty, line.rate, line.discount, line.tax_rate, line.amount, line.unit || null);
      }

      if (recreatePayments && (status === "paid" || status === "partially_paid")) {
        const amountPaid = round2(total - balanceDue);
        const tdsAmt = Math.min(amountPaid, Math.max(0, parseZohoAmount(header["TDS Amount"])));
        const cashAmount = round2(amountPaid - tdsAmt);
        if (cashAmount > 0 || tdsAmt > 0) {
          insertPayment.run(
            id, cashAmount, "bank_transfer", "Imported from Zoho Books",
            header["Last Payment Date"] || header["Invoice Date"] || new Date().toISOString().slice(0, 10), tdsAmt
          );
          paymentsCreated++;
        }
      }
      return id;
    })();

    existingNumbers.add(invoiceNumber);
    created++;
    const match = invoiceNumber.match(numberPattern);
    if (match) maxImportedNumber = Math.max(maxImportedNumber, Number(match[1]));
    void invoiceId;
  }

  return { created, skipped, paymentsCreated, maxImportedNumber };
}

// Owner/Admin only. This can create a large number of customers, items,
// invoices and payments in one call, same trust level as the customer/item
// master-data routes it upserts into.
router.post("/", requireRole("owner", "admin"), (req, res) => {
  const { itemsCsv, contactsCsv, invoicesCsv, recreatePayments } = req.body;
  if (!itemsCsv && !contactsCsv && !invoicesCsv) {
    return res.status(400).json({ error: "Nothing to import. Choose at least one CSV file." });
  }

  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(req.auth.businessId);
  const summary = {
    items: { created: 0, skipped: 0 },
    customers: { created: 0, skipped: 0 },
    invoices: { created: 0, skipped: [] },
    payments: { created: 0 },
  };

  let itemsByName = new Map(
    db.prepare("SELECT id, name FROM items WHERE business_id = ?").all(business.id).map((i) => [matchKey(i.name), i.id])
  );
  let byZohoId = new Map();

  try {
    if (itemsCsv) {
      const result = importItems(business.id, itemsCsv);
      summary.items = { created: result.created, skipped: result.skipped };
      itemsByName = result.byName;
    }

    if (contactsCsv) {
      const result = importCustomers(business.id, contactsCsv);
      summary.customers = { created: result.created, skipped: result.skipped };
      byZohoId = result.byZohoId;
    }

    if (invoicesCsv) {
      const result = importInvoices(business, req.auth, invoicesCsv, {
        byZohoId, itemsByName, recreatePayments: !!recreatePayments,
      });
      summary.invoices = { created: result.created, skipped: result.skipped };
      summary.payments = { created: result.paymentsCreated };

      // Never move the counter backward, and only for the default numbering
      // scheme. A business on financial-year numbering (see
      // lib/invoiceNumbering.js) uses a completely different counter this
      // import doesn't touch.
      if (!business.reset_invoice_numbering_yearly && result.maxImportedNumber >= business.next_invoice_number) {
        db.prepare("UPDATE businesses SET next_invoice_number = ? WHERE id = ?")
          .run(result.maxImportedNumber + 1, business.id);
        summary.nextInvoiceNumber = result.maxImportedNumber + 1;
      }
    }

    res.json(summary);
  } catch (err) {
    console.error("Zoho import failed:", err);
    res.status(500).json({ error: "Import failed partway through: " + err.message + ". Anything already imported before the error stays imported, safe to fix the issue and import again, already-imported invoices are skipped automatically." });
  }
});

export default router;
