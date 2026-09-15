import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi, setAdminSecret, clearAdminSecret } from "../lib/adminApi";
import { IconLock } from "../components/Icons";

// A separate, unlisted login for the one super-admin console (the free/
// premium plan switch) — not linked from anywhere in the regular app, only
// reachable by going straight to /admin. There's no account here, just the
// ADMIN_SECRET Naveen sets in server/.env; entering the right value is what
// proves it's him.
// Redesigned 2026-09-15 onto the shared "simple auth" centered-card look
// (see index.css), matching Forgot Password and Reset Password — the navy
// badge (instead of the green Forgot/Reset use) is the one visual cue that
// this is the restricted admin console, not a regular account screen.
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
    <div className="simple-auth-shell">
      <div className="simple-auth-card">
        <img src="/logo-header.png" alt="BillItUp" className="simple-auth-logo" />

        <form onSubmit={handleSubmit}>
          <div className="simple-auth-icon-badge is-admin"><IconLock size={20} /></div>
          <h1>Admin</h1>
          <p className="simple-auth-subtitle">Enter the ADMIN_SECRET you set in server/.env.</p>
          <div className="login-field">
            <label htmlFor="admin-secret">Admin secret</label>
            <input id="admin-secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} required autoFocus />
          </div>
          {error && <p className="login-error-banner">{error}</p>}
          <button type="submit" className="login-submit" disabled={loading}>{loading ? "Checking..." : "Enter"}</button>
        </form>
      </div>
    </div>
  );
}
