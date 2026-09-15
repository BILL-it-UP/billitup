import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { adminApi, getAdminSecret, clearAdminSecret } from "../lib/adminApi";
import { formatDateTime, formatMoney } from "../lib/format";
import {
  IconTrash, IconBuilding, IconReports, IconCloud, IconTeam,
  IconInvoice, IconDashboard, IconSuggestion, IconChat, IconAnnouncement, IconAlert,
} from "../components/Icons";
import ConfirmDialog from "../components/ConfirmDialog";
import { AdminTicketThread } from "./BusinessHealth";

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
  { key: "openErrors", label: "Open Errors", icon: IconAlert, attentionIfPositive: true },
  { key: "openSupportTickets", label: "Support Waiting", icon: IconChat, attentionIfPositive: true },
];

function SectionHeader({ icon: Icon, title, description, badge }) {
  return (
    <div className="admin-section-header">
      <span className="settings-card-icon"><Icon size={19} /></span>
      <div>
        <h2>{title}{badge}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
    </div>
  );
}

// Human labels for the "attention" reasons the server computes per business
// (see attentionReasons in routes/admin.js) — used both as the tooltip on a
// flagged row and inside the plain-text copy summary, so the wording matches
// wherever it shows up.
const ATTENTION_LABELS = {
  no_contact: "No email or phone on file",
  inactive: "Hasn't logged in for a while",
  backup_error: "Cloud backup is connected but failing",
  has_errors: "Has unresolved errors — open their health page",
  has_open_ticket: "Waiting on a reply in Support",
};

