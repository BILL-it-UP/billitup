import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "../lib/api";
import { IconAnnouncement } from "./Icons";

// Naveen writes an announcement in Master Admin ("new feature X is live")
// and every logged-in user sees it as a popup once, the next time they open
// the app (2026-09-15) — mounted once in App.jsx's Shell so it checks on
// every authenticated page load, not just Dashboard. Shows one at a time
// and works through the queue in order, oldest first, rather than stacking
// several on screen together.
export default function AnnouncementPopup() {
  const [queue, setQueue] = useState([]);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    api.listUnreadAnnouncements().then(setQueue).catch(() => {});
  }, []);

  if (queue.length === 0) return null;
  const current = queue[0];

  const dismiss = async () => {
    setDismissing(true);
    try {
      await api.markAnnouncementRead(current.id);
    } catch {
      // If marking it read fails, it'll just show again next visit — not
      // worth blocking the dismiss over.
    }
    setQueue((q) => q.slice(1));
    setDismissing(false);
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={dismiss}>
      <div className="modal-panel announcement-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="announcement-icon-badge"><IconAnnouncement size={20} /></div>
        <h3>{current.title}</h3>
        <p style={{ whiteSpace: "pre-wrap" }}>{current.message}</p>
        <div className="modal-actions">
          <button type="button" onClick={dismiss} disabled={dismissing}>
            {queue.length > 1 ? "Next" : "Got it"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
