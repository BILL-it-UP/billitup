import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { IconLock, IconCheck } from "../components/Icons";

// Redesigned 2026-09-15 onto the shared "simple auth" centered-card look
// (see index.css), matching Forgot Password and Admin Login. Logic
// (token from the URL, password/confirm validation, api.resetPassword call,
// the 2-second redirect to login) is unchanged.
export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
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

        {done ? (
          <div className="simple-auth-success">
            <div className="simple-auth-success-check"><IconCheck size={22} /></div>
            <h1>Password updated</h1>
            <p className="simple-auth-subtitle">Taking you to log in...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="simple-auth-icon-badge"><IconLock size={20} /></div>
            <h1>Set a new password</h1>
            {!token ? (
              <p className="login-error-banner">This link is missing its reset token — use the link from your email.</p>
            ) : (
              <p className="simple-auth-subtitle">Choose a new password for your account.</p>
            )}
            <div className="login-field">
              <label htmlFor="reset-password">New password</label>
              <input id="reset-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </div>
            <div className="login-field">
              <label htmlFor="reset-confirm">Confirm new password</label>
              <input id="reset-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
            </div>
            {error && <p className="login-error-banner">{error}</p>}
            <button type="submit" className="login-submit" disabled={loading || !token}>
              {loading ? "Saving..." : "Set new password"}
            </button>
          </form>
        )}

        <p className="simple-auth-links">
          <Link to="/login">Back to log in</Link>
        </p>
      </div>
    </div>
  );
}
