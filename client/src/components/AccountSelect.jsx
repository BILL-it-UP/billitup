// A grouped dropdown of Zoho-style account categories — used for an item's
// Sales Account and Purchase Account (see lib/accounts.js). Unlike
// TaxRateInput/UnitSelect this is a closed list with no "Other" custom
// entry, since these names are meant to line up with a recognizable set of
// categories rather than free text (2026-09-17).
export default function AccountSelect({ groups, value, onChange, className }) {
  return (
    <select className={className} value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select an account</option>
      {groups.map((g) => (
        <optgroup key={g.group} label={g.group}>
          {g.items.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
