// Common units of measure for the item catalog, split by Goods vs Service —
// a service business (like a law firm billing hours) never sold anything
// measured in "pcs", so it shouldn't be the only option on offer (2026-09-16).
//
// The Goods list also carries Zoho's own unit codes (ft/in/km/lb/mg) added
// on 2026-09-17 so a business switching over from Zoho finds the same units
// here — skipping the ones that were already covered under a different
// label (e.g. Zoho's "m" is the same thing as this list's "mtr", so only one
// of the two is kept, to avoid two different values meaning the same unit).

export const GOODS_UNITS = [
  { value: "pcs", label: "Pieces (PCS)" },
  { value: "box", label: "Box" },
  { value: "dzn", label: "Dozen (DZN)" },
  { value: "set", label: "Set" },
  { value: "pair", label: "Pair" },
  { value: "kg", label: "Kilograms (KG)" },
  { value: "gm", label: "Grams (GM)" },
  { value: "mg", label: "Milligrams (MG)" },
  { value: "ltr", label: "Litres (LTR)" },
  { value: "ml", label: "Millilitres (ML)" },
  { value: "mtr", label: "Metres (MTR)" },
  { value: "cm", label: "Centimetres (CM)" },
  { value: "km", label: "Kilometres (KM)" },
  { value: "ft", label: "Feet (FT)" },
  { value: "in", label: "Inches (IN)" },
  { value: "sqft", label: "Square Feet (SQFT)" },
  { value: "lb", label: "Pounds (LB)" },
  { value: "roll", label: "Roll" },
  { value: "bag", label: "Bag" },
];

// Service units keep the original time/work-based list front and center
// (that's what most BillItUp businesses actually bill in) and now also
// offer every Goods unit underneath it, grouped separately in the dropdown —
// requested so a service business that occasionally bills, say, a metre of
// cable or a kilogram of material isn't stuck without that option either
// (2026-09-17).
export const SERVICE_UNITS = [
  { value: "hrs", label: "Hours (HRS)", group: "Time & Work" },
  { value: "day", label: "Day", group: "Time & Work" },
  { value: "session", label: "Session", group: "Time & Work" },
  { value: "job", label: "Job / Task", group: "Time & Work" },
  { value: "month", label: "Month", group: "Time & Work" },
  { value: "year", label: "Year", group: "Time & Work" },
  { value: "service", label: "Service", group: "Time & Work" },
  ...GOODS_UNITS.map((u) => ({ ...u, group: "Measurement" })),
];

export function unitsForType(type) {
  return type === "service" ? SERVICE_UNITS : GOODS_UNITS;
}
