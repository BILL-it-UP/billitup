// Shared header for the full (A4-style) print/PDF views — logo + business
// details on the left, document number + a headline figure (balance due,
// total, or nothing) on the right. Used by Invoice/Quote/Credit Note views
// so all three documents share one consistent look.
export default function DocumentBrandHeader({ business, docLabel, docNumber, headline, extraMeta = [] }) {
  return (
    <div className="doc-brand-header">
      <div className="doc-brand-left">
        {business.logo_data_url && <img src={business.logo_data_url} alt={business.name} className="doc-logo" />}
        <h2>{business.name}</h2>
        {business.address && <p>{business.address}</p>}
        {business.phone && <p>{business.phone}</p>}
        {business.email && <p>{business.email}</p>}
        {business.website && <p>{business.website}</p>}
        {business.gstin && <p>GSTIN: {business.gstin}</p>}
      </div>
      <div className="doc-brand-right">
        <h3>{docLabel} #{docNumber}</h3>
        {headline && (
          <div className="doc-headline">
            <span className="doc-headline-label">{headline.label}</span>
            <span className="doc-headline-value">{headline.value}</span>
          </div>
        )}
        {extraMeta.map((line, i) => <p key={i} className="muted">{line}</p>)}
      </div>
    </div>
  );
}
