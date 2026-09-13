// Indian GST helpers shared by the invoice/quote/credit-note forms and the
// Settings/Customers state pickers. Mirrors server/src/lib/gst.js (the two
// can't share a module since client and server are separate builds).

// Current slabs since the September 2025 "GST 2.0" reform — the old 12% and
// 28% general-goods slabs were folded into these; a business can still type
// any other rate for the few goods that sit outside them (jewellery at 3%,
// tobacco/pan masala's transitional 28%, etc) via the "Other" option.
export const GST_RATE_OPTIONS = [0, 5, 18, 40];

export const GST_TREATMENTS = [
  { value: "gst", label: "GST (regular)" },
  { value: "rcm", label: "Reverse charge (RCM)" },
  { value: "none", label: "No GST" },
];

export const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry",
];
