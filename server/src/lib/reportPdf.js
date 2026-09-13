import PDFDocument from "pdfkit";
import { formatDate } from "./formatDate.js";

function formatCell(value, type, dateFormat) {
  if (value === null || value === undefined || value === "") return "";
  if (type === "money") return `Rs ${Number(value).toFixed(2)}`;
  if (type === "date") return formatDate(value, dateFormat);
  return String(value);
}

// Renders any reportsCatalog.js result as a simple landscape table PDF —
// title, the filters applied, a header row, then the data rows, paginating
// (with the header row repeated) whenever a report has more rows than fit
// on one page. Deliberately plain — this is for taking numbers to a tax
// advisor or a customer, not a branded document like an invoice.
export function renderReportPdf({ title, businessName, filters, dateFormat, columns, rows }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const pageWidth = right - left;
    const colWidth = pageWidth / columns.length;
    const rowHeight = 18;
    const bottom = doc.page.height - doc.page.margins.bottom;

    function drawTableHeaderRow(y) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
      columns.forEach((col, i) => {
        doc.text(col.label, left + i * colWidth, y, { width: colWidth - 6 });
      });
      doc.font("Helvetica");
      doc.moveTo(left, y + 14).lineTo(right, y + 14).strokeColor("#ccc").stroke();
      return y + 20;
    }

    doc.font("Helvetica-Bold").fontSize(16).fillColor("#000").text(title, left, doc.y);
    doc.font("Helvetica").fontSize(9).fillColor("#555");
    if (businessName) doc.text(businessName, left, doc.y);
    const filterBits = [];
    if (filters.from || filters.to) filterBits.push(`Period: ${filters.from || "start"} to ${filters.to || "today"}`);
    if (filters.customerLabel) filterBits.push(`Customer: ${filters.customerLabel}`);
    if (filters.vendorLabel) filterBits.push(`Vendor: ${filters.vendorLabel}`);
    if (filters.status) filterBits.push(`Status: ${filters.status}`);
    if (filterBits.length > 0) doc.text(filterBits.join("  |  "), left, doc.y);
    doc.fillColor("#000");
    doc.moveDown(0.5);

    let y = drawTableHeaderRow(doc.y);
    doc.fontSize(9);

    for (const row of rows) {
      if (y + rowHeight > bottom) {
        doc.addPage();
        y = drawTableHeaderRow(doc.page.margins.top);
      }
      columns.forEach((col, i) => {
        const value = formatCell(row[col.key], col.type, dateFormat);
        doc.text(value, left + i * colWidth, y, {
          width: colWidth - 6,
          align: col.type === "money" || col.type === "number" ? "right" : "left",
        });
      });
      y += rowHeight;
    }

    if (rows.length === 0) {
      doc.fillColor("#777").text("No data for the selected filters.", left, y);
    }

    doc.end();
  });
}
