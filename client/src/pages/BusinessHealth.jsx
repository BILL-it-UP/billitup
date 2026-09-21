import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { adminApi, getAdminSecret } from "../lib/adminApi";
import { formatDateTime, formatMoney } from "../lib/format";
import { ATTENTION_LABELS, buildBusinessSummary } from "../lib/businessSummary";
import { IconChevron, IconAlert, IconChat, IconBuilding } from "../components/Icons";

const STATUS_LABELS = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

// One business's own health check — everything Naveen needs to diagnose a
// problem for them without ever seeing their client data (2026-09-15).
// Reached by clicking a business's name on the main Master Admin screen.
// Deliberately three separate reads (business profile, errors, tickets)
// rather than one giant endpoint, so each section can load and fail
// independently.
// Exported (not just used below) so the cross-business "Errors" feed on the
// main Master Admin screen can show the exact same row, with one addition —
// a Business column, since that feed isn't already scoped to one business
// the way this page's own Errors section is (2026-09-16).
// A ready-to-send starting point for the "your issue is fixed" notice, so
// Naveen isn't staring at a blank box every time — it's built from whatever
// he's already typed into "How was this fixed?", and stays editable before
// it actually sends (2026-09-21).
function suggestNotifyMessage(notes) {
  const base = "Hi, the issue you reported has been fixed and is live now.";
  const trimmedNotes = (notes || "").trim();
  return trimmedNotes ? `${base} ${trimmedNotes}` : `${base} Please let us know if you run into it again.`;
}

