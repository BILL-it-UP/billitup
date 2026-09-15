import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, setSession } from "../lib/api";
import { IconInvoice, IconReports, IconCustomers } from "../components/Icons";

const TOTAL_STEPS = 2;

// Redesigned 2026-09-15 to match Login's split-screen shell — same
// login-shell/login-brand-panel/login-form-panel classes, same brand story,
// so a brand-new business's very first screen and their next login look
// like the same product. Only the form panel differs: a 2-step wizard
// instead of a single form, restyled onto login-field/login-submit rather
// than the old plain auth-card markup. Logic (step state, api.signup call)
// is untouched.
export default function Signup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    businessName: "", gstin: "",
    ownerName: "", email: "", password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const next = (e) => { e.preventDefault(); setError(""); setStep((s) => Math.min(TOTAL_STEPS, s + 1)); };
  const back = () => setStep((s) => Math.max(1, s - 1));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token, user } = await api.signup(form);
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
          Set up your business in <em>under two minutes</em>, then start billing for your work, not your stock.
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
          <strong>Made with <span className="login-heart">&hearts;</span> in India</strong>&nbsp;· free &amp; open source ·{" "}
          <Link to="/terms" style={{ color: "inherit" }}>Terms &amp; Privacy</Link>
        </div>
      </div>

      <div className="login-form-panel">
        <div className="login-form-card">
          <h1>Set up BillItUp</h1>
          <p className="login-subtitle login-step-indicator">Step {step} of {TOTAL_STEPS}</p>

          {step === 1 && (
            <form onSubmit={next}>
              <p className="login-subtitle" style={{ marginTop: -14 }}>First, tell us about your business.</p>
              <div className="login-field">
                <label htmlFor="signup-business-name">Business name</label>
                <input id="signup-business-name" value={form.businessName} onChange={update("businessName")} required autoFocus />
              </div>
              <div className="login-field">
                <label htmlFor="signup-gstin">GSTIN (leave blank if not GST-registered)</label>
                <input id="signup-gstin" value={form.gstin} onChange={update("gstin")} placeholder="Optional" />
              </div>
              <div className="login-wizard-nav">
                <span />
                <button type="submit" className="login-submit" style={{ width: "auto", padding: "11px 26px", margin: 0 }}>Next</button>
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleSubmit}>
              <p className="login-subtitle" style={{ marginTop: -14 }}>
                Now create your Owner login — you can add staff logins later, and finish branding (logo, bank details, terms) in Settings.
              </p>
              {error && <p className="login-error-banner">{error}</p>}
              <div className="login-field">
                <label htmlFor="signup-owner-name">Your name</label>
                <input id="signup-owner-name" value={form.ownerName} onChange={update("ownerName")} required autoFocus />
              </div>
              <div className="login-field">
                <label htmlFor="signup-email">Email</label>
                <input id="signup-email" type="email" value={form.email} onChange={update("email")} required />
              </div>
              <div className="login-field">
                <label htmlFor="signup-password">Password</label>
                <input id="signup-password" type="password" value={form.password} onChange={update("password")} required minLength={6} />
              </div>
              <div className="login-wizard-nav">
                <button type="button" className="link-btn" onClick={back}>Back</button>
                <button type="submit" className="login-submit" style={{ width: "auto", padding: "11px 26px", margin: 0 }} disabled={loading}>
                  {loading ? "Creating..." : "Create business"}
                </button>
              </div>
              <p className="login-subtitle" style={{ fontSize: 12, marginTop: 14, marginBottom: 0 }}>
                By creating a business, you agree to our <Link to="/terms">Terms of Service &amp; Privacy Policy</Link>.
              </p>
            </form>
          )}

          <p className="login-links" style={{ marginTop: 22 }}>
            <span className="login-signup-note">Already have an account? <Link to="/login">Log in</Link></span>
          </p>
        </div>
      </div>
    </div>
  );
}
