// Automated database backups. BillItUp's entire dataset lives in one SQLite
// file, so protecting it is just: take a safe copy on a schedule, keep the
// last N of them, and let the business decide where that folder lives (e.g.
// pointed at a OneDrive/Google Drive synced folder so backups also land in
// the cloud automatically, with no separate cloud-storage integration to
// build or pay for).
import path from "node:path";
import fs from "node:fs";
import { db, dbPath } from "../db.js";

// Reuses the same dbPath the database itself resolved (see db.js) rather
// than recomputing it here, so this can never point at a different file
// than the one actually being backed up.
const BACKUP_DIR = process.env.BILLITUP_BACKUP_DIR || path.join(path.dirname(dbPath), "backups");
const KEEP = Math.max(1, Number(process.env.BILLITUP_BACKUP_KEEP) || 30);
const INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

function pad(n) {
  return String(n).padStart(2, "0");
}

function timestampedFilename() {
  const d = new Date();
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `billitup-backup-${stamp}.sqlite`;
}

function listBackupFiles() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith("billitup-backup-") && f.endsWith(".sqlite"))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { file: f, at: stat.mtime.toISOString(), sizeBytes: stat.size, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function pruneOldBackups() {
  const files = listBackupFiles();
  for (const old of files.slice(KEEP)) {
    fs.unlinkSync(path.join(BACKUP_DIR, old.file));
  }
}

// Takes a consistent snapshot of the LIVE database via better-sqlite3's own
// backup API — this is the SQLite "Online Backup" mechanism, safe to run
// while the server is handling requests. Deliberately NOT a plain file copy
// (fs.copyFile) of the .sqlite file, which can grab it mid-write (especially
// in WAL mode) and produce a corrupt, unusable backup.
export async function runBackup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const dest = path.join(BACKUP_DIR, timestampedFilename());
  await db.backup(dest);
  pruneOldBackups();
  console.log(`Backup complete -> ${dest}`);
  return getBackupStatus();
}

// Always re-derived from what's actually on disk (not an in-memory flag),
// so this reports correctly even right after a server restart, before the
// next scheduled backup has run.
export function getBackupStatus() {
  const files = listBackupFiles();
  const last = files[0] ? { file: files[0].file, at: files[0].at, sizeBytes: files[0].sizeBytes } : null;
  return { dir: BACKUP_DIR, keep: KEEP, count: files.length, last };
}

export function startBackupSchedule() {
  // Run once shortly after startup — catches a business whose server wasn't
  // running at whatever time backups would otherwise fire, same reasoning
  // as the recurring-invoices startup check — then once every 24 hours.
  setTimeout(() => runBackup().catch((err) => console.error("Backup failed:", err)), 15_000);
  setInterval(() => runBackup().catch((err) => console.error("Backup failed:", err)), INTERVAL_MS);
}
