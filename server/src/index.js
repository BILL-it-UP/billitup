import express from "express";
import cors from "cors";
import { db } from "./db.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "billitup-server", time: new Date().toISOString() });
});

// Minimal read endpoints to prove the DB wiring end-to-end.
// Real CRUD (validation, auth, invoice numbering, tax calc) comes next.
app.get("/api/items", (_req, res) => {
  const items = db.prepare("SELECT * FROM items ORDER BY created_at DESC").all();
  res.json(items);
});

app.get("/api/customers", (_req, res) => {
  const customers = db.prepare("SELECT * FROM customers ORDER BY created_at DESC").all();
  res.json(customers);
});

app.get("/api/invoices", (_req, res) => {
  const invoices = db.prepare("SELECT * FROM invoices ORDER BY created_at DESC").all();
  res.json(invoices);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`billitup-server listening on :${PORT}`);
});
