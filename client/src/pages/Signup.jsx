import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, setSession } from "../lib/api";

const BUSINESS_TYPES = ["grocery", "clothing", "services", "restaurant", "corporate", "other"];
const PAPER_SIZES = [
  { value: "A4", label: "A4 (standard printer)" },
  { value: "THERMAL_3IN", label: '3" thermal receipt printer' },
  { value: "THERMAL_4IN", label: '4" thermal receipt printer' },
];
const TOTAL_STEPS = 3;

// A short signup wizard: what kind of business this is, then which modules it
// needs (inventory, GST, printer type), then who the Owner is. Everything
// chosen here is saved straight onto the business at signup, so there's no
// separate "finish setting up" step afterward.
export default function Signup() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    businessName: "", businessType: "grocery",
    gstin: "", defaultPaperSize: "A4", inventoryEnabled: false,
    ownerName: "", email: "", password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => {
    const value = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm({ ...form, [field]: value });
  };

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
        <h1>Set up BillItUp</h1>
        <p className="muted step-indicator">Step {step} of {TOTAL_STEPS}</p>

        {step === 1 && (
          <form onSubmit={next}>
            <p className="muted">First, tell us about your business.</p>
            <label>Business name
              <input value={form.businessName} onChange={update("businessName")} required autoFocus />
            </label>
            <label>What kind of business is this?
              <select value={form.businessType} onChange={update("businessType")}>
                {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <button type="submit">Next</button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={next}>
            <p className="muted">Now, how do you want to bill?</p>
            <label>GSTIN (leave blank if not GST-registered)
              <input value={form.gstin} onChange={update("gstin")} placeholder="Optional" />
            </label>
            <label>What do you print invoices on?
              <select value={form.defaultPaperSize} onChange={update("defaultPaperSize")}>
                {PAPER_SIZES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.inventoryEnabled} onChange={update("inventoryEnabled")} />
              {" "}Track stock quantity for items (decrements automatically when invoiced)
            </label>
            <div className="wizard-nav">
              <button type="button" className="link-btn" onClick={back}>Back</button>
              <button type="submit">Next</button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleSubmit}>
            <p className="muted">Finally, create your Owner login — you can add staff logins later.</p>
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
