import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi, getAdminSecret, clearAdminSecret } from "../lib/adminApi";
import { formatDateTime } from "../lib/format";
import {
  IconTrash, IconBuilding, IconReports, IconCloud, IconTeam,
  IconInvoice, IconDashboard, IconSuggestion,
} from "../components/Icons";
import ConfirmDialog from "../components/ConfirmDialog";

// The one super-admin screen — everything Naveen, as the creator of the
// software, needs to keep an eye on this install from a single place: how
// many businesses have signed up and whether they're actually logging in,
// the free/premium switch (no payment processor wired up yet — he gets paid
// directly, then flips a business here), and every suggestion submitted from
// inside the app across every business, not just one at a time. Deliberately
// outside the regular Shell/sidebar — this isn't a business feature, it's a
// tool for running the install itself, and only reachable by going straight
// to /admin (nothing in the app links to it).
//
// Given a navy top bar and its own card/badge/confirm-dialog treatment
// (2026-09-15) so it reads as a distinct, serious control panel rather than
// a plain page-header dropped onto the business app's own look — and so
// that its two irreversible actions (moving a business off premium,
// deleting a piece of feedback) always ask first instead of firing on one
// click.
const STAT_TILES = [
  { key: "totalBusinesses", label: "Businesses", icon: IconBuilding },
  { key: "newBusinesses7d", label: "New This Week", icon: IconReports },
  { key: "activeBusinesses30d", label: "Active (30d)", icon: IconCloud },
  { key: "totalUsers", label: "Total Users", icon: IconTeam },
  { key: "totalInvoices", label: "Total Invoices", icon: IconInvoice },
  { key: "loginsToday", label: "Logins Today", icon: IconDashboard },
  { key: "loginsThisWeek", label: "Logins This Week", icon: IconCloud },
  { key: "openSuggestions", label: "Open Feedback", icon: IconSuggestion, attentionIfPositive: true },
];

