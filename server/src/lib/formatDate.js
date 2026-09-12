// Server-side mirror of client/src/lib/format.js's formatDate — used
// wherever a date is drawn straight into a PDF (pdfkit has no access to the
// client's formatter). Keep the two in sync if the supported formats change.
export function formatDate(value, format) {
  if (!value) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, yyyy, mm, dd] = match;
  switch (format) {
    case "MM/DD/YYYY":
      return `${mm}/${dd}/${yyyy}`;
    case "YYYY-MM-DD":
      return `${yyyy}-${mm}-${dd}`;
    case "DD/MM/YYYY":
    default:
      return `${dd}/${mm}/${yyyy}`;
  }
}
