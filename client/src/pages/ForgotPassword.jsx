import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

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
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <img src="/logo-header.png" alt="BillItUp" className="auth-logo" />
        <h1>Reset your password</h1>
        {sent ? (
          <p className="muted">
            If an account exists for <strong>{email}</strong>, we've sent an email with a link to reset
            your password. It expires in 1 hour.
          </p>
        ) : (
          <>
            <p className="muted">Enter the email you log in with and we'll send you a reset link.</p>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={loading}>
              {loading ? "Sending..." : "Send reset link"}
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
