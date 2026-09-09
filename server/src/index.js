import express from "express";
import cors from "cors";
import { db } from "./db.js";
import authRouter from "./routes/auth.js";
import businessRouter from "./routes/business.js";
import customersRouter from "./routes/customers.js";
import itemsRouter from "./routes/items.js";
import invoicesRouter from "./routes/invoices.js";
import usersRouter from "./routes/users.js";

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

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Something went wrong" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`billitup-server listening on :${PORT}`);
});
