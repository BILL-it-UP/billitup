import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconMoreVertical } from "./Icons";

// The per-line "..." menu on the line item table (2026-09-21): Clone,
// Insert New Row, Insert Items in Bulk, Insert New Header, matching Zoho's
// own line item row menu (see Naveen's reference screenshots, 2026-09-21).
// Portaled onto <body>, the same escape-the-DOM-subtree pattern already
// used by ItemPicker's own suggestion dropdown, since the line item table
// sits inside its own horizontally-scrolling box, and an absolutely
// positioned dropdown left inside that box gets silently clipped vertically
// (see index.css's item-picker-dropdown comment for the full story of that
// bug). This menu would hit the exact same clipping otherwise.
export default function LineItemMenu({ onClone, onInsertRow, onInsertBulk, onInsertHeader }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      const insideBtn = btnRef.current && btnRef.current.contains(e.target);
      const insideMenu = menuRef.current && menuRef.current.contains(e.target);
      if (!insideBtn && !insideMenu) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggle = () => {
    if (!open && btnRef.current) {
      const MENU_WIDTH = 210;
      const r = btnRef.current.getBoundingClientRect();
      setRect({ top: r.bottom + 2, left: Math.max(8, r.right - MENU_WIDTH) });
    }
    setOpen((o) => !o);
  };

  const runAndClose = (fn) => {
    setOpen(false);
    fn();
  };

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        className="icon-btn line-item-menu-btn"
        onClick={toggle}
        title="More actions"
        aria-label="More actions"
      >
        <IconMoreVertical size={16} />
      </button>
      {open && rect && createPortal(
        <div ref={menuRef} className="line-item-menu" style={{ top: rect.top, left: rect.left }}>
          <button type="button" onClick={() => runAndClose(onClone)}>Clone</button>
          <button type="button" onClick={() => runAndClose(onInsertRow)}>Insert New Row</button>
          <button type="button" onClick={() => runAndClose(onInsertBulk)}>Insert Items in Bulk</button>
          <button type="button" onClick={() => runAndClose(onInsertHeader)}>Insert New Header</button>
        </div>,
        document.body
      )}
    </>
  );
}
