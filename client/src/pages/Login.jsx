import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, setSession } from "../lib/api";
import { IconInvoice, IconReports, IconCustomers } from "../components/Icons";

// Redesigned 2026-09-15 as a split screen (brand story on the left, the
// actual form on the right) instead of a single plain centered card — first
// page in a page-by-page visual pass over the app, keeping the existing
// navy/green/amber brand and every bit of the original logic untouched
// (same api.login call, same expired-session banner, same links). Uses its
// own login-* CSS classes rather than the shared .auth-page/.auth-card ones,
// so Signup/ForgotPassword/ResetPassword/AdminLogin are unaffected until
// their own turn in this redesign.
export default function Login() {
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
      const { token, user } = await api.login(form);
      setSession(token, user);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-brand-panel">
        <div className="login-brand-mark">
          <img src="/logo-header.png" alt="BillItUp" />
        </div>

        <h2 className="login-brand-tagline">
          Invoicing built for <em>consultants, agencies and firms</em> who bill for their work, not their stock.
        </h2>

        <div className="login-feature-list">
          <div className="login-feature-item">
            <span className="login-feature-icon"><IconInvoice size={18} /></span>
            <span className="login-feature-text">
              <strong>GST-ready invoices</strong>
              <span>Reverse charge, CGST/SGST/IGST, and the correct current tax slabs</span>
            </span>
          </div>
          <div className="login-feature-item">
            <span className="login-feature-icon"><IconReports size={18} /></span>
            <span className="login-feature-text">
              <strong>Reports that actually help</strong>
              <span>GSTR-1, GSTR-3B, aging, and a library of 14 named reports</span>
            </span>
          </div>
          <div className="login-feature-item">
            <span className="login-feature-icon"><IconCustomers size={18} /></span>
            <span className="login-feature-text">
              <strong>A portal for your clients</strong>
              <span>Give each customer their own login to check invoice status</span>
            </span>
          </div>
        </div>

        <div className="login-brand-footer">
          <strong>Made with <span className="login-heart">&hearts;</span> in India</strong>&nbsp;· free &amp; open source
        </div>
      </div>

      <div className="login-form-panel">
        <form className="login-form-card" onSubmit={handleSubmit}>
          <h1>Log in to BillItUp</h1>
          <p className="login-subtitle">Enter your details to access your business.</p>

          {expired && !error && (
            <p className="login-error-banner">Your session had expired, so you were logged out. Please log in again.</p>
          )}
          {error && <p className="login-error-banner">{error}</p>}

          <div className="login-field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              autoFocus
              required
            />
          </div>
          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>

          <button type="submit" className="login-submit" disabled={loading}>
            {loading ? "Logging in..." : "Log in"}
          </button>

          <div className="login-links">
            <Link to="/forgot-password">Forgot your password?</Link>
            <span className="login-signup-note">New business? <Link to="/signup">Set up BillItUp</Link></span>
          </div>
        </form>
      </div>
    </div>
  );
}
