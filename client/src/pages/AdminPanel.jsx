import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi, getAdminSecret, clearAdminSecret } from "../lib/adminApi";
import { formatDateTime } from "../lib/format";
import { IconTrash } from "../components/Icons";

// The one super-admin screen — everything Naveen, as the creator of the
// software, needs to keep an eye on this install from a single place: how
// many businesses have signed up and whether they're actually logging in,
// the free/premium switch (no payment processor wired up yet — he gets paid
// directly, then flips a business here), and every suggestion submitted from
// inside the app across every business, not just one at a time. Deliberately
// outside the regular Shell/sidebar — this isn't a business feature, it's a
// tool for running the install itself, and only reachable by going straight
// to /admin (nothing in the app links to it).
export default function AdminPanel() {
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState(null);
  const [stats, setStats] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [suggestionFilter, setSuggestionFilter] = useState("open");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    Promise.all([adminApi.listBusinesses(), adminApi.getStats(), adminApi.listSuggestions()])
      .then(([businessRows, statsData, suggestionRows]) => {
        setBusinesses(businessRows);
        setStats(statsData);
        setSuggestions(suggestionRows);
      })
      .catch((err) => {
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

  const toggleSuggestion = async (s) => {
    setError("");
    try {
      await adminApi.setSuggestionStatus(s.id, s.status === "open" ? "done" : "open");
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteSuggestion = async (id) => {
    setError("");
    try {
      await adminApi.deleteSuggestion(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const filteredSuggestions = useMemo(() => {
    if (!suggestions) return [];
    if (suggestionFilter === "all") return suggestions;
    return suggestions.filter((s) => s.status === suggestionFilter);
  }, [suggestions, suggestionFilter]);

  const logOut = () => {
    clearAdminSecret();
    navigate("/admin/login");
  };

  if (!businesses || !stats || !suggestions) {
    return (
      <div style={{ maxWidth: 1000, margin: "40px auto", padding: "0 24px" }}>
        {error ? <p className="error">{error}</p> : <p className="muted">Loading...</p>}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1000, margin: "40px auto", padding: "0 24px" }}>
      <div className="page-header">
        <h1>Admin — Overview</h1>
        <button className="link-btn" onClick={logOut}>Log out of admin</button>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="stat-tiles">
        <div className="stat-tile">
          <span className="stat-label">Businesses</span>
          <span className="stat-value">{stats.totalBusinesses}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">New This Week</span>
          <span className="stat-value">{stats.newBusinesses7d}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Active (30d)</span>
          <span className="stat-value">{stats.activeBusinesses30d}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Total Users</span>
          <span className="stat-value">{stats.totalUsers}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Total Invoices</span>
          <span className="stat-value">{stats.totalInvoices}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Logins Today</span>
          <span className="stat-value">{stats.loginsToday}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Logins This Week</span>
          <span className="stat-value">{stats.loginsThisWeek}</span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Open Feedback</span>
          <span className="stat-value">{stats.openSuggestions}</span>
        </div>
      </div>

      <h2>Businesses</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Everything else in BillItUp stays free. The only thing "Premium" unlocks is running more than
        one firm under the same login. Flip a business here once you've been paid directly.
      </p>
      <table className="table">
        <thead>
          <tr><th>ID</th><th>Name</th><th>Plan</th><th>Users</th><th>Invoices</th><th>Last Login</th><th>Created</th><th /></tr>
        </thead>
        <tbody>
          {businesses.map((b) => (
            <tr key={b.id}>
              <td>{b.id}</td>
              <td>{b.name}</td>
              <td>{b.plan === "premium" ? "Premium" : "Free"}</td>
              <td>{b.user_count}</td>
              <td>{b.invoice_count}</td>
              <td>{b.last_login_at ? formatDateTime(b.last_login_at) : "Never"}</td>
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

      <h2>Feedback</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Every suggestion submitted from inside the app, across every business, newest first.
      </p>
      {suggestions.length === 0 ? (
        <p className="muted">No feedback yet.</p>
      ) : (
        <>
          <div className="list-toolbar">
            <select value={suggestionFilter} onChange={(e) => setSuggestionFilter(e.target.value)}>
              <option value="open">Open</option>
              <option value="done">Done</option>
              <option value="all">All</option>
            </select>
          </div>
          {filteredSuggestions.length === 0 ? (
            <p className="list-empty-filtered">Nothing here.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Business</th><th>From</th><th>Area</th><th>Suggestion</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {filteredSuggestions.map((s) => (
                  <tr key={s.id}>
                    <td>{String(s.created_at).slice(0, 10)}</td>
                    <td>{s.business_name}</td>
                    <td>{s.user_name || "—"}</td>
                    <td>{s.category || "General"}</td>
                    <td style={{ whiteSpace: "pre-wrap" }}>{s.message}</td>
                    <td>
                      <button type="button" className="link-btn" onClick={() => toggleSuggestion(s)}>
                        {s.status === "open" ? "Mark done" : "Reopen"}
                      </button>
                    </td>
                    <td>
                      <button type="button" className="link-btn" onClick={() => deleteSuggestion(s.id)} title="Delete">
                        <IconTrash size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
