import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, setCustomerSession } from "../lib/api";

// A client's own login to their invoice portal — separate from the
// business login (Login.jsx). Only reachable for a customer whose portal
// access has actually been turned on; see routes/portalAuth.js.
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
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <img src="/logo-header.png" alt="BillItUp" className="auth-logo" />
        <h1>View your invoices</h1>
        {expired && !error && (
          <p className="error">Your session had expired, so you were logged out. Please log in again.</p>
        )}
        <label>Email
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
        </label>
        <label>Password
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? "Logging in..." : "Log in"}</button>
        <p className="muted">
          Don't have a password yet? Use the link the business emailed you, or ask them to resend it.
        </p>
        <p className="muted"><Link to="/login">Business login</Link></p>
      </form>
    </div>
  );
}
