import { useState } from "react";

// A section that starts collapsed behind a "+ Add X" link and expands in
// place when clicked, matching the existing "+ Add line" pattern already
// used on the invoice line items table. For optional groups of fields that
// most invoices never need (project billing, e-way bill details, and so
// on) — so the page shows only what's relevant instead of several always
// open boxes competing for attention. Pass defaultOpen when the section
// already has values in it (editing something that used it before), so
// existing data is never hidden behind an extra click (2026-09-16).
export default function CollapsibleSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  if (!open) {
    return (
      <button type="button" className="collapsible-section-toggle" onClick={() => setOpen(true)}>
        + Add {title}
      </button>
    );
  }

  return (
    <section className="form-card collapsible-section-open">
      <div className="collapsible-section-header">
        <h2>{title}</h2>
        <button type="button" className="link-btn" onClick={() => setOpen(false)}>Hide</button>
      </div>
      {children}
    </section>
  );
}
