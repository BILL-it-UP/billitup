import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { IconMail, IconCheck } from "../components/Icons";

// Redesigned 2026-09-15 onto the shared "simple auth" centered-card look
// (see index.css) used by Reset Password and Admin Login — a lighter
// treatment than Login/Signup's split screen, since this is a quick
// utility stop, not a first impression. Logic (api.forgotPassword call,
// the always-say-"sent" behaviour) is unchanged.
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.forgotPassword(email);
      // The server always responds the same way whether or not the email is
      // registered — we mirror that here rather than confirming an account
      // exists ourselves.
      setSent(true);
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

        {sent ? (
          <div className="simple-auth-success">
            <div className="simple-auth-success-check"><IconCheck size={22} /></div>
            <h1>Check your email</h1>
            <p className="simple-auth-subtitle">
              If an account exists for <strong>{email}</strong>, we've sent a link to reset your password.
              It expires in 1 hour.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="simple-auth-icon-badge"><IconMail size={20} /></div>
            <h1>Reset your password</h1>
            <p className="simple-auth-subtitle">Enter the email you log in with and we'll send you a reset link.</p>
            <div className="login-field">
              <label htmlFor="forgot-email">Email</label>
              <input id="forgot-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </div>
            {error && <p className="login-error-banner">{error}</p>}
            <button type="submit" className="login-submit" disabled={loading}>
              {loading ? "Sending..." : "Send reset link"}
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
