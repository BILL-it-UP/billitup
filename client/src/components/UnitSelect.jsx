import { useState } from "react";
import { unitsForType } from "../lib/units";

// Unit-of-measure picker for the item form — a dropdown of common units for
// whichever Type (Goods/Service) is selected, with an "Other" option that
// reveals a plain text box for anything not on the list. Same slab-plus-
// custom-entry pattern as TaxRateInput, so both fields in the item form
// behave the same way (2026-09-16).
export default function UnitSelect({ type, value, onChange, className }) {
  const options = unitsForType(type);
  const values = options.map((o) => o.value);
  const normalized = (value || "").toLowerCase();
  const isPreset = values.includes(normalized);
  const [customMode, setCustomMode] = useState(!isPreset && Boolean(value));

  if (customMode) {
    return (
      <span className="unit-select">
        <input
          type="text" className={className} value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Unit"
        />
        <button
          type="button" className="link-btn tax-rate-back"
          onClick={() => { setCustomMode(false); onChange(options[0].value); }}
        >
          Use list
        </button>
      </span>
    );
  }

  // Service's option list is grouped (Time & Work vs Measurement, see
  // lib/units.js) so a long combined dropdown is still easy to scan; Goods
  // has no groups, so it renders as a flat list same as before (2026-09-17).
  const groups = [...new Set(options.filter((o) => o.group).map((o) => o.group))];

  return (
    <select
      className={className}
      value={isPreset ? normalized : "other"}
      onChange={(e) => {
        if (e.target.value === "other") { setCustomMode(true); return; }
        onChange(e.target.value);
      }}
    >
      {groups.length > 0
        ? groups.map((g) => (
            <optgroup key={g} label={g}>
              {options.filter((u) => u.group === g).map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </optgroup>
          ))
        : options.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
      <option value="other">Other...</option>
    </select>
  );
}
