import express from "express";
import { db } from "../db.js";
import { requireCustomerAuth } from "../middleware/auth.js";

// The logged-in customer portal — everything here runs behind
// requireCustomerAuth, which re-checks on every request that this
// customer's portal access is still turned on (see middleware/auth.js).
// Deliberately its own tiny router (not routes/customers.js) since it's a
// different identity entirely: a client, not a business user.
const router = express.Router();
router.use(requireCustomerAuth);

// Same "public safe" business fields as the no-login invoice share link —
// everything printed on a shared invoice, minus anything private to the
// business's own login (SMTP credentials above all).
function publicBusinessFields(business) {
  const {
    name, address, phone, email, website, gstin, logo_data_url,
    bank_account_name, bank_name, bank_account_number, bank_ifsc, bank_upi_id,
    terms_and_conditions, signature_data_url, signature_name, date_format,
  } = business;
  return {
    name, address, phone, email, website, gstin, logo_data_url,
    bank_account_name, bank_name, bank_account_number, bank_ifsc, bank_upi_id,
    terms_and_conditions, signature_data_url, signature_name, date_format,
  };
}

router.get("/me", (req, res) => {
  const customer = req.customer;
  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(customer.business_id);
  const invoices = db
    .prepare(
      `SELECT id, invoice_number, invoice_date, due_date, status, total, balance_due, public_token
       FROM invoices WHERE business_id = ? AND customer_id = ? AND status <> 'cancelled'
       ORDER BY invoice_date DESC, id DESC`
    )
    .all(customer.business_id, customer.id);
  res.json({
    customer: { name: customer.name, email: customer.email, phone: customer.phone },
    business: publicBusinessFields(business),
    invoices,
  });
});

export default router;
