import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi, getAdminSecret, clearAdminSecret } from "../lib/adminApi";
import { formatDateTime } from "../lib/format";

// The one super-admin screen — lists every business on this install and lets
// Naveen flip a business between free and premium by hand, since there's no
// payment processor wired up yet (he gets paid directly, then does this).
// Deliberately outside the regular Shell/sidebar — this isn't a business
// feature, it's a tool for running the install itself, and only reachable by
// going straight to /admin (nothing in the app links to it).
export default function AdminPanel() {
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    adminApi.listBusinesses().then(setBusinesses).catch((err) => {
      setError(err.message);
      if (!getAdminSecret()) navigate("/admin/login");
    });
  };

  useEffect(() => {
    if (!getAdminSecret()) {
      navigate("/admin/login");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlan = async (business) => {
    setBusyId(business.id);
    setError("");
    try {
      const nextPlan = business.plan === "premium" ? "free" : "premium";
      await adminApi.setPlan(business.id, nextPlan);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const logOut = () => {
    clearAdminSecret();
    navigate("/admin/login");
  };

  if (!businesses) {
    return (
      <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 24px" }}>
        {error ? <p className="error">{error}</p> : <p className="muted">Loading...</p>}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 24px" }}>
      <div className="page-header">
        <h1>Admin — Businesses</h1>
        <button className="link-btn" onClick={logOut}>Log out of admin</button>
      </div>
      <p className="muted">
        Everything else in BillItUp stays free. The only thing "Premium" unlocks is running more than
        one firm under the same login. Flip a business here once you've been paid directly.
      </p>
      {error && <p className="error">{error}</p>}
      <table className="table">
        <thead>
          <tr><th>ID</th><th>Name</th><th>Plan</th><th>Created</th><th /></tr>
        </thead>
        <tbody>
          {businesses.map((b) => (
            <tr key={b.id}>
              <td>{b.id}</td>
              <td>{b.name}</td>
              <td>{b.plan === "premium" ? "Premium" : "Free"}</td>
              <td>{formatDateTime(b.created_at)}</td>
              <td>
                <button className="link-btn" disabled={busyId === b.id} onClick={() => togglePlan(b)}>
                  {busyId === b.id ? "Saving..." : b.plan === "premium" ? "Move to Free" : "Move to Premium"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
