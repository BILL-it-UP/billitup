// Automatic payment reminder emails (2026-09-16). BillItUp already had a
// manual "Send Payment Reminder" button on every invoice (routes/invoices.js
// POST /:id/send with reminder:true) — this reuses the exact same template
// and rendering approach, just triggered by a background job instead of a
// click, for a business that turns it on in Settings > Email.
//
// Two kinds of reminder, both optional and independently configurable:
//  - "coming due": sent once, reminder_days_before_due days before due_date.
//  - "overdue": sent once the invoice is past due, then repeated every
//    reminder_overdue_repeat_days while it stays unpaid.
// Either is turned off by setting its day count to 0. Both are tracked per
// invoice (reminder_before_due_sent_at / last_overdue_reminder_sent_at) so
// re-running this job often (see index.js) never double-sends.
import { db } from "../db.js";
import { renderDocumentPdf, sendDocumentEmail, renderEmailHtml, SmtpNotConfiguredError } from "./mailer.js";
import { formatDate } from "./formatDate.js";
import { getTemplate, mergeTemplate } from "./emailTemplates.js";
import { upiQrPngBufferForInvoice } from "./upiQr.js";
import { computeProjectProgress } from "./projectProgress.js";
import { logError } from "./errorLog.js";

function daysBetween(fromIsoDate, toIsoDate) {
  const from = new Date(`${fromIsoDate}T00:00:00Z`);
  const to = new Date(`${toIsoDate}T00:00:00Z`);
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

// Builds and sends one reminder email for one invoice — the same subject/
// body template, PDF, and branded HTML the manual reminder button uses.
async function sendReminderForInvoice(business, invoice) {
  const customer = invoice.customer_id ? db.prepare("SELECT * FROM customers WHERE id = ?").get(invoice.customer_id) : null;
  if (!customer?.email) return false;

  const lineItems = db.prepare("SELECT * FROM invoice_line_items WHERE invoice_id = ?").all(invoice.id);
  const progress = computeProjectProgress(invoice);
  const templateVars = {
    business_name: business.name || "",
    customer_name: customer.name || "there",
    document_number: invoice.invoice_number,
    amount: Number(invoice.total).toFixed(2),
    balance_due: Number(invoice.balance_due).toFixed(2),
    due_date: invoice.due_date ? ` (due ${formatDate(invoice.due_date, business.date_format)})` : "",
  };
  const template = getTemplate(business, "reminder");
  const subject = mergeTemplate(template.subject, templateVars);
  const bodyText = mergeTemplate(template.body, templateVars);

  const upiQrPngBuffer = await upiQrPngBufferForInvoice(business, invoice);
  const pdfBuffer = await renderDocumentPdf({
    docLabel: "Invoice", docNumber: invoice.invoice_number, docDate: formatDate(invoice.invoice_date, business.date_format),
    headlineLabel: "Balance Due", headlineValue: `${invoice.currency && invoice.currency !== "INR" ? invoice.currency : "Rs"} ${Number(invoice.balance_due).toFixed(2)}`,
    business, party: customer, partyLabel: "Bill To", lineItems,
    totals: { ...invoice, ...progress }, notes: invoice.notes, upiQrPngBuffer,
  });
  const appUrl = (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");
  const ctaUrl = invoice.public_token ? `${appUrl}/view/invoice/${invoice.public_token}` : null;
  const html = renderEmailHtml({
    business, bodyText, ctaUrl, ctaLabel: "View Invoice",
    summaryRows: [
      ["Invoice Number", invoice.invoice_number],
      ["Balance Due", `${templateVars.balance_due}`],
      ...(invoice.due_date ? [["Due Date", formatDate(invoice.due_date, business.date_format)]] : []),
    ],
  });
  await sendDocumentEmail({
    business, to: customer.email, subject, text: bodyText, html,
    pdfBuffer, pdfFilename: `${invoice.invoice_number}.pdf`,
  });
  return true;
}

// Runs at server startup and on an interval (see index.js). Cheap to call
// often: a given invoice only ever matches one of the two conditions below
// until its own sent-at column moves past it.
export async function runDueReminders() {
  const businesses = db
    .prepare(
      `SELECT * FROM businesses
       WHERE reminders_enabled = 1 AND smtp_host IS NOT NULL AND smtp_user IS NOT NULL AND smtp_pass IS NOT NULL`
    )
    .all();

  let sentCount = 0;
  for (const business of businesses) {
    const beforeDueDays = Number(business.reminder_days_before_due) || 0;
    const overdueRepeatDays = Number(business.reminder_overdue_repeat_days) || 0;
    if (beforeDueDays <= 0 && overdueRepeatDays <= 0) continue;

    const candidates = db
      .prepare(
        `SELECT * FROM invoices
         WHERE business_id = ? AND status NOT IN ('draft', 'paid', 'cancelled')
           AND balance_due > 0 AND due_date IS NOT NULL`
      )
      .all(business.id);

    const today = new Date().toISOString().slice(0, 10);
    for (const invoice of candidates) {
      const daysUntilDue = daysBetween(today, invoice.due_date); // negative once overdue
      try {
        if (beforeDueDays > 0 && !invoice.reminder_before_due_sent_at && daysUntilDue === beforeDueDays) {
          const sent = await sendReminderForInvoice(business, invoice);
          if (sent) {
            db.prepare("UPDATE invoices SET reminder_before_due_sent_at = datetime('now') WHERE id = ?").run(invoice.id);
            sentCount++;
          }
        } else if (overdueRepeatDays > 0 && daysUntilDue < 0) {
          const dueForRepeat = !invoice.last_overdue_reminder_sent_at
            || daysBetween(invoice.last_overdue_reminder_sent_at.slice(0, 10), today) >= overdueRepeatDays;
          if (dueForRepeat) {
            const sent = await sendReminderForInvoice(business, invoice);
            if (sent) {
              db.prepare("UPDATE invoices SET last_overdue_reminder_sent_at = datetime('now') WHERE id = ?").run(invoice.id);
              sentCount++;
            }
          }
        }
      } catch (err) {
        // One business's bad/expired SMTP password shouldn't stop every
        // other business's reminders from going out — log it against that
        // business so it shows up on their own Business Health page in
        // Master Admin, same as any other server error, and move on.
        if (!(err instanceof SmtpNotConfiguredError)) {
          console.error(`Automatic reminder failed for invoice #${invoice.id}:`, err.message);
        }
        logError({ businessId: business.id, source: "server", route: "automatic-reminder", message: err?.message || String(err) });
      }
    }
  }
  return sentCount;
}
