import express from "express";
import { db } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { REPORTS_CATALOG, getReportDef, runReport } from "../lib/reportsCatalog.js";
import { renderReportPdf } from "../lib/reportPdf.js";

// The Report Library — a catalog of named reports (Sales by Customer,
// Invoice Details, AR Aging Summary, ...) each of which can be filtered by
// date range / customer / vendor / status and exported as Excel (client
// builds that straight from the JSON below) or PDF (rendered here). See
// lib/reportsCatalog.js for exactly what's included and why some
// Zoho-style reports were deliberately left out.
const router = express.Router();
router.use(requireAuth);

router.get("/catalog", (_req, res) => {
  res.json(
    REPORTS_CATALOG.map(({ key, name, category, description, filters, statusOptions }) => ({
      key, name, category, description, filters, statusOptions,
    }))
  );
});

function parseFilters(query) {
  const filters = {};
  if (query.from) filters.from = query.from;
  if (query.to) filters.to = query.to;
  if (query.customerId) filters.customerId = Number(query.customerId);
  if (query.vendorId) filters.vendorId = Number(query.vendorId);
  if (query.status) filters.status = query.status;
  return filters;
}

router.get("/run/:key", (req, res) => {
  const def = getReportDef(req.params.key);
  if (!def) return res.status(404).json({ error: "Unknown report" });
  const result = runReport(req.params.key, req.auth.businessId, parseFilters(req.query));
  res.json({ name: def.name, category: def.category, ...result });
});

router.get("/:key/pdf", async (req, res) => {
  const def = getReportDef(req.params.key);
  if (!def) return res.status(404).json({ error: "Unknown report" });
  const filters = parseFilters(req.query);
  const result = runReport(req.params.key, req.auth.businessId, filters);
  const business = db.prepare("SELECT name, date_format FROM businesses WHERE id = ?").get(req.auth.businessId);

  // Look up human-readable labels for the PDF's filter line — the query
  // string only carries ids.
  if (filters.customerId) {
    const customer = db.prepare("SELECT name FROM customers WHERE id = ? AND business_id = ?").get(filters.customerId, req.auth.businessId);
    if (customer) filters.customerLabel = customer.name;
  }
  if (filters.vendorId) {
    const vendor = db.prepare("SELECT name FROM vendors WHERE id = ? AND business_id = ?").get(filters.vendorId, req.auth.businessId);
    if (vendor) filters.vendorLabel = vendor.name;
  }

  try {
    const pdfBuffer = await renderReportPdf({
      title: def.name,
      businessName: business?.name,
      filters,
      dateFormat: business?.date_format,
      columns: result.columns,
      rows: result.rows,
    });
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `inline; filename="${def.key}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate PDF" });
  }
});

export default router;
