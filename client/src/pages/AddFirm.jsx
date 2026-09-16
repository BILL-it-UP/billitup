import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setSession } from "../lib/api";

// Add a second (or third...) firm under the SAME login — no new email/
// password, just another business this owner can switch into from the firm
// switcher in the topbar. Mirrors Signup's step 1 (business name + GSTIN)
// since everything else (branding, bank details, staff) is finished in that
// firm's own Settings afterward, same as a brand-new signup.
export default function AddFirm() {
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState("");
  const [gstin, setGstin] = useState("");
  const [error, setError] = useState("");
  const [premiumRequired, setPremiumRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setPremiumRequired(false);
    setLoading(true);
    try {
      const { token, user } = await api.createFirm({ businessName, gstin });
      setSession(token, user);
      // Full reload (not client-side navigate) — the topbar firm switcher and
      // every page's cached data need to pick up the newly-created firm as
      // the active one, not just this page.
      window.location.assign("/settings");
    } catch (err) {
      setError(err.message);
      if (err.code === "PREMIUM_REQUIRED") setPremiumRequired(true);
    } finally {
      setLoading(false);
    }
  };

  // A blocked "add firm" attempt used to be a dead end — the only way to
  // actually get Premium was to message Naveen some other way, outside the
  // app. This reuses the Support chat (built 2026-09-15) to raise a real,
  // trackable request instead: it lands in his Support Requests inbox in
  // Master Admin, and he can reply right there with payment details once
  // it's settled (2026-09-16).
  const requestPremium = async () => {
    setRequesting(true);
    setError("");
    try {
      await api.createSupportTicket(
        `Request: upgrade to Premium${businessName ? ` (to add "${businessName}")` : ""}`,
        `Hi, I'd like to add another firm${businessName ? ` ("${businessName}")` : ""} under my account, which needs Premium. Please let me know how to pay and I'll get it sorted.`
      );
      navigate("/support");
    } catch (err) {
      setError(err.message);
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <img src="/logo-header.png" alt="BillItUp" className="auth-logo" />
        <h1>Add Another Firm</h1>
        <p className="muted">
          This creates a separate firm with its own customers, invoices, and numbering — you'll switch
          between it and your other firms from the dropdown at the top, without logging out.
        </p>
        <form onSubmit={handleSubmit}>
          <label>Business name
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} required autoFocus />
          </label>
          <label>GSTIN (leave blank if not GST-registered)
            <input value={gstin} onChange={(e) => setGstin(e.target.value)} placeholder="Optional" />
          </label>
          {error && <p className="error">{error}</p>}
          {premiumRequired && (
            <p className="muted" style={{ marginTop: -8 }}>
              <button type="button" className="link-btn" onClick={requestPremium} disabled={requesting}>
                {requesting ? "Sending request..." : "Request premium access"}
              </button>
              {" "}— this sends a message straight to the BillItUp owner, who can reply with how to pay.
            </p>
          )}
          <div className="wizard-nav">
            <Link className="link-btn" to="/settings">Cancel</Link>
            <button type="submit" disabled={loading}>{loading ? "Creating..." : "Create firm"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
