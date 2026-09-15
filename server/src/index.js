import express from "express";
import cors from "cors";
import { db } from "./db.js";
import authRouter from "./routes/auth.js";
import businessRouter from "./routes/business.js";
import customersRouter from "./routes/customers.js";
import itemsRouter from "./routes/items.js";
import invoicesRouter from "./routes/invoices.js";
import usersRouter from "./routes/users.js";
import quotesRouter from "./routes/quotes.js";
import reportsRouter from "./routes/reports.js";
import reportsLibraryRouter from "./routes/reportsLibrary.js";
import creditNotesRouter from "./routes/credit-notes.js";
import recurringInvoicesRouter, { runDueRecurringInvoices } from "./routes/recurring-invoices.js";
import publicRouter from "./routes/public.js";
import portalAuthRouter from "./routes/portalAuth.js";
import portalRouter from "./routes/portal.js";
import adminRouter from "./routes/admin.js";
import paymentsRouter from "./routes/payments.js";
import vendorsRouter from "./routes/vendors.js";
import purchasesRouter from "./routes/purchases.js";
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
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "billitup-server", time: new Date().toISOString() });
});

app.use("/api/auth", authRouter);
app.use("/api/business", businessRouter);
app.use("/api/customers", customersRouter);
app.use("/api/items", itemsRouter);
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

// Automated backups — see lib/backup.js. Runs once shortly after startup,
// then daily. startBackupSchedule sets up its own timer internally, so it's
// wrapped here only to stop a startup-time failure from taking the server
// down before it even starts listening.
try {
  startBackupSchedule();
} catch (err) {
  console.error("Backup schedule failed to start:", err);
}
