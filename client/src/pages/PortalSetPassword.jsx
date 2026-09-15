import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";
import { IconLock, IconCheck } from "../components/Icons";

// The destination of the one-time link a client is emailed when an
// Owner/Admin turns their portal access on (or resends it). Works for both
// the first-ever password (mode: "set") and a later reset (mode: "reset")
// — see GET /api/portal-auth/invite/:token.
// Redesigned 2026-09-15 onto the shared "simple auth" centered-card look
// (see index.css), matching Forgot Password / Reset Password / Portal Login.
export default function PortalSetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [doneEmail, setDoneEmail] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getPortalInvite(token).then(setInvite).catch((err) => setLoadError(err.message));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("Passwords don't match.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setLoading(true);
    try {
      const result = await api.setPortalPassword(token, password);
      setDoneEmail(result?.email || invite?.customerEmail || "");
      setDone(true);
      setTimeout(() => navigate("/portal/login"), 2200);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const heading = invite?.mode === "reset" ? "Reset your portal password" : "Set up your portal login";

  return (
    <div className="simple-auth-shell">
      <div className="simple-auth-card">
        <img src="/logo-header.png" alt="BillItUp" className="simple-auth-logo" />

        {loadError ? (
          <>
            <div className="simple-auth-icon-badge"><IconLock size={20} /></div>
            <h1>This link isn't working</h1>
            <p className="login-error-banner">{loadError}</p>
          </>
        ) : !invite ? (
          <p className="simple-auth-subtitle">Loading...</p>
        ) : done ? (
          <div className="simple-auth-success">
            <div className="simple-auth-success-check"><IconCheck size={22} /></div>
            <h1>Password set</h1>
            <p className="simple-auth-subtitle">
              You'll log in with <strong>{doneEmail}</strong>. Taking you to log in...
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="simple-auth-icon-badge"><IconLock size={20} /></div>
            <h1>{heading}</h1>
            <p className="simple-auth-subtitle">
              {invite.customerName}, {invite.businessName} gave you online access to view your invoices. Choose a password below.
            </p>
            <p className="portal-login-email-note">
              You'll log in with: <strong>{invite.customerEmail}</strong>
            </p>
            <div className="login-field">
              <label htmlFor="portal-set-password">New password</label>
              <input id="portal-set-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoFocus />
            </div>
            <div className="login-field">
              <label htmlFor="portal-set-confirm">Confirm new password</label>
              <input id="portal-set-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
            </div>
            {error && <p className="login-error-banner">{error}</p>}
            <button type="submit" className="login-submit" disabled={loading}>{loading ? "Saving..." : "Save password"}</button>
          </form>
        )}

        <p className="simple-auth-links"><Link to="/portal/login">Already have a password? Log in</Link></p>
      </div>
    </div>
  );
}
