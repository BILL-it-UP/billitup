import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api, setSession } from "../lib/api";

const BUSINESS_TYPES = ["grocery", "clothing", "services", "restaurant", "corporate", "other"];

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    businessName: "", businessType: "grocery", ownerName: "", email: "", password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

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
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Set up BillItUp</h1>
        <p className="muted">Create your business — you'll be the Owner and can add staff logins later.</p>

        <label>Business name
          <input value={form.businessName} onChange={update("businessName")} required />
        </label>

        <label>Business type
          <select value={form.businessType} onChange={update("businessType")}>
            {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label>Your name
          <input value={form.ownerName} onChange={update("ownerName")} required />
        </label>

        <label>Email
          <input type="email" value={form.email} onChange={update("email")} required />
        </label>

        <label>Password
          <input type="password" value={form.password} onChange={update("password")} required minLength={6} />
        </label>

        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? "Creating..." : "Create business"}</button>
        <p className="muted">Already have an account? <Link to="/login">Log in</Link></p>
      </form>
    </div>
  );
}
