// Common units of measure for the item catalog, split by Goods vs Service —
// a service business (like a law firm billing hours) never sold anything
// measured in "pcs", so it shouldn't be the only option on offer (2026-09-16).

export const GOODS_UNITS = [
  { value: "pcs", label: "Pieces (PCS)" },
  { value: "box", label: "Box" },
  { value: "dzn", label: "Dozen" },
  { value: "set", label: "Set" },
  { value: "pair", label: "Pair" },
  { value: "kg", label: "Kilograms (KG)" },
  { value: "gm", label: "Grams (GM)" },
  { value: "ltr", label: "Litres (LTR)" },
  { value: "ml", label: "Millilitres (ML)" },
  { value: "mtr", label: "Metres (MTR)" },
  { value: "cm", label: "Centimetres (CM)" },
  { value: "sqft", label: "Square Feet (SQFT)" },
  { value: "roll", label: "Roll" },
  { value: "bag", label: "Bag" },
];

export const SERVICE_UNITS = [
  { value: "hrs", label: "Hours (HRS)" },
  { value: "day", label: "Day" },
  { value: "session", label: "Session" },
  { value: "job", label: "Job / Task" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "service", label: "Service" },
];

export function unitsForType(type) {
  return type === "service" ? SERVICE_UNITS : GOODS_UNITS;
}
