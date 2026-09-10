// Email + PDF generation for sending invoices/quotes straight to a customer.
//
// Every self-hosted business brings its own SMTP account (a Gmail app password,
// a transactional-email provider, whatever they already use) — BillItUp never
// routes mail through a shared relay, since that would need per-business abuse
// controls and ongoing cost that doesn't fit a free, self-hosted tool.
//
// PDFs are drawn with pdfkit rather than a headless-browser screenshot of the
// print view, so self-hosting stays a single lightweight Docker image (no
// bundled Chromium).

import PDFDocument from "pdfkit";
import nodemailer from "nodemailer";

export class SmtpNotConfiguredError extends Error {
  constructor() {
    super("Email is not set up yet. Add SMTP settings in Business Settings first.");
    this.name = "SmtpNotConfiguredError";
  }
}

export function buildTransport(business) {
  if (!business.smtp_host || !business.smtp_user || !business.smtp_pass) {
    throw new SmtpNotConfiguredError();
  }
  return nodemailer.createTransport({
    host: business.smtp_host,
    port: business.smtp_port || 587,
    secure: !!business.smtp_secure,
    auth: { user: business.smtp_user, pass: business.smtp_pass },
  });
}

// Renders a simple, clean A4-ish document (invoice, quote, or credit note all
// share the same shape: header/parties/line-items/totals) into a PDF buffer.
export function renderDocumentPdf({ docLabel, docNumber, docDate, extraMeta = [], business, party, partyLabel, lineItems, totals, notes }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(16).text(business.name || "Business", { continued: false });
    doc.fontSize(9).fillColor("#555");
    if (business.address) doc.text(business.address);
    if (business.phone) doc.text(business.phone);
    if (business.gstin) doc.text(`GSTIN: ${business.gstin}`);
    doc.fillColor("#000");

    doc.moveUp(business.gstin ? 4 : business.phone ? 3 : 2);
    doc.fontSize(14).text(`${docLabel} #${docNumber}`, { align: "right" });
    doc.fontSize(9).fillColor("#555").text(`Date: ${docDate}`, { align: "right" });
    for (const line of extraMeta) doc.text(line, { align: "right" });
    doc.fillColor("#000");
    doc.moveDown(1.5);

    doc.fontSize(10).text(partyLabel, { underline: true });
    doc.text(party?.name || "—");
    if (party?.billing_address) doc.text(party.billing_address);
    doc.moveDown(1);

    const tableTop = doc.y;
    const cols = [40, 220, 60, 80, 80, 80];
    const headers = ["#", "Description", "Qty", "Rate", "Discount", "Amount"];
    let x = 40;
    doc.fontSize(9).fillColor("#555");
    headers.forEach((h, i) => { doc.text(h, x, tableTop, { width: cols[i] }); x += cols[i]; });
    doc.fillColor("#000");
    doc.moveTo(40, tableTop + 14).lineTo(560, tableTop + 14).strokeColor("#ddd").stroke();

    let y = tableTop + 20;
    lineItems.forEach((line, i) => {
      x = 40;
      const cells = [String(i + 1), line.description, String(line.qty), `Rs ${Number(line.rate).toFixed(2)}`, `Rs ${Number(line.discount).toFixed(2)}`, `Rs ${Number(line.amount).toFixed(2)}`];
      cells.forEach((c, ci) => { doc.fontSize(9).text(c, x, y, { width: cols[ci] }); x += cols[ci]; });
      y += 18;
    });

    doc.moveTo(40, y + 4).lineTo(560, y + 4).strokeColor("#ddd").stroke();
    y += 14;
    const totalLines = [
      ["Sub Total", totals.sub_total],
      ["Discount", -totals.discount],
      ["Tax", totals.tax_total],
      ["Total", totals.total],
    ];
    totalLines.forEach(([label, val]) => {
      doc.fontSize(label === "Total" ? 11 : 9).text(label, 380, y, { width: 100 });
      doc.text(`Rs ${Number(val).toFixed(2)}`, 480, y, { width: 80, align: "right" });
      y += 16;
    });

    if (notes) {
      doc.moveDown(2);
      doc.fontSize(9).fillColor("#555").text(notes);
    }

    doc.end();
  });
}

export async function sendDocumentEmail({ business, to, subject, text, pdfBuffer, pdfFilename }) {
  const transport = buildTransport(business);
  const fromEmail = business.smtp_from_email || business.smtp_user;
  const fromName = business.smtp_from_name || business.name || "BillItUp";
  await transport.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    text,
    attachments: [{ filename: pdfFilename, content: pdfBuffer }],
  });
}
