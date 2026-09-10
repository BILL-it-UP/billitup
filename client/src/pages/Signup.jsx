import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, setSession } from "../lib/api";

const TOTAL_STEPS = 2;

// A short signup wizard for corporate/agency billing: business details, then
// the Owner login. BillItUp is corporate/A4-invoicing focused, so there's no
// "what kind of business/printer" branching here — every business gets the
// same clean invoicing setup, and can fine-tune branding/tax/prefixes later
// in Settings.
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
    <div className="auth-page">
      <div className="auth-card wizard-card">
        <img src="/logo-header.png" alt="BillItUp" className="auth-logo" />
        <h1>Set up BillItUp</h1>
        <p className="muted step-indicator">Step {step} of {TOTAL_STEPS}</p>

        {step === 1 && (
          <form onSubmit={next}>
            <p className="muted">First, tell us about your business.</p>
            <label>Business name
              <input value={form.businessName} onChange={update("businessName")} required autoFocus />
            </label>
            <label>GSTIN (leave blank if not GST-registered)
              <input value={form.gstin} onChange={update("gstin")} placeholder="Optional" />
            </label>
            <div className="wizard-nav">
              <span />
              <button type="submit">Next</button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleSubmit}>
            <p className="muted">Now create your Owner login — you can add staff logins later, and finish branding (logo, bank details, terms) in Settings.</p>
            <label>Your name
              <input value={form.ownerName} onChange={update("ownerName")} required autoFocus />
            </label>
            <label>Email
              <input type="email" value={form.email} onChange={update("email")} required />
            </label>
            <label>Password
              <input type="password" value={form.password} onChange={update("password")} required minLength={6} />
            </label>
            {error && <p className="error">{error}</p>}
            <div className="wizard-nav">
              <button type="button" className="link-btn" onClick={back}>Back</button>
              <button type="submit" disabled={loading}>{loading ? "Creating..." : "Create business"}</button>
            </div>
          </form>
        )}

        <p className="muted">Already have an account? <Link to="/login">Log in</Link></p>
      </div>
    </div>
  );
}
