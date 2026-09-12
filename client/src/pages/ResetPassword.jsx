import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { api } from "../lib/api";

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
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <img src="/logo-header.png" alt="BillItUp" className="auth-logo" />
        <h1>Set a new password</h1>
        {!token && <p className="error">This link is missing its reset token — use the link from your email.</p>}
        {done ? (
          <p className="muted">Password updated. Taking you to log in...</p>
        ) : (
          <>
            <label>
              New password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
            </label>
            <label>
              Confirm new password
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={loading || !token}>
              {loading ? "Saving..." : "Set new password"}
            </button>
          </>
        )}
        <p className="muted">
          <Link to="/login">Back to log in</Link>
        </p>
      </form>
    </div>
  );
}
