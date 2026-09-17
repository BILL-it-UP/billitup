import { useEffect, useRef, useState } from "react";
import ItemFormModal from "./ItemFormModal";

// A single Zoho-style "Item Details" cell: before anything is picked it's
// just a type-to-search combobox. Once an item is selected (or free-typed
// text is confirmed by leaving the field), that becomes a fixed label and a
// description box appears underneath it — one combined widget, not two
// separate always-visible fields. Owners/Admins also get an inline "+ Add
// New Item" option in the dropdown so they can add to the catalog without
// leaving the form.
export default function ItemPicker({
  items,
  itemId,
  itemName,
  description,
  canManage,
  onSelect,
  onTextChange,
  onDescriptionChange,
  onItemCreated,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(itemName || "");
  const [showAddModal, setShowAddModal] = useState(false);
  const wrapRef = useRef(null);

  // Keep the visible text in sync when the parent changes the line from
  // outside (e.g. a fresh empty line, or an item picked in another way).
  useEffect(() => {
    setQuery(itemName || "");
  }, [itemId, itemName]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = items.filter((it) =>
    it.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  const handlePick = (item) => {
    setQuery(item.name);
    setOpen(false);
    onSelect(item);
  };

  const handleInputChange = (e) => {
    const text = e.target.value;
    setQuery(text);
    setOpen(true);
    onTextChange(text);
  };

  const handleClear = () => {
    setQuery("");
    onSelect(null);
  };

  // "Confirmed" — the search box has closed with a name in it (picked from
  // the catalog or free-typed custom text). While the dropdown is open we're
  // still editing/searching, so we never show the confirmed view mid-type.
  const confirmed = Boolean((itemName || "").trim()) && !open;
  // Once there's a description at all, keep showing its box even if the item
  // name is later cleared — clearing the item should never hide text the
  // user already typed.
  const showDescription = confirmed || Boolean((description || "").trim());

  return (
    <div className="item-picker" ref={wrapRef}>
      {confirmed ? (
        <div className="item-picker-locked">
          <button type="button" className="item-picker-locked-name" onClick={() => setOpen(true)}>
            {itemName}
          </button>
          <button type="button" className="item-picker-locked-clear" onClick={handleClear} title="Clear item" aria-label="Clear item">
            &times;
          </button>
        </div>
      ) : (
        <input
          type="text"
          value={query}
          placeholder="Type or click to select an item"
          onFocus={() => setOpen(true)}
          onChange={handleInputChange}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.target.blur();
            }
          }}
        />
      )}
      {open && (
        <div className="item-picker-dropdown">
          {filtered.length === 0 && (
            <div className="item-picker-empty">
              No matching item — this line will be billed as a custom item.
            </div>
          )}
          {filtered.map((it) => (
            <button
              type="button"
              key={it.id}
              className="item-picker-option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handlePick(it)}
            >
              <span className="item-picker-name">{it.name}</span>
              <span className="item-picker-rate">₹{Number(it.rate || 0).toFixed(2)}</span>
            </button>
          ))}
          {canManage && (
            <button
              type="button"
              className="item-picker-add"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setShowAddModal(true);
                setOpen(false);
              }}
            >
              + Add New Item
            </button>
          )}
        </div>
      )}
      {showDescription && (
        <textarea
          className="item-picker-description"
          rows={2}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Add a description to your item"
        />
      )}
      {showAddModal && (
        <ItemFormModal
          initialName={query}
          onClose={() => setShowAddModal(false)}
          onSaved={(item) => {
            setShowAddModal(false);
            setQuery(item.name);
            onItemCreated(item);
          }}
        />
      )}
    </div>
  );
}
