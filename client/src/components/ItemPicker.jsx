import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ItemFormModal from "./ItemFormModal";
import { IconEdit } from "./Icons";

// A single Zoho-style "Item Details" cell: before anything is picked it's
// just a type-to-search combobox. Once an item is selected (or free-typed
// text is confirmed by leaving the field), that becomes a fixed label and a
// description box appears underneath it — one combined widget, not two
// separate always-visible fields. Owners/Admins also get an inline "+ Add
// New Item" option in the dropdown so they can add to the catalog without
// leaving the form.
//
// Once picked, the item's name is deliberately plain text, not its own
// boxed field, matching Naveen's Zoho reference (2026-09-21): only the
// description below is meant to read as a box. A small Edit icon next to it
// (Owner/Admin only, and only for a real catalog pick, not free-typed
// custom text) opens the same Add/Edit popup used everywhere else an item
// can be edited, updating the shared catalog without touching this line's
// own already-typed rate, tax, or description.
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
  onItemUpdated,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(itemName || "");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [dropdownRect, setDropdownRect] = useState(null);
  const wrapRef = useRef(null);
  // The dropdown now lives in a portal on <body>, outside wrapRef's own DOM
  // subtree — "click outside" has to check this ref too, or clicking an
  // option or "+ Add New Item" would itself count as an outside click and
  // close the dropdown before its own onClick gets a chance to fire.
  const dropdownRef = useRef(null);

  // Keep the visible text in sync when the parent changes the line from
  // outside (e.g. a fresh empty line, or an item picked in another way).
  useEffect(() => {
    setQuery(itemName || "");
  }, [itemId, itemName]);

  useEffect(() => {
    function handleClickOutside(e) {
      const insideWrap = wrapRef.current && wrapRef.current.contains(e.target);
      const insideDropdown = dropdownRef.current && dropdownRef.current.contains(e.target);
      if (!insideWrap && !insideDropdown) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // The dropdown is portaled straight onto <body> (see the .item-picker-
  // dropdown CSS comment for why) so it needs its own position tracked in
  // JS rather than just sitting under the search box via CSS. Recomputed
  // whenever it opens, and kept in sync with scrolling (the line item table
  // scrolls horizontally in its own box, and the page itself can scroll
  // vertically) or the window resizing while it's open. Scroll events don't
  // bubble, so the listener is attached with capture:true on the window —
  // that still catches a scroll happening on any element underneath it.
  //
  // The dropdown's own width is deliberately NOT tied to the search box's
  // width. Per Zoho's own item picker (Naveen's reference screenshot,
  // 2026-09-17), the dropdown always extends a good bit past the right edge
  // of its search box, not just matches it — the item name and rate shown
  // per suggestion need more room than a single narrow table cell. So this
  // always adds extra width on top of the box's own width (not just a floor
  // that a wide-enough box would already clear on its own), floors that at
  // a reasonable minimum for a very narrow box, and clamps the result so it
  // never runs past the right edge of the viewport. It's left free to spill
  // out over whatever sits below/beside the search cell (it's on <body>,
  // above everything else, so nothing beneath it is disturbed).
  useEffect(() => {
    if (!open) return;
    const EXTRA_WIDTH = 160;
    const MIN_DROPDOWN_WIDTH = 360;
    const VIEWPORT_MARGIN = 16;
    const updatePosition = () => {
      if (!wrapRef.current) return;
      const rect = wrapRef.current.getBoundingClientRect();
      const desiredWidth = Math.max(rect.width + EXTRA_WIDTH, MIN_DROPDOWN_WIDTH);
      const maxWidth = window.innerWidth - rect.left - VIEWPORT_MARGIN;
      const width = Math.min(desiredWidth, maxWidth);
      setDropdownRect({ top: rect.bottom, left: rect.left, width });
    };
    updatePosition();
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

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
  // Only a real catalog item (picked from the dropdown, not free-typed
  // custom text) has anything to edit here.
  const pickedItem = itemId ? items.find((it) => String(it.id) === String(itemId)) : null;

  return (
    <div className="item-picker" ref={wrapRef}>
      {confirmed ? (
        <div className="item-picker-locked">
          <button type="button" className="item-picker-locked-name" onClick={() => setOpen(true)}>
            {itemName}
          </button>
          <div className="item-picker-locked-actions">
            {canManage && pickedItem && (
              <button
                type="button"
                className="icon-btn"
                title="Edit item"
                aria-label="Edit item"
                onClick={() => setShowEditModal(true)}
              >
                <IconEdit size={14} />
              </button>
            )}
            <button type="button" className="item-picker-locked-clear" onClick={handleClear} title="Clear item" aria-label="Clear item">
              &times;
            </button>
          </div>
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
      {open && dropdownRect && createPortal(
        <div
          ref={dropdownRef}
          className="item-picker-dropdown"
          style={{ top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width }}
        >
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
        </div>,
        document.body
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
      {showEditModal && pickedItem && (
        <ItemFormModal
          item={pickedItem}
          onClose={() => setShowEditModal(false)}
          onSaved={(item) => {
            setShowEditModal(false);
            setQuery(item.name);
            onItemUpdated(item);
          }}
        />
      )}
    </div>
  );
}
