import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, getUser } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { startTour } from "../lib/tour";

// Any logged-in role can raise a problem and chat with Naveen about it here
// (2026-09-15) — same audience as the Suggestions sidebar box, but this is
// for "something is actually wrong", not a feature idea, and it's a real
// back-and-forth rather than a one-way message. Naveen's own side of the
// same threads lives in Master Admin (per-business, and a cross-business
// inbox) — see AdminPanel.jsx and BusinessHealth.jsx.
const STATUS_LABELS = { open: "Open", in_progress: "In progress", resolved: "Resolved" };

function NewTicketForm({ onCreated, onCancel }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) return;
    setBusy(true);
    setError("");
    try {
      const ticket = await api.createSupportTicket(subject.trim(), message.trim());
      onCreated(ticket);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="panel support-new-form" onSubmit={submit}>
      <h2>Raise a problem</h2>
      <label>What's it about?
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Invoice PDF won't download" autoFocus />
      </label>
      <label>Tell us what's happening
        <textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What did you try, and what happened instead?" />
      </label>
      {error && <p className="error">{error}</p>}
      <div className="suggestion-modal-actions">
        <button type="button" className="link-btn" onClick={onCancel}>Cancel</button>
        <button type="submit" disabled={busy || !subject.trim() || !message.trim()}>
          {busy ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}

function TicketThread({ ticket, onUpdated }) {
  const [messages, setMessages] = useState(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const user = getUser();

  useEffect(() => {
    setMessages(null);
    api.getSupportTicketMessages(ticket.id).then(setMessages).catch((err) => setError(err.message));
  }, [ticket.id]);

  const send = async (e) => {
    e.preventDefault();
    if (!reply.trim()) return;
    setSending(true);
    setError("");
    try {
      const updated = await api.sendSupportMessage(ticket.id, reply.trim());
      setReply("");
      onUpdated(updated);
      const fresh = await api.getSupportTicketMessages(ticket.id);
      setMessages(fresh);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="support-thread">
      <div className="support-thread-header">
        <div>
          <strong>{ticket.subject}</strong>
          <span className={`badge support-status-${ticket.status}`}>{STATUS_LABELS[ticket.status]}</span>
        </div>
        <span className="muted">Opened {formatDateTime(ticket.created_at)}</span>
      </div>
      <div className="support-messages">
        {messages === null ? (
          <p className="muted">Loading...</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`support-bubble support-bubble-${m.sender}`}>
              <div className="support-bubble-meta">
                <strong>{m.sender === "admin" ? "BillItUp Support" : m.sender_name || user?.name || "You"}</strong>
                <span className="muted">{formatDateTime(m.created_at)}</span>
              </div>
              <p>{m.message}</p>
            </div>
          ))
        )}
      </div>
      <form className="support-reply-form" onSubmit={send}>
        <textarea
          rows={2}
          placeholder="Write a reply..."
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={sending || !reply.trim()}>{sending ? "Sending..." : "Reply"}</button>
      </form>
    </div>
  );
}

export default function Support() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [error, setError] = useState("");

  const load = () =>
    api.listMySupportTickets()
      .then((rows) => {
        setTickets(rows);
        setSelectedId((current) => (current && rows.some((t) => t.id === current) ? current : rows[0]?.id ?? null));
      })
      .catch((err) => setError(err.message));

  useEffect(() => { load(); }, []);

  const selected = useMemo(() => tickets?.find((t) => t.id === selectedId) || null, [tickets, selectedId]);

  const handleCreated = (ticket) => {
    setShowNewForm(false);
    load();
    setSelectedId(ticket.id);
  };

  const handleUpdated = () => load();

  if (!tickets) return <p className="muted">Loading...</p>;

  return (
    <div>
      <div className="page-header">
        <h1>Support</h1>
        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" className="link-btn" onClick={() => startTour(navigate, getUser())}>Take a tour</button>
          <button type="button" className="btn" onClick={() => setShowNewForm(true)}>+ Raise a problem</button>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Run into something that isn't working right? Raise it here and chat with us directly until it's sorted.
        Want a refresher on the basics instead? Use "Take a tour" above.
      </p>
      {error && <p className="error">{error}</p>}

      {showNewForm && (
        <NewTicketForm onCreated={handleCreated} onCancel={() => setShowNewForm(false)} />
      )}

      {tickets.length === 0 && !showNewForm ? (
        <div className="panel">
          <p className="muted">No problems raised yet. If something's not working, let us know above.</p>
        </div>
      ) : (
        <div className="support-split">
          <div className="support-ticket-list">
            {tickets.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`support-ticket-item${t.id === selectedId ? " active" : ""}`}
                onClick={() => setSelectedId(t.id)}
              >
                <div className="support-ticket-item-top">
                  <span>{t.subject}</span>
                  {t.unread_count > 0 && <span className="support-unread-dot" title={`${t.unread_count} new reply`} />}
                </div>
                <div className="support-ticket-item-bottom">
                  <span className={`badge support-status-${t.status}`}>{STATUS_LABELS[t.status]}</span>
                  <span className="muted">{formatDateTime(t.updated_at)}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="support-detail-pane">
            {selected ? <TicketThread ticket={selected} onUpdated={handleUpdated} /> : (
              <p className="muted">Select a conversation.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
