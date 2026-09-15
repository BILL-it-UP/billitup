import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, setCustomerSession } from "../lib/api";
import { IconInvoice } from "../components/Icons";

// A client's own login to their invoice portal — separate from the
// business login (Login.jsx). Only reachable for a customer whose portal
// access has actually been turned on; see routes/portalAuth.js.
// Redesigned 2026-09-15 onto the shared "simple auth" centered-card look
// (see index.css) already used by Forgot Password / Reset Password / Admin
// Login, so a client's first impression of the portal matches the polish of
// the rest of the app rather than the plain form it used to be.
export default function PortalLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const expired = searchParams.get("expired") === "1";
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token, customer } = await api.portalLogin(form.email, form.password);
      setCustomerSession(token, customer);
      navigate("/portal");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="simple-auth-shell">
      <div className="simple-auth-card">
        <img src="/logo-header.png" alt="BillItUp" className="simple-auth-logo" />
        <div className="simple-auth-icon-badge"><IconInvoice size={20} /></div>
        <h1>View your invoices</h1>
        <p className="simple-auth-subtitle">Log in with the email and password you set up to see your invoices and payment status.</p>

        {expired && !error && (
          <p className="login-error-banner">Your session had expired, so you were logged out. Please log in again.</p>
        )}

        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label htmlFor="portal-email">Email</label>
            <input id="portal-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoFocus />
          </div>
          <div className="login-field">
            <label htmlFor="portal-password">Password</label>
            <input id="portal-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
          {error && <p className="login-error-banner">{error}</p>}
          <button type="submit" className="login-submit" disabled={loading}>{loading ? "Logging in..." : "Log in"}</button>
        </form>

        <p className="simple-auth-subtitle" style={{ marginTop: 4, marginBottom: 0 }}>
          Don't have a password yet? Use the link the business emailed you, or ask them to resend it.
        </p>
        <p className="simple-auth-links"><Link to="/login">Business login</Link></p>
      </div>
    </div>
  );
}
