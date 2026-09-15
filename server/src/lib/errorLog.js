// One place to write a row into error_log, used by the global Express error
// handler, the process-level crash guards, and the client-error reporting
// route (see routes/clientErrors.js) — so every technical failure, wherever
// it happened, ends up in the same table Master Admin's per-business health
// page reads from (2026-09-15).
//
// Deliberately never passed anything beyond a route string and an error
// message: no request body, no query params, no stack trace with variable
// values in it. That's what keeps this safe to show Naveen without also
// showing him a business's client data — the trade-off is a shorter trail
// to debug from, which is the right side to err on for other people's data.
import { db } from "../db.js";

const MAX_MESSAGE_LENGTH = 2000;

export function logError({ businessId = null, source = "server", route = null, message }) {
  try {
    const safeMessage = String(message || "Unknown error").slice(0, MAX_MESSAGE_LENGTH);
    db.prepare(
      `INSERT INTO error_log (business_id, source, route, message) VALUES (?, ?, ?, ?)`
    ).run(businessId, source, route, safeMessage);
  } catch (err) {
    // The error log itself must never be why something else crashes.
    console.error("Failed to write to error_log:", err);
  }
}
