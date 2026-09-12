import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi, setAdminSecret, clearAdminSecret } from "../lib/adminApi";

// A separate, unlisted login for the one super-admin console (the free/
// premium plan switch) — not linked from anywhere in the regular app, only
// reachable by going straight to /admin. There's no account here, just the
// ADMIN_SECRET Naveen sets in server/.env; entering the right value is what
// proves it's him.
export default function AdminLogin() {
  const navigate = useNavigate();
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    setAdminSecret(secret);
    try {
      // There's no dedicated "check my secret" endpoint — listing businesses
      // both proves the secret works and gives the panel its first data.
      await adminApi.listBusinesses();
      navigate("/admin");
    } catch (err) {
      clearAdminSecret();
      setError(err.message || "That secret was rejected.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <img src="/logo-header.png" alt="BillItUp" className="auth-logo" />
        <h1>Admin</h1>
        <p className="muted">Enter the ADMIN_SECRET you set in server/.env.</p>
        <label>Admin secret
          <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} required autoFocus />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>{loading ? "Checking..." : "Enter"}</button>
      </form>
    </div>
  );
}