// A plain, fully-labelled block instead of a raw table row — Naveen asked
// that anything he copies out of the admin page be easy to understand on its
// own, e.g. pasted into WhatsApp or a note, without the table's column
// headers alongside it for context (2026-09-15).
function buildBusinessSummary(b) {
  const backupLine =
    b.cloud_backup_status === "error"
      ? "Connected, but the last upload failed"
      : b.cloud_backup_status === "connected"
        ? "Connected"
        : "Not connected";
  return [
    `BillItUp business: ${b.name}`,
    `Plan: ${b.plan === "premium" ? "Premium" : "Free"}`,
    `Contact: ${[b.owner_email, b.owner_phone].filter(Boolean).join(", ") || "Not provided"}`,
    `GSTIN: ${b.gstin || "Not set"}`,
    `State: ${b.state || "Not set"}`,
    `Customers: ${b.customer_count}`,
    `Invoices: ${b.invoice_count} (₹${formatMoney(b.invoiced_total)} invoiced)`,
    `Last login: ${b.last_login_at ? formatDateTime(b.last_login_at) : "Never"}`,
    `Signed up: ${formatDateTime(b.created_at)}`,
    `Cloud backup: ${backupLine}`,
    `Open errors: ${b.open_error_count || 0}`,
    `Open support conversations: ${b.open_ticket_count || 0}`,
    ...(b.attention?.length ? [`Needs attention: ${b.attention.map((r) => ATTENTION_LABELS[r] || r).join("; ")}`] : []),
  ].join("\n");
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const [businesses, setBusinesses] = useState(null);
  const [stats, setStats] = useState(null);
  const [suggestions, setSuggestions] = useState(null);
  const [suggestionFilter, setSuggestionFilter] = useState("open");
  const [tickets, setTickets] = useState(null);
  const [expandedTicketId, setExpandedTicketId] = useState(null);
  const [announcements, setAnnouncements] = useState(null);
  const [announcementForm, setAnnouncementForm] = useState({ title: "", message: "" });
  const [announcementBusy, setAnnouncementBusy] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [businessSearch, setBusinessSearch] = useState("");
  const [businessAttentionFilter, setBusinessAttentionFilter] = useState("all");
  const [sort, setSort] = useState({ key: "created_at", dir: "desc" });
  const [copiedId, setCopiedId] = useState(null);
  const [planTarget, setPlanTarget] = useState(null); // business pending plan-change confirmation
  const [deleteTarget, setDeleteTarget] = useState(null); // suggestion pending delete confirmation
  const [expandedId, setExpandedId] = useState(null); // business whose detail row (GSTIN, state, cloud backup, individual users) is open
  const [businessUsers, setBusinessUsers] = useState({}); // businessId -> users array, fetched on first expand and cached
  const [usersLoadingId, setUsersLoadingId] = useState(null);

  const load = () => {
    Promise.all([
      adminApi.listBusinesses(),
      adminApi.getStats(),
      adminApi.listSuggestions(),
      adminApi.listAllSupportTickets(),
      adminApi.listAnnouncements(),
    ])
      .then(([businessRows, statsData, suggestionRows, ticketRows, announcementRows]) => {
        setBusinesses(businessRows);
        setStats(statsData);
        setSuggestions(suggestionRows);
        setTickets(ticketRows);
        setAnnouncements(announcementRows);
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

  const toggleDetails = (b) => {
    if (expandedId === b.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(b.id);
    if (!businessUsers[b.id]) {
      setUsersLoadingId(b.id);
      adminApi
        .getBusinessUsers(b.id)
        .then((rows) => setBusinessUsers((prev) => ({ ...prev, [b.id]: rows })))
        .catch((err) => setError(err.message))
        .finally(() => setUsersLoadingId(null));
    }
  };

  const submitAnnouncement = async (e) => {
    e.preventDefault();
    if (!announcementForm.title.trim() || !announcementForm.message.trim()) return;
    setAnnouncementBusy(true);
    setError("");
    try {
      await adminApi.createAnnouncement(announcementForm.title.trim(), announcementForm.message.trim());
      setAnnouncementForm({ title: "", message: "" });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setAnnouncementBusy(false);
    }
  };

  const removeAnnouncement = async (id) => {
    setError("");
    try {
      await adminApi.deleteAnnouncement(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const copySummary = async (b) => {
    const text = buildBusinessSummary(b);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can refuse (no permission, non-HTTPS context) — fall
      // back to something the browser always allows, rather than the button
      // silently doing nothing.
      window.prompt("Copy this:", text);
    }
    setCopiedId(b.id);
    setTimeout(() => setCopiedId((id) => (id === b.id ? null : id)), 2000);
  };

  const handleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  };

  const attentionCount = useMemo(
    () => (businesses ? businesses.filter((b) => b.attention?.length).length : 0),
    [businesses]
  );

  const filteredBusinesses = useMemo(() => {
    if (!businesses) return [];
    const q = businessSearch.trim().toLowerCase();
    let rows = q ? businesses.filter((b) => b.name.toLowerCase().includes(q)) : businesses.slice();
    if (businessAttentionFilter === "attention") rows = rows.filter((b) => b.attention?.length);
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
            badge={attentionCount > 0 ? <span className="badge badge-attention admin-section-badge">{attentionCount} need attention</span> : null}
          />
          <div className="admin-table-card">
            <div className="list-toolbar">
              <input
                type="search"
                placeholder="Search businesses by name..."
                value={businessSearch}
                onChange={(e) => setBusinessSearch(e.target.value)}
              />
              <select value={businessAttentionFilter} onChange={(e) => setBusinessAttentionFilter(e.target.value)}>
                <option value="all">All businesses</option>
                <option value="attention">Needs attention ({attentionCount})</option>
              </select>
            </div>
            {filteredBusinesses.length === 0 ? (
              <p className="list-empty-filtered">No businesses match your search.</p>
            ) : (
              <table className="table admin-businesses-table">
                <thead>
                  <tr>
                    <SortTh label="Name" sortKey="name" />
                    <SortTh label="Plan" sortKey="plan" />
                    <th>Contact</th>
                    <SortTh label="Customers" sortKey="customer_count" />
                    <SortTh label="Users" sortKey="user_count" />
                    <SortTh label="Invoices" sortKey="invoice_count" />
                    <SortTh label="Invoiced" sortKey="invoiced_total" />
                    <SortTh label="Last Login" sortKey="last_login_at" />
                    <SortTh label="Created" sortKey="created_at" />
                    <th />
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredBusinesses.map((b) => {
                    const reasons = b.attention || [];
                    const rowClass = reasons.includes("backup_error") || reasons.includes("has_errors")
                      ? "admin-row-danger"
                      : reasons.length
                        ? "admin-row-warn"
                        : "";
                    const rowTitle = reasons.length
                      ? reasons.map((r) => ATTENTION_LABELS[r] || r).join("; ")
                      : undefined;
                    return (
                      <Fragment key={b.id}>
                        <tr className={rowClass} title={rowTitle}>
                          <td><Link to={`/admin/businesses/${b.id}`}>{b.name}</Link></td>
                          <td><span className={`badge ${b.plan === "premium" ? "badge-premium" : "badge-free"}`}>{b.plan === "premium" ? "Premium" : "Free"}</span></td>
                          <td className="admin-contact-cell">
                            {b.owner_email ? <div><a href={`mailto:${b.owner_email}`}>{b.owner_email}</a></div> : null}
                            {b.owner_phone ? <div><a href={`tel:${b.owner_phone}`}>{b.owner_phone}</a></div> : null}
                            {reasons.includes("no_contact") ? <span className="badge badge-attention">Missing</span> : null}
                          </td>
                          <td>{b.customer_count}</td>
                          <td>{b.user_count}</td>
                          <td>{b.invoice_count}</td>
                          <td>{formatMoney(b.invoiced_total)}</td>
                          <td className={reasons.includes("inactive") ? "admin-attention-text" : undefined}>
                            {b.last_login_at ? formatDateTime(b.last_login_at) : "Never"}
                          </td>
                          <td>{formatDateTime(b.created_at)}</td>
                          <td>
                            <button type="button" className="link-btn" disabled={busyId === b.id} onClick={() => setPlanTarget(b)}>
                              {busyId === b.id ? "Saving..." : b.plan === "premium" ? "Move to Free" : "Move to Premium"}
                            </button>
                          </td>
                          <td>
                            <button type="button" className="link-btn" onClick={() => toggleDetails(b)}>
                              {expandedId === b.id ? "Hide details" : "Details"}
                            </button>
                          </td>
                        </tr>
                        {expandedId === b.id && (
                          <tr className="admin-detail-row">
                            <td colSpan={11}>
                              <div className="admin-detail-panel">
                                <div className="admin-detail-facts">
                                  <div><span className="muted">GSTIN</span><strong>{b.gstin || "Not set"}</strong></div>
                                  <div><span className="muted">State</span><strong>{b.state || "Not set"}</strong></div>
                                  <div>
                                    <span className="muted">Cloud backup</span>
                                    <strong className={b.cloud_backup_status === "error" ? "admin-attention-text" : undefined}>
                                      {b.cloud_backup_status === "error" ? "Connected, upload failing" : b.cloud_backup_status === "connected" ? "Connected" : "Not connected"}
                                    </strong>
                                  </div>
                                  <button type="button" className="btn btn-secondary admin-copy-btn" onClick={() => copySummary(b)}>
                                    {copiedId === b.id ? "Copied" : "Copy details"}
                                  </button>
                                </div>
                                <div className="admin-detail-users">
                                  <span className="muted">Logins under this business</span>
                                  {usersLoadingId === b.id ? (
                                    <p className="muted">Loading...</p>
                                  ) : businessUsers[b.id]?.length ? (
                                    <table className="table admin-detail-users-table">
                                      <thead>
                                        <tr><th>Name</th><th>Email</th><th>Role</th><th>Last Login</th></tr>
                                      </thead>
                                      <tbody>
                                        {businessUsers[b.id].map((u) => (
                                          <tr key={u.id}>
                                            <td>{u.name}</td>
                                            <td>{u.email || "—"}</td>
                                            <td>{u.role}</td>
                                            <td>{u.last_login_at ? formatDateTime(u.last_login_at) : "Never"}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  ) : (
                                    <p className="muted">No logins recorded.</p>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="admin-section">
          <SectionHeader
            icon={IconChat}
            title="Support Requests"
            description="Problems raised directly by businesses, across the whole install. Click one to open the conversation."
          />
          <div className="admin-table-card">
            {tickets.length === 0 ? (
              <p className="muted">No support conversations yet.</p>
            ) : (
              <div className="support-ticket-list support-ticket-list-wide">
                {tickets.map((t) => (
                  <div key={t.id}>
                    <button
                      type="button"
                      className={`support-ticket-item${expandedTicketId === t.id ? " active" : ""}`}
                      onClick={() => setExpandedTicketId((cur) => (cur === t.id ? null : t.id))}
                    >
                      <div className="support-ticket-item-top">
                        <span><strong>{t.business_name}</strong> — {t.subject}</span>
                        {t.unread_count > 0 && <span className="support-unread-dot" title={`${t.unread_count} new message`} />}
                      </div>
                      <div className="support-ticket-item-bottom">
                        <span className={`badge support-status-${t.status}`}>
                          {t.status === "open" ? "Open" : t.status === "in_progress" ? "In progress" : "Resolved"}
                        </span>
                        <span className="muted">{formatDateTime(t.updated_at)}</span>
                      </div>
                    </button>
                    {expandedTicketId === t.id && <AdminTicketThread ticket={t} onUpdated={load} />}
                  </div>
                ))}
              </div>
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

        <div className="admin-section">
          <SectionHeader
            icon={IconAnnouncement}
            title="Announcements"
            description="Write something here and every business sees it as a popup the next time they open the app — a new feature, planned downtime, anything worth telling everyone at once."
          />
          <div className="admin-table-card">
            <form className="announcement-form" onSubmit={submitAnnouncement}>
              <input
                type="text"
                placeholder="Title, e.g. New: cloud backup to Dropbox"
                value={announcementForm.title}
                onChange={(e) => setAnnouncementForm((f) => ({ ...f, title: e.target.value }))}
              />
              <textarea
                rows={3}
                placeholder="What do you want every business to see?"
                value={announcementForm.message}
                onChange={(e) => setAnnouncementForm((f) => ({ ...f, message: e.target.value }))}
              />
              <button type="submit" className="btn" disabled={announcementBusy || !announcementForm.title.trim() || !announcementForm.message.trim()}>
                {announcementBusy ? "Publishing..." : "Publish announcement"}
              </button>
            </form>

            {announcements.length > 0 && (
              <table className="table" style={{ marginTop: 18 }}>
                <thead><tr><th>Date</th><th>Title</th><th>Message</th><th></th></tr></thead>
                <tbody>
                  {announcements.map((a) => (
                    <tr key={a.id}>
                      <td>{formatDateTime(a.created_at)}</td>
                      <td>{a.title}</td>
                      <td style={{ whiteSpace: "pre-wrap" }}>{a.message}</td>
                      <td>
                        <button type="button" className="link-btn" onClick={() => removeAnnouncement(a.id)} title="Delete">
                          <IconTrash size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
