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
import { printPrefix } from "./currency.js";

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
export function renderDocumentPdf({ docLabel, docNumber, docDate, extraMeta = [], business, party, partyLabel, lineItems, totals, notes, headlineLabel = "Total", headlineValue, upiQrPngBuffer, termsAndConditions }) {
  // Which text prefix stands in for a currency symbol on this document — see
  // lib/currency.js for why this is always plain ASCII text, never a ₹/€/£
  // glyph (2026-09-16). totals.currency is the invoice's own currency
  // (defaults to INR for every document type that doesn't set one yet).
  const prefix = printPrefix(totals.currency);

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

    // Older invoices (and every Quote/Credit Note/Receipt, which never carry
    // these two per-line fields at all) simply won't have hsn_sac_code on any
    // line — the extra column only appears once there's real data for it, so
    // this stays the shared renderer for every document type without any of
    // them needing their own copy of this table (2026-09-17).
    const showHsn = lineItems.some((l) => l.hsn_sac_code);
    const tableTop = doc.y;
    doc.rect(40, tableTop, 520, 20).fill("#2b2f38");
    const cols = showHsn ? [30, 160, 70, 60, 80, 80, 80] : [40, 220, 60, 80, 80, 80];
    const headers = showHsn
      ? ["#", "Description", "HSN/SAC", "Qty", "Rate", "Discount", "Amount"]
      : ["#", "Description", "Qty", "Rate", "Discount", "Amount"];
    let x = 40;
    doc.fillColor("#fff").fontSize(9);
    headers.forEach((h, i) => { doc.text(h, x + 4, tableTop + 6, { width: cols[i] - 4 }); x += cols[i]; });
    doc.fillColor("#000");

    let y = tableTop + 26;
    lineItems.forEach((line, i) => {
      x = 40;
      const qtyWithUnit = line.unit ? `${line.qty} ${line.unit}` : String(line.qty);
      const cells = showHsn
        ? [String(i + 1), line.description, line.hsn_sac_code || "", qtyWithUnit, `${prefix} ${Number(line.rate).toFixed(2)}`, `${prefix} ${Number(line.discount).toFixed(2)}`, `${prefix} ${Number(line.amount).toFixed(2)}`]
        : [String(i + 1), line.description, qtyWithUnit, `${prefix} ${Number(line.rate).toFixed(2)}`, `${prefix} ${Number(line.discount).toFixed(2)}`, `${prefix} ${Number(line.amount).toFixed(2)}`];
      cells.forEach((c, ci) => { doc.fontSize(9).text(c, x, y, { width: cols[ci] }); x += cols[ci]; });
      y += 18;
    });

    doc.moveTo(40, y + 4).lineTo(560, y + 4).strokeColor("#ddd").stroke();
    y += 14;
    const taxSuffix = totals.gst_treatment === "rcm" ? " (reverse charge)" : "";
    const cgst = Number(totals.cgst) || 0, sgst = Number(totals.sgst) || 0, igst = Number(totals.igst) || 0;
    const taxLines = (cgst || sgst || igst)
      ? [
          ...(cgst ? [[`CGST${taxSuffix}`, cgst]] : []),
          ...(sgst ? [[`SGST${taxSuffix}`, sgst]] : []),
          ...(igst ? [[`IGST${taxSuffix}`, igst]] : []),
        ]
      : [[`Tax${taxSuffix}`, totals.tax_total]];
    const totalLines = [
      ["Sub Total", totals.sub_total],
      ["Discount", -totals.discount],
      ...taxLines,
      ["Total", totals.total],
    ];
    totalLines.forEach(([label, val]) => {
      doc.fontSize(label === "Total" ? 11 : 9).text(label, 380, y, { width: 100 });
      doc.text(`${prefix} ${Number(val).toFixed(2)}`, 480, y, { width: 80, align: "right" });
      y += 16;
    });

    doc.y = y + 10;
    if (totals.gst_treatment === "rcm") {
      doc.fontSize(8).fillColor("#555").text(
        "Tax payable on reverse charge basis: Yes. GST shown above is payable by the recipient directly to the government and is not included in the total.",
        40, doc.y, { width: 500 }
      );
      doc.moveDown(0.5);
    } else if (totals.gst_treatment === "none") {
      doc.fontSize(8).fillColor("#555").text("No GST charged on this document.", 40, doc.y);
      doc.moveDown(0.5);
    }
    doc.fontSize(9).fillColor("#555").text(`Total In Words: ${amountToWords(totals.total, totals.currency)}`, 40, doc.y);
    doc.fillColor("#000");

    if (notes) {
      doc.moveDown(1);
      doc.fontSize(9).fillColor("#555").text(notes);
      doc.fillColor("#000");
    }

    if (totals.eway_bill_number || totals.eway_transporter_name || totals.eway_vehicle_number) {
      doc.moveDown(1);
      doc.fontSize(9).fillColor("#000").text("E-Way Bill", { underline: true });
      doc.fontSize(9).fillColor("#555");
      if (totals.eway_bill_number) doc.text(`E-Way Bill No: ${totals.eway_bill_number}`);
      if (totals.eway_transporter_name) {
        doc.text(`Transporter: ${totals.eway_transporter_name}${totals.eway_transporter_id ? ` (${totals.eway_transporter_id})` : ""}`);
      }
      if (totals.eway_vehicle_number) doc.text(`Vehicle Number: ${totals.eway_vehicle_number}`);
      if (totals.eway_distance_km) doc.text(`Distance: ${totals.eway_distance_km} km`);
      doc.fillColor("#000");
    }

    // Milestone/project progress (2026-09-16) — only shown once a business
    // has actually named a project on this invoice (see lib/projectProgress.js
    // for how billed-to-date is worked out). project_total_amount is
    // optional even then, since a business might just want to label a
    // milestone without tracking against a fixed project value.
    if (totals.project_name) {
      doc.moveDown(1);
      doc.fontSize(9).fillColor("#000").text("Project / Milestone Billing", { underline: true });
      doc.fontSize(9).fillColor("#555");
      doc.text(`Project: ${totals.project_name}${totals.milestone_label ? ` — ${totals.milestone_label}` : ""}`);
      if (totals.project_total_amount) {
        doc.text(
          `Project Total: ${prefix} ${Number(totals.project_total_amount).toFixed(2)}   ·   Billed To Date: ${prefix} ${Number(totals.project_billed_to_date || 0).toFixed(2)}   ·   Remaining: ${prefix} ${Number(totals.project_remaining || 0).toFixed(2)}`
        );
      }
      doc.fillColor("#000");
    }

    const hasBankDetails = business.bank_account_name || business.bank_account_number || business.bank_ifsc || business.bank_upi_id;
    if (hasBankDetails) {
      doc.moveDown(1.5);
      const bankBlockTop = doc.y;
      doc.fontSize(9).fillColor("#000");
      if (business.bank_account_name) doc.text(`Account Name: ${business.bank_account_name}`);
      if (business.bank_name) doc.text(`Bank: ${business.bank_name}`);
      if (business.bank_account_number) doc.text(`Account Number: ${business.bank_account_number}`);
      if (business.bank_ifsc) doc.text(`IFSC Code: ${business.bank_ifsc}`);
      if (business.bank_upi_id) doc.text(`UPI: ${business.bank_upi_id}`);
      const textBottom = doc.y;

      // The QR sits beside the bank text, not below it — drawn at a fixed
      // position so it never disturbs pdfkit's own text flow, then doc.y is
      // pushed past whichever of the two ran taller so Terms/signature below
      // never overlaps it.
      if (upiQrPngBuffer) {
        try {
          doc.image(upiQrPngBuffer, 450, bankBlockTop, { fit: [90, 90] });
          doc.fontSize(7).fillColor("#555").text("Scan to pay via UPI", 440, bankBlockTop + 92, { width: 110, align: "center" });
          doc.fillColor("#000");
          doc.y = Math.max(textBottom, bankBlockTop + 106);
        } catch {
          // Shouldn't happen (qrcode always produces a valid PNG buffer), but
          // never let a QR-drawing hiccup take down the whole PDF.
        }
      }
    }

    // The document's own snapshotted Terms & Conditions (from whichever
    // saved template applied when it was created) takes priority; a document
    // from before this existed falls back to the business's old single
    // terms_and_conditions field, matching DocumentFooter.jsx (2026-09-16).
    const terms = termsAndConditions ?? business.terms_and_conditions;
    if (terms) {
      doc.moveDown(1);
      doc.fontSize(10).text("Terms & Conditions", { underline: true });
      doc.fontSize(8).fillColor("#555").text(terms);
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

    doc.fontSize(7).fillColor("#999").text("Powered by BillItUp", 40, 800, { width: 520, align: "center" });
    doc.fillColor("#000");

    doc.end();
  });
}

