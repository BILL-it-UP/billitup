import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { IconTrash } from "../components/Icons";

// Owner/Admin review queue for suggestions submitted by any logged-in user
// via the sidebar SuggestionBox — same sensitivity tier as Reports/Vendors
// (only the person running the business needs to see the whole list).
export default function Suggestions() {
  const [suggestions, setSuggestions] = useState(null);
  const [filter, setFilter] = useState("open");
  const [error, setError] = useState("");

  const load = () => api.listSuggestions().then(setSuggestions);
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (!suggestions) return [];
    if (filter === "all") return suggestions;
    return suggestions.filter((s) => s.status === filter);
  }, [suggestions, filter]);

  const handleToggle = async (s) => {
    setError("");
    try {
      await api.setSuggestionStatus(s.id, s.status === "open" ? "done" : "open");
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    setError("");
    try {
      await api.deleteSuggestion(id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!suggestions) return <p className="muted">Loading...</p>;

  const openCount = suggestions.filter((s) => s.status === "open").length;

  return (
    <div>
      <div className="page-header">
        <h1>Suggestions</h1>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Feature requests and feedback submitted by your team from the sidebar. Mark one done once it's handled,
        or delete it if it's not something you'll act on.
      </p>

      {suggestions.length === 0 ? (
        <p className="muted">No suggestions yet.</p>
      ) : (
        <>
          <div className="list-toolbar">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="open">Open ({openCount})</option>
              <option value="done">Done</option>
              <option value="all">All</option>
            </select>
          </div>
          {error && <p className="error">{error}</p>}

          {filtered.length === 0 ? (
            <p className="list-empty-filtered">Nothing here.</p>
          ) : (
            <table className="table">
              <thead><tr><th>Date</th><th>From</th><th>Area</th><th>Suggestion</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td>{String(s.created_at).slice(0, 10)}</td>
                    <td>{s.user_name || "—"}</td>
                    <td>{s.category || "General"}</td>
                    <td style={{ whiteSpace: "pre-wrap" }}>{s.message}</td>
                    <td>
                      <button type="button" className="link-btn" onClick={() => handleToggle(s)}>
                        {s.status === "open" ? "Mark done" : "Reopen"}
                      </button>
                    </td>
                    <td>
                      <button type="button" className="link-btn" onClick={() => handleDelete(s.id)} title="Delete">
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
