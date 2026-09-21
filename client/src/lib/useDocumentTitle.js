import { useEffect } from "react";

// Sets the browser tab's title to something specific to what's on screen,
// an invoice, quote, or credit note number, instead of the app's generic
// title. This matters for more than the tab label: it's also what a browser
// suggests as the file name when printing to PDF or saving the page, so
// without this, "Print / Save PDF" on an invoice always offered to save as
// the site's own title rather than something like "INV-000214.pdf"
// (reported 2026-09-21, alongside Naveen comparing our printed invoice
// against a real one from Zoho). Restores whatever title was there before,
// on unmount, so navigating away hands the tab back to the app's own title
// rather than leaving it stuck on the last document viewed.
export function useDocumentTitle(title) {
  useEffect(() => {
    if (!title) return undefined;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
