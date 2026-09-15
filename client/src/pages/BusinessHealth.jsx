import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { adminApi, getAdminSecret } from "../lib/adminApi";
import { formatDateTime } from "../lib/format";
import { IconChevron, IconAlert, IconChat } from "../components/Icons";

const STATUS_LABELS = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

// One business's own health check — everything Naveen needs to diagnose a
// problem for them without ever seeing their client data (2026-09-15).
// Reached by clicking a business's name on the main Master Admin screen.
// Deliberately three separate reads (business profile, errors, tickets)
// rather than one giant endpoint, so each section can load and fail
// independently.
function ErrorRow({ error, onUpdated }) {
  const [resolving, setResolving] = useState(false);
  const [notes, setNotes] = useState(error.resolution_notes || "");
  const [busy, setBusy] = useState(false);

  const save = async (status) => {
    setBusy(true);
    try {
      const updated = await adminApi.setErrorStatus(error.id, status, notes);
      onUpdated(updated);
      setResolving(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <tr>
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
          <td colSpan={6}>
            <div className="admin-detail-panel">
              <label style={{ flex: 1 }}>How was this fixed?
                <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Restarted the mail queue, was a stuck SMTP connection" />
              </label>
              <button type="button" className="btn admin-copy-btn" onClick={() => save("resolved")} disabled={busy}>
                {busy ? "Saving..." : "Mark resolved"}
              </button>
            </div>
          </td>
        </tr>
      )}
      {!resolving && error.status === "resolved" && error.resolution_notes && (
        <tr className="admin-detail-row">
          <td colSpan={6}>
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
  const [errors, setErrors] = useState(null);
  const [tickets, setTickets] = useState(null);
  const [expandedTicketId, setExpandedTicketId] = useState(null);
  const [error, setError] = useState("");

  const loadErrors = () => adminApi.getBusinessErrors(id).then(setErrors).catch((err) => setError(err.message));
  const loadTickets = () => adminApi.getBusinessTickets(id).then(setTickets).catch((err) => setError(err.message));

  useEffect(() => {
    if (!getAdminSecret()) { navigate("/admin/login"); return; }
    adminApi.getBusiness(id).then(setBusiness).catch((err) => setError(err.message));
    loadErrors();
    loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const openErrorCount = errors?.filter((e) => e.status === "open").length || 0;

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
          </div>
          <span className={`badge ${business.plan === "premium" ? "badge-premium" : "badge-free"}`}>{business.plan === "premium" ? "Premium" : "Free"}</span>
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
