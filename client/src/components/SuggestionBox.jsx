import { useState } from "react";
import { api } from "../lib/api";
import { IconSuggestion } from "./Icons";

// Kept in sync with server/src/routes/suggestions.js's SUGGESTION_CATEGORIES.
const CATEGORIES = [
  "Invoices", "Quotes", "Credit Notes", "Customers", "Items",
  "Vendors & Purchases", "Payments", "Reports", "Settings", "Other",
];

// A lightweight feedback widget available to every logged-in role — anyone
// using the software day to day can flag something they'd like improved,
// not just the business owner. Sits in the sidebar next to the collapse
// toggle; opens as a real centered dialog (with a dimmed backdrop) rather
// than an inline box, so it's unmistakably a pop-up rather than something
// that just appears in the page flow. Asks which part of the software the
// suggestion is about, and tells the person exactly where it goes: onto
// the owner/admin-only Suggestions review page (see pages/Suggestions.jsx).
export default function SuggestionBox() {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");

  const close = () => {
    setOpen(false);
    setStatus("idle");
    setError("");
    setCategory(CATEGORIES[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setStatus("sending");
    setError("");
    try {
      await api.createSuggestion(message.trim(), category);
      setMessage("");
      setStatus("sent");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  };

  return (
    <div className="suggestion-box">
      <button type="button" className="sidebar-toggle" onClick={() => setOpen(true)} title="Suggest an improvement">
        <IconSuggestion size={16} />
        <span className="sidebar-link-label">Suggest a feature</span>
      </button>

      {open && (
        <div className="suggestion-modal-backdrop" onClick={close}>
          <div className="suggestion-modal" onClick={(e) => e.stopPropagation()}>
            {status === "sent" ? (
              <>
                <h2>Thanks!</h2>
                <p className="muted">
                  Your suggestion has been added to the Suggestions page, where the business owner or an admin
                  reviews it. It isn't emailed anywhere automatically.
                </p>
                <div className="suggestion-modal-actions">
                  <button type="button" onClick={close}>Close</button>
                </div>
              </>
            ) : (
              <form onSubmit={handleSubmit}>
                <h2>Suggest an improvement</h2>
                <p className="muted" style={{ marginTop: -8 }}>
                  Tell us what would make this software better. Your business owner or an admin will see it on
                  the Suggestions page.
                </p>
                <label>Which part of the software is this about?
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label>What should change, and why?
                  <textarea
                    rows={5}
                    placeholder="e.g. On the Invoices page, I'd like to filter by customer without scrolling..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    autoFocus
                  />
                </label>
                {error && <p className="error">{error}</p>}
                <div className="suggestion-modal-actions">
                  <button type="button" className="link-btn" onClick={close}>Cancel</button>
                  <button type="submit" disabled={status === "sending" || !message.trim()}>
                    {status === "sending" ? "Sending..." : "Send suggestion"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
