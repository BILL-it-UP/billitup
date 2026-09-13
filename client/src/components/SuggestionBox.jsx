import { useState } from "react";
import { api } from "../lib/api";
import { IconSuggestion } from "./Icons";

// A lightweight feedback widget available to every logged-in role — anyone
// using the software day to day can flag something they'd like improved,
// not just the business owner. Sits in the sidebar next to the collapse
// toggle; opens a small popover with a textarea, closes itself on submit.
// The owner/admin review queue lives at /suggestions (see pages/Suggestions.jsx).
export default function SuggestionBox() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | error
  const [error, setError] = useState("");

  const close = () => {
    setOpen(false);
    setStatus("idle");
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setStatus("sending");
    setError("");
    try {
      await api.createSuggestion(message.trim());
      setMessage("");
      setStatus("sent");
    } catch (err) {
      setError(err.message);
      setStatus("error");
    }
  };

  return (
    <div className="suggestion-box">
      {open && (
        <div className="suggestion-popover">
          {status === "sent" ? (
            <>
              <p>Thanks — your suggestion has been sent to the team.</p>
              <button type="button" className="link-btn" onClick={close}>Close</button>
            </>
          ) : (
            <form onSubmit={handleSubmit}>
              <label>
                Suggest an improvement
                <textarea
                  rows={4}
                  placeholder="What would make this software better for you?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  autoFocus
                />
              </label>
              {error && <p className="error">{error}</p>}
              <div className="suggestion-popover-actions">
                <button type="button" className="link-btn" onClick={close}>Cancel</button>
                <button type="submit" disabled={status === "sending" || !message.trim()}>
                  {status === "sending" ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
      <button type="button" className="sidebar-toggle" onClick={() => setOpen((v) => !v)} title="Suggest an improvement">
        <IconSuggestion size={16} />
        <span className="sidebar-link-label">Suggest a feature</span>
      </button>
    </div>
  );
}
