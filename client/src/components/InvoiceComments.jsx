import { useEffect, useState } from "react";

// A flat, two-sided comment thread on an invoice — used both on the business
// side (InvoiceDetail.jsx, via routes/invoices.js) and the customer portal
// (PortalDashboard.jsx, via routes/portal.js). Both sides read/write the same
// invoice_comments table; this component just takes whichever load/post
// functions match the caller's own API so it doesn't need to know which side
// it's on beyond how to label things (2026-09-16).
export default function InvoiceComments({ loadComments, postComment, viewerType }) {
  const [comments, setComments] = useState(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadComments()
      .then((data) => { if (!cancelled) setComments(data); })
      .catch(() => { if (!cancelled) setComments([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    setError("");
    try {
      const created = await postComment(message.trim());
      setComments((prev) => [...(prev || []), created]);
      setMessage("");
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="invoice-comments no-print">
      <h4>Comments</h4>
      {comments === null && <p className="muted">Loading comments...</p>}
      {comments && comments.length === 0 && <p className="muted">No comments yet.</p>}
      {comments && comments.length > 0 && (
        <ul className="invoice-comment-list">
          {comments.map((c) => (
            <li key={c.id} className={`invoice-comment invoice-comment-${c.author_type}`}>
              <div className="invoice-comment-meta">
                <strong>{c.author_name || (c.author_type === "business" ? "You" : "Customer")}</strong>
                <span className="muted">{new Date(c.created_at).toLocaleString()}</span>
              </div>
              <p>{c.message}</p>
            </li>
          ))}
        </ul>
      )}
      <form className="invoice-comment-form" onSubmit={submit}>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={viewerType === "customer" ? "Ask a question about this invoice..." : "Add a note the customer can see..."}
          rows={2}
        />
        <button type="submit" disabled={sending || !message.trim()}>{sending ? "Posting..." : "Post"}</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