export function ErrorRow({ error, onUpdated, showBusiness }) {
  const [resolving, setResolving] = useState(false);
  const [notes, setNotes] = useState(error.resolution_notes || "");
  const [notify, setNotify] = useState(Boolean(error.business_id));
  const [notifyMessage, setNotifyMessage] = useState(suggestNotifyMessage(error.resolution_notes));
  const [notifyEdited, setNotifyEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const totalCols = showBusiness ? 7 : 6;

  // Keeps the suggested text in sync with "How was this fixed?" as Naveen
  // types it, right up until he actually edits the notification text itself
  // — once he's touched it, his own wording wins and stops being overwritten.
  const handleNotesChange = (value) => {
    setNotes(value);
    if (!notifyEdited) setNotifyMessage(suggestNotifyMessage(value));
  };

  const save = async (status) => {
    setBusy(true);
    try {
      const updated = await adminApi.setErrorStatus(
        error.id,
        status,
        notes,
        status === "resolved" && notify ? notifyMessage : null
      );
      onUpdated(updated);
      setResolving(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <tr>
        {showBusiness && (
          <td>
            {error.business_id ? (
              <Link to={`/admin/businesses/${error.business_id}`}>{error.business_name || "Unknown business"}</Link>
            ) : (
              <span className="muted">No business (system)</span>
            )}
          </td>
        )}
        <td>{formatDateTime(error.created_at)}</td>
        <td>{error.source === "client" ? "Browser" : "Server"}</td>
        <td className="error-route-cell">{error.route || "—"}</td>
        <td style={{ whiteSpace: "pre-wrap" }}>{error.message}</td>
        <td><span className={`badge ${error.status === "open" ? "badge-attention" : "badge-resolved"}`}>{error.status === "open" ? "Open" : "Resolved"}</span></td>
        <td>
          {error.status === "open" ? (
            <button type="button" className="link-btn" onClick={() => setResolving((v) => !v)}>
              {resolving ? "Cancel" : "Resolve"}
            </button>
          ) : (
            <button type="button" className="link-btn" onClick={() => save("open")} disabled={busy}>Reopen</button>
          )}
        </td>
      </tr>
      {resolving && (
        <tr className="admin-detail-row">
          <td colSpan={totalCols}>
            <div className="admin-detail-panel" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <label>How was this fixed?
                <textarea rows={2} value={notes} onChange={(e) => handleNotesChange(e.target.value)} placeholder="e.g. Restarted the mail queue, was a stuck SMTP connection" />
              </label>
              {error.business_id ? (
                <>
                  <label className="checkbox-label">
                    <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
                    {" "}Also notify the business
                  </label>
                  {notify && (
                    <label>Message to send them (posted to their Support inbox)
                      <textarea
                        rows={2}
                        value={notifyMessage}
                        onChange={(e) => { setNotifyMessage(e.target.value); setNotifyEdited(true); }}
                      />
                    </label>
                  )}
                </>
              ) : (
                <p className="muted" style={{ margin: 0 }}>No business tied to this error, so there's nobody to notify.</p>
              )}
              <button type="button" className="btn admin-copy-btn" style={{ alignSelf: "flex-start" }} onClick={() => save("resolved")} disabled={busy}>
                {busy ? "Saving..." : notify && error.business_id ? "Mark Resolved & Notify" : "Mark resolved"}
              </button>
            </div>
          </td>
        </tr>
      )}
      {!resolving && error.status === "resolved" && error.resolution_notes && (
        <tr className="admin-detail-row">
          <td colSpan={totalCols}>
            <div className="admin-detail-panel">
              <span className="muted">Resolved {formatDateTime(error.resolved_at)}: {error.resolution_notes}</span>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// Exported (not just used below) so the cross-business "Support Requests"
// feed on the main Master Admin screen can reuse the exact same chat view
// instead of a second, slightly-different copy of it (2026-09-15).
export function AdminTicketThread({ ticket, onUpdated }) {
  const [messages, setMessages] = useState(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminApi.getSupportTicketMessages(ticket.id).then(setMessages).catch(() => {});
    // Poll while this thread is open so a new reply from the business shows
    // up on its own, without needing a page refresh (2026-09-16).
    const interval = setInterval(() => {
      adminApi.getSupportTicketMessages(ticket.id).then(setMessages).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, [ticket.id]);

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      const fresh = await adminApi.sendAdminSupportMessage(ticket.id, reply.trim());
      setMessages(fresh);
      setReply("");
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status) => {
    await adminApi.setSupportTicketStatus(ticket.id, status);
    onUpdated();
  };

  return (
    <div className="support-thread">
      <div className="support-thread-header">
        <select value={ticket.status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </select>
        <span className="muted">Opened {formatDateTime(ticket.created_at)}</span>
      </div>
      <div className="support-messages">
        {messages === null ? (
          <p className="muted">Loading...</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`support-bubble support-bubble-${m.sender === "admin" ? "admin" : "business"}`}>
              <div className="support-bubble-meta">
                <strong>{m.sender === "admin" ? "You" : m.sender_name || "Business"}</strong>
                <span className="muted">{formatDateTime(m.created_at)}</span>
              </div>
              <p>{m.message}</p>
            </div>
          ))
        )}
      </div>
      <form className="support-reply-form" onSubmit={send}>
        <textarea rows={2} placeholder="Reply..." value={reply} onChange={(e) => setReply(e.target.value)} />
        <button type="submit" disabled={busy || !reply.trim()}>{busy ? "Sending..." : "Reply"}</button>
      </form>
    </div>
  );
}

export default function BusinessHealth() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [business, setBusiness] = useState(null);
  const [users, setUsers] = useState(null);
  const [errors, setErrors] = useState(null);
  const [tickets, setTickets] = useState(null);
  const [expandedTicketId, setExpandedTicketId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const loadErrors = () => adminApi.getBusinessErrors(id).then(setErrors).catch((err) => setError(err.message));
  const loadTickets = () => adminApi.getBusinessTickets(id).then(setTickets).catch((err) => setError(err.message));

  useEffect(() => {
    if (!getAdminSecret()) { navigate("/admin/login"); return; }
    adminApi.getBusiness(id).then(setBusiness).catch((err) => setError(err.message));
    adminApi.getBusinessUsers(id).then(setUsers).catch((err) => setError(err.message));
    loadErrors();
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const openErrorCount = errors?.filter((e) => e.status === "open").length || 0;
  const reasons = business?.attention || [];

  const copySummary = async () => {
    const text = buildBusinessSummary(business);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Clipboard API can refuse (no permission, non-HTTPS context) — fall
      // back to something the browser always allows, rather than the button
      // silently doing nothing.
      window.prompt("Copy this:", text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!business) {
    return (
      <div className="admin-page">
        <div className="admin-content">{error ? <p className="error">{error}</p> : <p className="muted">Loading...</p>}</div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-topbar">
        <div className="admin-topbar-inner">
          <Link to="/admin" className="admin-back-link"><IconChevron direction="left" size={16} /> All businesses</Link>
        </div>
      </div>

      <div className="admin-content">
        {error && <p className="error">{error}</p>}

        <div className="business-health-header">
          {business.logo_data_url && <img src={business.logo_data_url} alt="" className="business-health-logo" />}
          <div>
            <h1>{business.name}</h1>
            <p className="muted">
              {[business.owner_email, business.owner_phone, business.state, business.gstin].filter(Boolean).join(" · ") || "No contact details on file"}
            </p>
            {business.owner_login_email && (
              <p className="muted">
                Owner login: <a href={`mailto:${business.owner_login_email}`}>{business.owner_login_email}</a>
                {business.sibling_firms?.length > 0 && (
                  <>
                    {" "}· also runs{" "}
                    {business.sibling_firms.map((f, i) => (
                      <span key={f.id}>
                        {i > 0 && ", "}
                        <Link to={`/admin/businesses/${f.id}`}>{f.name}</Link>
                      </span>
                    ))}
                  </>
                )}
              </p>
            )}
          </div>
          <span className={`badge ${business.plan === "premium" ? "badge-premium" : "badge-free"}`}>{business.plan === "premium" ? "Premium" : "Free"}</span>
        </div>

        {reasons.length > 0 && (
          <p className="error" style={{ marginTop: -8 }}>
            Needs attention: {reasons.map((r) => ATTENTION_LABELS[r] || r).join("; ")}
          </p>
        )}

        <div className="admin-section">
          <div className="admin-section-header">
            <span className="settings-card-icon"><IconBuilding size={19} /></span>
            <div>
              <h2>Business details</h2>
              <p className="muted">Everything about this business at a glance — no client data, just the account itself.</p>
            </div>
          </div>
          <div className="admin-table-card">
            <div className="admin-detail-panel">
              <div className="admin-detail-facts">
                <div><span className="muted">GSTIN</span><strong>{business.gstin || "Not set"}</strong></div>
                <div><span className="muted">State</span><strong>{business.state || "Not set"}</strong></div>
                <div><span className="muted">Customers</span><strong>{business.customer_count}</strong></div>
                <div><span className="muted">Invoices</span><strong>{business.invoice_count} (₹{formatMoney(business.invoiced_total)})</strong></div>
                <div><span className="muted">Last login</span><strong>{business.last_login_at ? formatDateTime(business.last_login_at) : "Never"}</strong></div>
                <div><span className="muted">Signed up</span><strong>{formatDateTime(business.created_at)}</strong></div>
                <div>
                  <span className="muted">Cloud backup</span>
                  <strong className={business.cloud_backup_status === "error" ? "admin-attention-text" : undefined}>
                    {business.cloud_backup_status === "error" ? "Connected, upload failing" : business.cloud_backup_status === "connected" ? "Connected" : "Not connected"}
                  </strong>
                </div>
                <button type="button" className="btn btn-secondary admin-copy-btn" onClick={copySummary}>
                  {copied ? "Copied" : "Copy details"}
                </button>
              </div>
              <div className="admin-detail-users">
                <span className="muted">Logins under this business</span>
                {users === null ? (
                  <p className="muted">Loading...</p>
                ) : users.length ? (
                  <table className="table admin-detail-users-table">
                    <thead>
                      <tr><th>Name</th><th>Email</th><th>Role</th><th>Last Login</th></tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
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
          </div>
        </div>

        <div className="admin-section">
          <div className="admin-section-header">
            <span className="settings-card-icon"><IconAlert size={19} /></span>
            <div>
              <h2>Errors{openErrorCount > 0 && <span className="badge badge-attention admin-section-badge">{openErrorCount} open</span>}</h2>
              <p className="muted">Technical errors this business's requests hit — never their invoices, customers, or anything else they've typed in.</p>
            </div>
          </div>
          <div className="admin-table-card">
            {errors === null ? (
              <p className="muted">Loading...</p>
            ) : errors.length === 0 ? (
              <p className="muted">No errors recorded for this business. That's a good sign.</p>
            ) : (
              <table className="table">
                <thead><tr><th>When</th><th>Where</th><th>Route</th><th>Message</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {errors.map((e) => <ErrorRow key={e.id} error={e} onUpdated={loadErrors} />)}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="admin-section">
          <div className="admin-section-header">
            <span className="settings-card-icon"><IconChat size={19} /></span>
            <div>
              <h2>Support conversations</h2>
              <p className="muted">Problems this business raised directly, and the reply thread with them.</p>
            </div>
          </div>
          <div className="admin-table-card">
            {tickets === null ? (
              <p className="muted">Loading...</p>
            ) : tickets.length === 0 ? (
              <p className="muted">No support conversations from this business.</p>
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
                        <span>{t.subject}</span>
                        {t.unread_count > 0 && <span className="support-unread-dot" title={`${t.unread_count} new message`} />}
                      </div>
                      <div className="support-ticket-item-bottom">
                        <span className={`badge support-status-${t.status}`}>{STATUS_LABELS[t.status]}</span>
                        <span className="muted">{formatDateTime(t.updated_at)}</span>
                      </div>
                    </button>
                    {expandedTicketId === t.id && (
                      <AdminTicketThread ticket={t} onUpdated={() => { loadTickets(); }} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