export async function sendDocumentEmail({ business, to, subject, text, html, pdfBuffer, pdfFilename }) {
  const transport = buildTransport(business);
  const fromEmail = business.smtp_from_email || business.smtp_user;
  const fromName = business.smtp_from_name || business.name || "BillItUp";
  await transport.sendMail({
    from: `"${fromName}" <${fromEmail}>`,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
    attachments: [{ filename: pdfFilename, content: pdfBuffer }],
  });
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// A clean, branded HTML version of the email — sent alongside the plain
// `text` above (most mail clients prefer html when both are present, and
// text is the fallback for the ones that don't). summaryRows is a list of
// [label, value] pairs (invoice number, amount, balance due, due date —
// whichever apply) rendered as a small table; ctaUrl is only passed for
// invoices, which have a public shareable link — quotes and credit notes
// don't, so they render without a button (2026-09-15).
export function renderEmailHtml({ business, bodyText, ctaLabel, ctaUrl, summaryRows = [] }) {
  const brandName = escapeHtml(business.name || "BillItUp");
  const headerInner = business.logo_data_url
    ? `<img src="${business.logo_data_url}" alt="${brandName}" style="max-height:40px;max-width:180px;display:block;" />`
    : `<span style="color:#ffffff;font-size:18px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">${brandName}</span>`;

  const summaryHtml = summaryRows.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px;border:1px solid #e2e5ea;border-radius:8px;overflow:hidden;">
        ${summaryRows.map(([label, value], i) => `
          <tr style="background:${i % 2 === 0 ? "#f7f8fa" : "#ffffff"};">
            <td style="padding:9px 14px;font-size:12px;color:#6b7280;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(label)}</td>
            <td style="padding:9px 14px;font-size:13px;color:#1c1f26;text-align:right;font-weight:600;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(value)}</td>
          </tr>`).join("")}
      </table>`
    : "";

  const ctaHtml = ctaUrl
    ? `<div style="margin-top:4px;"><a href="${ctaUrl}" style="display:inline-block;background:#1a7f5a;color:#ffffff;text-decoration:none;padding:11px 24px;border-radius:6px;font-size:13px;font-weight:700;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(ctaLabel || "View Document")}</a></div>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f7f8fa;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f8fa;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e5ea;">
          <tr><td style="background:#0a2c50;padding:20px 28px;">${headerInner}</td></tr>
          <tr><td style="padding:28px;">
            <p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:#1c1f26;white-space:pre-wrap;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(bodyText)}</p>
            ${summaryHtml}
            ${ctaHtml}
          </td></tr>
          <tr><td style="padding:16px 28px;border-top:1px solid #e2e5ea;">
            <p style="margin:0;font-size:11px;color:#9aa0aa;text-align:center;font-family:Arial,Helvetica,sans-serif;">Powered by BillItUp</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
