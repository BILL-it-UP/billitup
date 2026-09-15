// Actually pushes a business's own export (see cloudBackupExport.js) out to
// whichever cloud accounts that business has connected (2026-09-15). Called
// once daily for every business that has at least one connection (wired
// into lib/backup.js's existing schedule) and also on-demand for just the
// requesting business when they click "Back up now" in Settings.
import { db } from "../db.js";
import { getProvider } from "./cloudBackupProviders/index.js";
import { buildBusinessExport, buildBusinessExportFilename } from "./cloudBackupExport.js";

export async function runCloudBackupsForBusiness(businessId) {
  const connections = db.prepare("SELECT * FROM cloud_backup_connections WHERE business_id = ?").all(businessId);
  if (connections.length === 0) return;

  const business = db.prepare("SELECT * FROM businesses WHERE id = ?").get(businessId);
  if (!business) return;

  const exportData = buildBusinessExport(businessId);
  const filename = buildBusinessExportFilename(business);
  const buffer = Buffer.from(JSON.stringify(exportData, null, 2), "utf8");

  for (const conn of connections) {
    try {
      const provider = getProvider(conn.provider);
      const accessToken = await provider.refreshAccessToken(conn.refresh_token);
      await provider.uploadFile(accessToken, filename, buffer);
      db.prepare(
        `UPDATE cloud_backup_connections
         SET access_token = ?, last_upload_at = datetime('now'), last_upload_status = 'ok', last_error = NULL
         WHERE id = ?`
      ).run(accessToken, conn.id);
    } catch (err) {
      console.error(`Cloud backup upload failed (business ${businessId}, ${conn.provider}):`, err);
      db.prepare(
        "UPDATE cloud_backup_connections SET last_upload_status = 'error', last_error = ? WHERE id = ?"
      ).run(String(err?.message || err), conn.id);
    }
  }
}

// Used by the existing daily backup schedule — only businesses that have
// actually connected something get a query + export built for them.
export async function runCloudBackupsForAllBusinesses() {
  const businessIds = db
    .prepare("SELECT DISTINCT business_id FROM cloud_backup_connections")
    .all()
    .map((r) => r.business_id);
  for (const id of businessIds) {
    await runCloudBackupsForBusiness(id);
  }
}
