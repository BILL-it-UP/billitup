import { useState } from "react";
import { GST_RATE_OPTIONS } from "../lib/gst";

// Tax-rate picker used on Items and every line-item row — a dropdown of the
// current GST slabs (0/5/18/40) with an "Other" option that reveals a plain
// number input, for the handful of goods taxed outside those slabs
// (jewellery at 3%, the transitional 28% on tobacco/pan masala, etc).
export default function TaxRateInput({ value, onChange, className }) {
  const numericValue = value === "" || value === null || value === undefined ? 0 : Number(value);
  const isPreset = GST_RATE_OPTIONS.includes(numericValue);
  const [customMode, setCustomMode] = useState(!isPreset && value !== "" && value !== undefined);

  if (customMode) {
    return (
      <span className="tax-rate-input">
        <input
          type="number" step="0.01" className={className} value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="%"
        />
        <button type="button" className="link-btn tax-rate-back" onClick={() => { setCustomMode(false); onChange(0); }}>
          Use slab
        </button>
      </span>
    );
  }

  return (
    <select
      className={className}
      value={isPreset ? numericValue : "other"}
      onChange={(e) => {
        if (e.target.value === "other") { setCustomMode(true); return; }
        onChange(Number(e.target.value));
      }}
    >
      {GST_RATE_OPTIONS.map((rate) => (
        <option key={rate} value={rate}>{rate}%</option>
      ))}
      <option value="other">Other...</option>
    </select>
  );
}
