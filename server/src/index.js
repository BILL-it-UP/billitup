import express from "express";
import cors from "cors";
import { db } from "./db.js";
import authRouter from "./routes/auth.js";
import businessRouter from "./routes/business.js";
import customersRouter from "./routes/customers.js";
import itemsRouter from "./routes/items.js";
import termsTemplatesRouter from "./routes/terms-templates.js";
import invoicesRouter from "./routes/invoices.js";
import usersRouter from "./routes/users.js";
import quotesRouter from "./routes/quotes.js";
import reportsRouter from "./routes/reports.js";
import reportsLibraryRouter from "./routes/reportsLibrary.js";
import creditNotesRouter from "./routes/credit-notes.js";
import recurringInvoicesRouter, { runDueRecurringInvoices } from "./routes/recurring-invoices.js";
import { runDueReminders } from "./lib/paymentReminders.js";
import publicRouter from "./routes/public.js";
import portalAuthRouter from "./routes/portalAuth.js";
import portalRouter from "./routes/portal.js";
import adminRouter from "./routes/admin.js";
import paymentsRouter from "./routes/payments.js";
import vendorsRouter from "./routes/vendors.js";
import purchasesRouter from "./routes/purchases.js";
import timeEntriesRouter from "./routes/time-entries.js";
import suggestionsRouter from "./routes/suggestions.js";
import cloudBackupRouter from "./routes/cloudBackup.js";
import clientErrorsRouter from "./routes/clientErrors.js";
import supportRouter from "./routes/support.js";
import announcementsRouter from "./routes/announcements.js";
import { startBackupSchedule } from "./lib/backup.js";
import { logError } from "./lib/errorLog.js";

// Last-resort crash guards. Without these, an error thrown somewhere that
// isn't a normal Express request (a timer callback like the two scheduled
// jobs below, a rejected promise nobody awaited) crashes the whole process
// silently — Docker's "restart: unless-stopped" brings it back, but there's
// no record of why and no way to tell a clean crash from a hung process.
// Logging here at least leaves a trace in `docker compose logs` AND in
// error_log (so it shows up in Master Admin, not just a terminal Naveen
// isn't watching), and exiting deliberately (rather than leaving Node in a
// possibly-broken state) means every restart is a clean one (2026-09-15).
process.on("uncaughtException", (err) => {
  console.error("FATAL uncaughtException — restarting:", err);
  logError({ source: "server", route: "process", message: err?.message || String(err) });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("FATAL unhandledRejection — restarting:", reason);
  logError({ source: "server", route: "process", message: reason?.message || String(reason) });
  process.exit(1);
});

const app = express();
app.use(cors());
// Business Settings (routes/business.js PUT /me) stores the logo and
// signature as base64 data: URLs right on the business row (see db.js for
// why) — the client caps a logo at 500KB and a signature at 300KB before
// encoding (Settings.jsx's readFileAsDataUrl), but base64 inflates that by
// ~33%, and both fields plus the rest of the business profile (terms and
// conditions, five pairs of email subject/body templates, etc.) travel in
// ONE PUT request. Express's default body-parser limit is only 100KB, far
// below even one image alone, so any real logo upload was rejected outright
// as "request entity too large" before it ever reached routes/business.js —
// this is exactly what a run of "PUT /api/business/me — request entity too
// large" rows in error_log turned out to be (Naveen found six of them
// 2026-09-16 and had no way to tell what they meant). 5mb gives comfortable
// headroom above the client's own caps combined.
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "billitup-server", time: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/business", businessRouter);
app.use("/api/customers", customersRouter);
app.use("/api/items", itemsRouter);
app.use("/api/terms-templates", termsTemplatesRouter);
app.use("/api/invoices", invoicesRouter);
app.use("/api/users", usersRouter);
app.use("/api/quotes", quotesRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/reports-library", reportsLibraryRouter);
app.use("/api/credit-notes", creditNotesRouter);
app.use("/api/recurring-invoices", recurringInvoicesRouter);
app.use("/api/public", publicRouter);
app.use("/api/portal-auth", portalAuthRouter);
app.use("/api/portal", portalRouter);
app.use("/api/admin", adminRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/vendors", vendorsRouter);
app.use("/api/purchases", purchasesRouter);
app.use("/api/time-entries", timeEntriesRouter);
app.use("/api/suggestions", suggestionsRouter);
app.use("/api/cloud-backup", cloudBackupRouter);
app.use("/api/client-errors", clientErrorsRouter);
app.use("/api/support", supportRouter);
app.use("/api/announcements", announcementsRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error(err);
  // req.auth is only set on routes behind requireAuth — a failure before
  // login (or on a public route) just logs with businessId: null rather
  // than skipping the log entirely, same reasoning as the crash guards
  // above (2026-09-15).
  logError({
    businessId: req.auth?.businessId ?? null,
    source: "server",
    route: `${req.method} ${req.path}`,
    message: err?.message || String(err),
  });
  // body-parser throws this specific shape when a request body is over the
  // express.json() limit set above — give whoever hit it (most likely
  // uploading a logo/signature in Settings) something they can actually act
  // on, instead of the generic 500 message that made this indistinguishable
  // from every other server error in error_log (2026-09-16).
  if (err?.type === "entity.too.large" || err?.status === 413) {
    return res.status(413).json({ error: "That's too large to save — try a smaller image, or shorten the text." });
  }
  res.status(500).json({ error: "Something went wrong" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`billitup-server listening on :${PORT}`);
});

// Recurring invoices: check once at startup (catches anything due while the
// server was off — normal for a self-hosted install that isn't always
// running) and then every hour. Cheap to run often since a profile only
// generates once its next_invoice_date actually arrives.
//
// Wrapped in try/catch (2026-09-15): this runs on a timer, outside any
// request, so an error here used to crash the whole server for every
// business over one bad recurring profile. Now it's logged and skipped —
// the next hourly run tries again.
function runDueRecurringInvoicesSafely() {
  try {
    runDueRecurringInvoices();
  } catch (err) {
    console.error("Recurring invoices run failed:", err);
  }
}
runDueRecurringInvoicesSafely();
setInterval(runDueRecurringInvoicesSafely, 60 * 60 * 1000);

// Automatic payment reminder emails: same "check at startup, then hourly"
// pattern as recurring invoices above — off for every business until they
// turn it on in Settings > Email, and safe to run often since each invoice
// only ever matches one reminder condition until its own sent-at column
// moves past it (2026-09-16).
function runDueRemindersSafely() {
  runDueReminders().catch((err) => {
    console.error("Payment reminders run failed:", err);
  });
}
runDueRemindersSafely();
setInterval(runDueRemindersSafely, 60 * 60 * 1000);

// Automated backups — see lib/backup.js. Runs once shortly after startup,
// then daily. startBackupSchedule sets up its own timer internally, so it's
// wrapped here only to stop a startup-time failure from taking the server
// down before it even starts listening.
try {
  startBackupSchedule();
} catch (err) {
  console.error("Backup schedule failed to start:", err);
}
