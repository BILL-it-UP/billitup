// Default subject/body wording for every outgoing document email (invoice,
// quote, credit note, payment reminder), plus the simple {{placeholder}}
// merge that turns a business's own saved wording — or these defaults when
// they haven't set one — into the actual subject/body that gets sent.
//
// This same file's content is mirrored at server/src/lib/emailTemplates.js
// so the "Email to Customer" popup here can show the real, filled-in text
// for review before sending, not just a raw template with {{tokens}} still
// in it. The server never trusts what the client computed though — a
// request that skips subject/message (any non-UI caller) still gets a
// correctly merged email from the server's own copy (2026-09-15).
export const DEFAULT_TEMPLATES = {
  invoice: {
    subject: "Invoice {{document_number}} from {{business_name}}",
    body: "Hi {{customer_name}},\n\nPlease find attached invoice {{document_number}} for Rs {{amount}}.\n\nThanks,\n{{business_name}}",
  },
  quote: {
    subject: "Quote {{document_number}} from {{business_name}}",
    body: "Hi {{customer_name}},\n\nPlease find attached quote {{document_number}} for Rs {{amount}}.\n\nThanks,\n{{business_name}}",
  },
  credit_note: {
    subject: "Credit Note {{document_number}} from {{business_name}}",
    body: "Hi {{customer_name}},\n\nPlease find attached credit note {{document_number}} for Rs {{amount}}.\n\nThanks,\n{{business_name}}",
  },
  reminder: {
    subject: "Payment Reminder: Invoice {{document_number}} from {{business_name}}",
    body: "Hi {{customer_name}},\n\nThis is a reminder that invoice {{document_number}}{{due_date}} for Rs {{amount}} has a balance of Rs {{balance_due}} still outstanding. The invoice is attached again for reference.\n\nThanks,\n{{business_name}}",
  },
  receipt: {
    subject: "Payment received for Invoice {{document_number}} from {{business_name}}",
    body: "Hi {{customer_name}},\n\nThank you. We've received your payment of Rs {{amount_paid}} for invoice {{document_number}}.{{status_line}}\n\nThanks,\n{{business_name}}",
  },
};

// Vars are passed in already display-formatted (amounts as "1234.00",
// due_date as either "" or " (due 12/09/2026)") so this stays a dumb,
// predictable string replace with no date/number logic of its own.
export function mergeTemplate(str, vars) {
  return String(str || "").replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] != null ? String(vars[key]) : ""));
}

// business.email_subject_<type> / email_body_<type> is the business's own
// saved override (Settings → Email Templates); an empty/unset one falls
// back to the built-in default above rather than sending a blank email.
export function getTemplate(business, type) {
  const fallback = DEFAULT_TEMPLATES[type];
  const subject = (business && business[`email_subject_${type}`]) || fallback.subject;
  const body = (business && business[`email_body_${type}`]) || fallback.body;
  return { subject, body };
}
