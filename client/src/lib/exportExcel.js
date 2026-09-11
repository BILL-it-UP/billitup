// Client-side .xlsx export. The rows passed in here are always the user's
// own data they've already loaded into the app (invoices, customers,
// reports...) — never a file read from disk or uploaded by someone else —
// so this only ever exercises the *write* path of the "xlsx" package
// (json_to_sheet / writeFile). Do not add a call that reads/parses an
// externally-supplied .xlsx/.csv file with this library: the npm "xlsx"
// package has known prototype-pollution/ReDoS issues in its *parser* that
// would make that unsafe. The writer used here isn't affected.
//
// Loaded lazily (dynamic import) so the ~280KB library only ever downloads
// when someone actually clicks an "Export to Excel" button, not on every
// page load.

// One sheet. `rows` is an array of plain objects — object keys become the
// header row, in the order keys first appear.
export async function exportSheet(filename, sheetName, rows) {
  await exportWorkbook(filename, [{ name: sheetName, rows }]);
}

// Multiple sheets in one workbook: sheets = [{ name, rows }, ...].
export async function exportWorkbook(filename, sheets) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.json_to_sheet(rows && rows.length > 0 ? rows : [{}]);
    // Excel sheet names are capped at 31 characters and can't repeat.
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}
