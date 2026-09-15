import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "../lib/api";

// The destination of the one-time link a client is emailed when an
// Owner/Admin turns their portal access on (or resends it). Works for both
// the first-ever password (mode: "set") and a later reset (mode: "reset")
// — see GET /api/portal-auth/invite/:token.
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
    <div className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <img src="/logo-header.png" alt="BillItUp" className="auth-logo" />
        <h1>{heading}</h1>
        {loadError ? (
          <p className="error">{loadError}</p>
        ) : !invite ? (
          <p className="muted">Loading...</p>
        ) : done ? (
          <p className="muted">
            Password set. You'll log in with <strong>{doneEmail}</strong>. Taking you to log in...
          </p>
        ) : (
          <>
            <p className="muted">
              {invite.customerName}, {invite.businessName} gave you online access to view your invoices. Choose a password below.
            </p>
            <p className="portal-login-email-note">
              You'll log in with: <strong>{invite.customerEmail}</strong>
            </p>
            <label>
              New password
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoFocus />
            </label>
            <label>
              Confirm new password
              <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={loading}>{loading ? "Saving..." : "Save password"}</button>
          </>
        )}
        <p className="muted"><Link to="/portal/login">Already have a password? Log in</Link></p>
      </form>
    </div>
  );
}
