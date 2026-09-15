// Direct UPI payment on an invoice (2026-09-15) — Naveen asked for a way a
// client can pay straight from the invoice or the portal, and picked the
// simplest route: a UPI QR code pointing at the business's own UPI ID,
// rather than a payment gateway. This never touches the money itself,
// same as printing a QR code on a paper invoice — the client's own UPI app
// (GPay, PhonePe, Paytm, BHIM...) opens with the amount and a note already
// filled in, they pay the business directly, and the business still marks
// the invoice paid by hand once they see it land in their bank, same as any
// other bank transfer/UPI payment today.
//
// "upi://pay?..." is the standard deep-link format every UPI app recognizes
// (NPCI's own spec) — no API key, no account with anyone, no per-transaction
// fee, which is exactly why this was picked over a gateway integration.

import QRCode from "qrcode";

export function buildUpiPaymentUri({ upiId, payeeName, amount, note }) {
  const params = new URLSearchParams();
  params.set("pa", upiId);
  if (payeeName) params.set("pn", payeeName);
  params.set("am", Number(amount).toFixed(2));
  params.set("cu", "INR");
  // Most UPI apps show (or silently truncate) a long transaction note —
  // keep it short so it never gets rejected.
  if (note) params.set("tn", String(note).slice(0, 50));
  return `upi://pay?${params.toString()}`;
}

export function buildUpiQrDataUrl(uri) {
  return QRCode.toDataURL(uri, { margin: 1, width: 240 });
}

export function buildUpiQrPngBuffer(uri) {
  return QRCode.toBuffer(uri, { type: "png", margin: 1, width: 240 });
}

// Shared "should this invoice even show a QR" check — null when there's
// nothing left to collect (paid off/cancelled) or the business hasn't set a
// UPI ID in Settings, so every call site below just checks truthiness
// instead of repeating this logic three times.
function upiUriForInvoice(business, invoice) {
  if (!business?.bank_upi_id) return null;
  const balance = Number(invoice?.balance_due);
  if (!(balance > 0) || invoice?.status === "cancelled") return null;
  return buildUpiPaymentUri({
    upiId: business.bank_upi_id,
    payeeName: business.name,
    amount: balance,
    note: invoice.invoice_number,
  });
}

// For API responses (client renders it as <img src=...>).
export async function upiQrForInvoice(business, invoice) {
  const uri = upiUriForInvoice(business, invoice);
  if (!uri) return null;
  return { uri, dataUrl: await buildUpiQrDataUrl(uri) };
}

// For pdfkit, which needs real image bytes, not a data: URL.
export async function upiQrPngBufferForInvoice(business, invoice) {
  const uri = upiUriForInvoice(business, invoice);
  if (!uri) return null;
  return buildUpiQrPngBuffer(uri);
}
