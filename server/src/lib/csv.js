// A minimal RFC4180 CSV parser, hand-written rather than adding a dependency
// for something this small (same reasoning as the rest of BillItUp's
// dependency list). Handles quoted fields, embedded commas and newlines
// inside quotes, and "" as an escaped quote inside a quoted field, which
// covers what real-world exports (Zoho, Excel, Google Sheets) actually
// produce. Written for the "Import from Zoho" feature (see
// routes/zohoImport.js) but deliberately generic, not Zoho-specific.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  // Normalize line endings up front so \r\n and lone \r don't create
  // phantom blank rows on top of the real ones.
  const s = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += c;
  }
  // A file doesn't always end with a trailing newline, so flush whatever's left.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop genuinely empty lines (a blank row parses as a single empty field).
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

// Header-mapped rows: [{ "Item Name": "...", "Rate": "...", ... }, ...].
// Extra columns in a data row beyond the header are dropped; missing
// trailing columns come back as "" rather than undefined, so callers never
// need to guard every single field access.
export function parseCsvToObjects(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] !== undefined ? row[i] : "";
    });
    return obj;
  });
}