function SectionHeader({ icon: Icon, title, description }) {
  return (
    <div className="admin-section-header">
      <span className="settings-card-icon"><Icon size={19} /></span>
      <div>
        <h2>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState(null);
  const [stats, setStats] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [suggestionFilter, setSuggestionFilter] = useState("open");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [businessSearch, setBusinessSearch] = useState("");
  const [sort, setSort] = useState({ key: "created_at", dir: "desc" });
  const [planTarget, setPlanTarget] = useState(null); // business pending plan-change confirmation
  const [deleteTarget, setDeleteTarget] = useState(null); // suggestion pending delete confirmation

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

  const confirmTogglePlan = async () => {
    if (!planTarget) return;
    setBusyId(planTarget.id);
    setError("");
    try {
      const nextPlan = planTarget.plan === "premium" ? "free" : "premium";
      await adminApi.setPlan(planTarget.id, nextPlan);
      setPlanTarget(null);
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

  const confirmDeleteSuggestion = async () => {
    if (!deleteTarget) return;
    setError("");
    try {
      await adminApi.deleteSuggestion(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  };

  const filteredBusinesses = useMemo(() => {
    if (!businesses) return [];
    const q = businessSearch.trim().toLowerCase();
    const rows = q ? businesses.filter((b) => b.name.toLowerCase().includes(q)) : businesses.slice();
    const { key, dir } = sort;
    rows.sort((a, b) => {
      let av = a[key], bv = b[key];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av == null) av = "";
      if (bv == null) bv = "";
      if (av < bv) return dir === "asc" ? -1 : 1;
      if (av > bv) return dir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [businesses, businessSearch, sort]);

  const filteredSuggestions = useMemo(() => {
    if (!suggestions) return [];
    if (suggestionFilter === "all") return suggestions;
    return suggestions.filter((s) => s.status === suggestionFilter);
  }, [suggestions, suggestionFilter]);

  const logOut = () => {
    clearAdminSecret();
    navigate("/admin/login");
  };

  const SortTh = ({ label, sortKey, ...rest }) => (
    <th
      className={`sortable-th${sort.key === sortKey ? " active" : ""}`}
      onClick={() => handleSort(sortKey)}
      {...rest}
    >
      {label}
      <span className="sort-arrow">{sort.key === sortKey ? (sort.dir === "asc" ? "▲" : "▼") : "▲"}</span>
    </th>
  );

  if (!businesses || !stats || !suggestions) {
    return (
      <div className="admin-page">
        <div className="admin-content">
          {error ? <p className="error">{error}</p> : <p className="muted">Loading...</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-topbar">
        <div className="admin-topbar-inner">
          <div className="admin-topbar-brand">
            <img src="/logo-icon-512.png" alt="" />
            <div>
              <strong>BillItUp</strong>
              <span>Master Admin</span>
            </div>
          </div>
          <button type="button" className="admin-topbar-logout" onClick={logOut}>Log out of admin</button>
        </div>
      </div>

      <div className="admin-content">
        {error && <p className="error">{error}</p>}

        <div className="stat-tiles">
          {STAT_TILES.map(({ key, label, icon: Icon, attentionIfPositive }) => {
            const attention = attentionIfPositive && stats[key] > 0;
            return (
              <div key={key} className={`stat-tile admin-stat-tile${attention ? " attention" : ""}`}>
                <span className="admin-stat-icon"><Icon size={15} /></span>
                <span className="stat-label">{label}</span>
                <span className="stat-value">{stats[key]}</span>
              </div>
            );
          })}
        </div>

        <div className="admin-section">
          <SectionHeader
            icon={IconBuilding}
            title="Businesses"
            description="Everything else in BillItUp stays free. The only thing Premium unlocks is running more than one firm under the same login. Flip a business here once you've been paid directly."
          />
          <div className="admin-table-card">
            <div className="list-toolbar">
              <input
                type="search"
                placeholder="Search businesses by name..."
                value={businessSearch}
                onChange={(e) => setBusinessSearch(e.target.value)}
              />
            </div>
            {filteredBusinesses.length === 0 ? (
              <p className="list-empty-filtered">No businesses match your search.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <SortTh label="Name" sortKey="name" />
                    <SortTh label="Plan" sortKey="plan" />
                    <SortTh label="Users" sortKey="user_count" />
                    <SortTh label="Invoices" sortKey="invoice_count" />
                    <SortTh label="Last Login" sortKey="last_login_at" />
                    <SortTh label="Created" sortKey="created_at" />
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredBusinesses.map((b) => (
                    <tr key={b.id}>
                      <td>{b.name}</td>
                      <td><span className={`badge ${b.plan === "premium" ? "badge-premium" : "badge-free"}`}>{b.plan === "premium" ? "Premium" : "Free"}</span></td>
                      <td>{b.user_count}</td>
                      <td>{b.invoice_count}</td>
                      <td>{b.last_login_at ? formatDateTime(b.last_login_at) : "Never"}</td>
                      <td>{formatDateTime(b.created_at)}</td>
                      <td>
                        <button type="button" className="link-btn" disabled={busyId === b.id} onClick={() => setPlanTarget(b)}>
                          {busyId === b.id ? "Saving..." : b.plan === "premium" ? "Move to Free" : "Move to Premium"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="admin-section">
          <SectionHeader
            icon={IconSuggestion}
            title="Feedback"
            description="Every suggestion submitted from inside the app, across every business, newest first."
          />
          <div className="admin-table-card">
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
                            <button type="button" className="link-btn" onClick={() => setDeleteTarget(s)} title="Delete">
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
        </div>
      </div>

      {planTarget && (
        <ConfirmDialog
          title={planTarget.plan === "premium" ? "Move to Free plan?" : "Move to Premium plan?"}
          message={
            planTarget.plan === "premium"
              ? `${planTarget.name} will lose the ability to run more than one firm under the same login. Only do this if their premium payment has actually lapsed.`
              : `${planTarget.name} will be able to run more than one firm under the same login. Only do this once you've actually been paid for this.`
          }
          confirmLabel={planTarget.plan === "premium" ? "Move to Free" : "Move to Premium"}
          busy={busyId === planTarget.id}
          onConfirm={confirmTogglePlan}
          onCancel={() => setPlanTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this feedback?"
          message={`This permanently deletes the suggestion from ${deleteTarget.business_name}. This can't be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={confirmDeleteSuggestion}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
