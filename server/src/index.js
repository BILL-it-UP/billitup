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
import creditNotesRouter from "./routes/credit-notes.js";
import recurringInvoicesRouter, { runDueRecurringInvoices } from "./routes/recurring-invoices.js";
import publicRouter from "./routes/public.js";

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
app.use("/api/credit-notes", creditNotesRouter);
app.use("/api/recurring-invoices", recurringInvoicesRouter);
app.use("/api/public", publicRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
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
runDueRecurringInvoices();
setInterval(runDueRecurringInvoices, 60 * 60 * 1000);
