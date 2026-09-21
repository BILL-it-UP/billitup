import { useState } from "react";
import { createPortal } from "react-dom";

// "Insert Items in Bulk" (2026-09-21), picks several catalog items at once
// and adds each as its own new line, instead of adding one item at a time
// through the search box on every line. Matches what Zoho's own line item
// row menu offers under the same name (see Naveen's reference screenshots).
export default function InsertItemsBulkModal({ items, symbol = "₹", onClose, onInsert }) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);

  const filtered = items.filter((it) => it.name.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Insert Items in Bulk</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div>
          <input
            className="block"
            style={{ maxWidth: "none" }}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items"
            autoFocus
          />
          <div className="bulk-item-list">
            {items.length === 0 && <p className="muted">Your item catalog is empty. Add an item first from the Items page.</p>}
            {items.length > 0 && filtered.length === 0 && <p className="muted">No items match "{query}".</p>}
            {filtered.map((it) => (
              <label key={it.id} className="checkbox-row">
                <input type="checkbox" checked={selectedIds.includes(it.id)} onChange={() => toggle(it.id)} />
                {it.name} ({symbol}{Number(it.rate || 0).toFixed(2)})
              </label>
            ))}
          </div>
          <div className="modal-actions">
            <button type="button" className="link-btn" onClick={onClose}>Cancel</button>
            <button
              type="button"
              disabled={selectedIds.length === 0}
              onClick={() => onInsert(items.filter((it) => selectedIds.includes(it.id)))}
            >
              {selectedIds.length > 0 ? `Add ${selectedIds.length} Item${selectedIds.length === 1 ? "" : "s"}` : "Add Items"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
