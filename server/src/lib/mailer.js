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
import { amountToWords } from "./numberToWords.js";

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

function dataUrlToBuffer(dataUrl) {
  const match = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl || "");
  return match ? Buffer.from(match[1], "base64") : null;
}

// Renders a document (invoice, quote, or credit note all share the same
// shape: branding header/parties/line-items/totals/footer) into a PDF
// buffer, mirroring the on-screen print layout as closely as pdfkit allows.
export function renderDocumentPdf({ docLabel, docNumber, docDate, extraMeta = [], business, party, partyLabel, lineItems, totals, notes, headlineLabel = "Total", headlineValue }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const headerTop = doc.y;
    let logoBottom = headerTop;
    const logoBuffer = dataUrlToBuffer(business.logo_data_url);
    if (logoBuffer) {
      try {
        doc.image(logoBuffer, 40, headerTop, { fit: [140, 50] });
        logoBottom = headerTop + 55;
      } catch {
        // Unsupported image format (pdfkit only handles PNG/JPEG) — skip the
        // logo rather than fail the whole document.
        logoBottom = headerTop;
      }
    }

    doc.fontSize(16).text(business.name || "Business", 40, logoBottom);
    doc.fontSize(9).fillColor("#555");
    if (business.address) doc.text(business.address, 40);
    if (business.phone) doc.text(business.phone, 40);
    if (business.email) doc.text(business.email, 40);
    if (business.gstin) doc.text(`GSTIN: ${business.gstin}`, 40);
    doc.fillColor("#000");
    const leftBottom = doc.y;

    doc.fontSize(14).text(`${docLabel} #${docNumber}`, 350, headerTop, { width: 205, align: "right" });
    doc.fontSize(9).fillColor("#555").text(`Date: ${docDate}`, 350, doc.y, { width: 205, align: "right" });
    for (const line of extraMeta) doc.text(line, 350, doc.y, { width: 205, align: "right" });
    if (headlineValue) {
      doc.fontSize(10).fillColor("#555").text(headlineLabel, 350, doc.y + 6, { width: 205, align: "right" });
      doc.fontSize(16).fillColor("#000").text(headlineValue, 350, doc.y, { width: 205, align: "right" });
    }
    doc.fillColor("#000");

    doc.y = Math.max(leftBottom, doc.y) + 20;

    doc.fontSize(10).text(partyLabel, 40, doc.y, { underline: true });
    doc.text(party?.name || "—");
    if (party?.billing_address) doc.text(party.billing_address);
    doc.moveDown(1);

    const tableTop = doc.y;
    doc.rect(40, tableTop, 520, 20).fill("#2b2f38");
    const cols = [40, 220, 60, 80, 80, 80];
    const headers = ["#", "Description", "Qty", "Rate", "Discount", "Amount"];
    let x = 40;
    doc.fillColor("#fff").fontSize(9);
    headers.forEach((h, i) => { doc.text(h, x + 4, tableTop + 6, { width: cols[i] - 4 }); x += cols[i]; });
    doc.fillColor("#000");

    let y = tableTop + 26;
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

    doc.y = y + 10;
    doc.fontSize(9).fillColor("#555").text(`Total In Words: ${amountToWords(totals.total)}`, 40);
    doc.fillColor("#000");

    if (notes) {
      doc.moveDown(1);
      doc.fontSize(9).fillColor("#555").text(notes);
      doc.fillColor("#000");
    }

    const hasBankDetails = business.bank_account_name || business.bank_account_number || business.bank_ifsc || business.bank_upi_id;
    if (hasBankDetails) {
      doc.moveDown(1.5);
      doc.fontSize(9).fillColor("#000");
      if (business.bank_account_name) doc.text(`Account Name: ${business.bank_account_name}`);
      if (business.bank_name) doc.text(`Bank: ${business.bank_name}`);
      if (business.bank_account_number) doc.text(`Account Number: ${business.bank_account_number}`);
      if (business.bank_ifsc) doc.text(`IFSC Code: ${business.bank_ifsc}`);
      if (business.bank_upi_id) doc.text(`UPI: ${business.bank_upi_id}`);
    }

    if (business.terms_and_conditions) {
      doc.moveDown(1);
      doc.fontSize(10).text("Terms & Conditions", { underline: true });
      doc.fontSize(8).fillColor("#555").text(business.terms_and_conditions);
      doc.fillColor("#000");
    }

    if (business.signature_data_url || business.signature_name) {
      doc.moveDown(2);
      const sigTop = doc.y;
      const sigX = 400;
      const sigBuffer = dataUrlToBuffer(business.signature_data_url);
      let lineY = sigTop + 20;
      let imageDrawn = false;
      if (sigBuffer) {
        try { doc.image(sigBuffer, sigX, sigTop, { fit: [140, 40] }); lineY = sigTop + 44; imageDrawn = true; } catch { /* skip unsupported image */ }
      }
      if (!imageDrawn) {
        doc.moveTo(sigX, lineY).lineTo(sigX + 140, lineY).strokeColor("#000").stroke();
      }
      doc.fontSize(9).text(`Authorized Signature${business.signature_name ? ` — ${business.signature_name}` : ""}`, sigX, lineY + 6, { width: 160 });
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
