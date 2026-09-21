import { useRef, useState } from "react";
import { emptyLine, emptyHeader, lineAmount, isHeaderLine } from "../lib/lineItemMath";
import { formatMoney } from "../lib/format";
import ItemPicker from "./ItemPicker";
import TaxRateInput from "./TaxRateInput";
import UnitSelect from "./UnitSelect";
import LineItemMenu from "./LineItemMenu";
import InsertItemsBulkModal from "./InsertItemsBulkModal";
import { IconDragHandle } from "./Icons";

// The shared line item table for New/Edit Invoice, Quote, and Credit Note
// (2026-09-21). Before this, each of the three had its own separate,
// duplicated table markup (Invoice's own copy also carried the extra HSN/SAC
// and Unit columns Quotes and Credit Notes never got, see the per-line
// HSN/SAC round). Pulling the shared parts into one component is what makes
// this round's four additions (drag to reorder, a per-line "..." menu, a
// hover highlight, and section headers) land identically on all three,
// instead of needing to be built and kept in sync three separate times,
// matching the reference behavior Naveen sent from Zoho's own line item
// table, 2026-09-21.
//
// showHsnUnit is Invoice-only, matching where HSN/SAC and Unit already live
// (see the per-line HSN/SAC round's "Known scope limits" note). Quotes and
// Credit Notes never carried those two fields and don't gain them here.
export default function LineItemsTable({
  lines,
  setLines,
  items,
  canManageItems,
  onItemCreated,
  showHsnUnit = false,
  symbol = "₹",
}) {
  const [bulkModalIndex, setBulkModalIndex] = useState(null);
  // The index currently being dragged, tracked outside React state. This
  // changes many times a second while dragging, and only ever matters at
  // drop time, so re-rendering on every dragover would just be wasted work.
  const dragIndexRef = useRef(null);

  const updateLine = (index, patch) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  };

  // Selecting an item from the picker fills in its rate/tax, and only if
  // the description is still blank, its description too, so re-picking an
  // item never clobbers text the user already typed for this line.
  const pickItem = (index, item) => {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        if (!item) return { ...line, item_id: "", item_name: "" };
        return {
          ...line,
          item_id: item.id,
          item_name: item.name,
          rate: item.rate,
          tax_rate: item.tax_rate,
          description: line.description || item.description || item.name,
          ...(showHsnUnit ? { unit: item.unit || "", hsn_sac_code: item.hsn_sac_code || "" } : {}),
        };
      })
    );
  };

  const handleItemCreated = (index, item) => {
    onItemCreated(item);
    pickItem(index, item);
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const addHeader = () => setLines((prev) => [...prev, emptyHeader()]);
  const removeLine = (index) => setLines((prev) => prev.filter((_, i) => i !== index));

  const insertAfter = (index, newLine) => {
    setLines((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, newLine);
      return next;
    });
  };

  // Duplicates everything about the line except the two internal tags that
  // link a line back to a specific unbilled time entry or billable expense
  // (New Invoice only, see NewInvoice.jsx). Cloning that line was never
  // meant to also clone which time entry it's attached to, that would make
  // two lines both claim to represent the same logged hours.
  const cloneLine = (index) => {
    const { _time_entry_id, _billable_purchase_id, ...rest } = lines[index];
    insertAfter(index, { ...rest });
  };

  const insertRowAfter = (index) => insertAfter(index, emptyLine());
  const insertHeaderAfter = (index) => insertAfter(index, emptyHeader());

  const insertBulkItems = (index, chosenItems) => {
    setLines((prev) => {
      const next = [...prev];
      const newLines = chosenItems.map((item) => ({
        ...emptyLine(),
        item_id: item.id,
        item_name: item.name,
        rate: item.rate,
        tax_rate: item.tax_rate,
        description: item.description || item.name,
        ...(showHsnUnit ? { unit: item.unit || "", hsn_sac_code: item.hsn_sac_code || "" } : {}),
      }));
      next.splice(index + 1, 0, ...newLines);
      return next;
    });
    setBulkModalIndex(null);
  };

  const reorder = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    setLines((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const colSpan = showHsnUnit ? 10 : 8;

  return (
    <>
      <div className="line-item-table-wrap">
        <table className="table line-item-table">
          <thead>
            <tr>
              <th />
              <th>Item &amp; Description</th>
              {showHsnUnit && <th>HSN/SAC</th>}
              <th>Qty</th>
              {showHsnUnit && <th>Unit</th>}
              <th>Rate</th>
              <th>Discount</th>
              <th>Tax %</th>
              <th>Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => {
              const menu = (
                <LineItemMenu
                  onClone={() => cloneLine(i)}
                  onInsertRow={() => insertRowAfter(i)}
                  onInsertBulk={() => setBulkModalIndex(i)}
                  onInsertHeader={() => insertHeaderAfter(i)}
                />
              );
              const dragHandle = (
                <span
                  className="line-drag-handle"
                  draggable
                  onDragStart={(e) => {
                    dragIndexRef.current = i;
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  title="Drag to reorder"
                  aria-label="Drag to reorder"
                >
                  <IconDragHandle size={16} />
                </span>
              );
              const rowProps = {
                onDragOver: (e) => e.preventDefault(),
                onDrop: (e) => {
                  e.preventDefault();
                  const from = dragIndexRef.current;
                  dragIndexRef.current = null;
                  if (from === null || from === i) return;
                  reorder(from, i);
                },
              };

              if (isHeaderLine(line)) {
                return (
                  <tr key={i} className="line-item-header-row" {...rowProps}>
                    <td className="line-item-drag">{dragHandle}</td>
                    <td colSpan={colSpan - 2}>
                      <input
                        className="line-item-header-input"
                        value={line.description}
                        onChange={(e) => updateLine(i, { description: e.target.value })}
                        placeholder="Add New Header"
                      />
                    </td>
                    <td className="line-item-actions">
                      {menu}
                      {lines.length > 1 && (
                        <button type="button" className="icon-btn line-item-remove" onClick={() => removeLine(i)} title="Remove" aria-label="Remove">
                          &times;
                        </button>
                      )}
                    </td>
                  </tr>
                );
              }

              const lineItemType = items.find((it) => String(it.id) === String(line.item_id))?.type || "goods";
              return (
                <tr key={i} className="line-item-row" {...rowProps}>
                  <td className="line-item-drag">{dragHandle}</td>
                  <td className="line-item-details">
                    <div className="line-item-details-inner">
                      <ItemPicker
                        items={items}
                        itemId={line.item_id}
                        itemName={line.item_name}
                        description={line.description}
                        canManage={canManageItems}
                        onSelect={(item) => pickItem(i, item)}
                        onTextChange={(text) => updateLine(i, { item_id: "", item_name: text })}
                        onDescriptionChange={(text) => updateLine(i, { description: text })}
                        onItemCreated={(item) => handleItemCreated(i, item)}
                      />
                    </div>
                  </td>
                  {showHsnUnit && (
                    <td style={{ width: 90 }}>
                      <input className="num" value={line.hsn_sac_code || ""} onChange={(e) => updateLine(i, { hsn_sac_code: e.target.value })} />
                    </td>
                  )}
                  <td style={{ width: 64 }}>
                    <input type="number" step="0.01" className="num" value={line.qty} onChange={(e) => updateLine(i, { qty: e.target.value })} />
                  </td>
                  {showHsnUnit && (
                    <td style={{ width: 140 }}>
                      <UnitSelect type={lineItemType} value={line.unit} onChange={(v) => updateLine(i, { unit: v })} />
                    </td>
                  )}
                  <td style={{ width: 90 }}>
                    <input type="number" step="0.01" className="num" value={line.rate} onChange={(e) => updateLine(i, { rate: e.target.value })} />
                  </td>
                  <td style={{ width: 90 }}>
                    <input type="number" step="0.01" className="num" value={line.discount} onChange={(e) => updateLine(i, { discount: e.target.value })} />
                  </td>
                  <td style={{ width: 90 }}>
                    <TaxRateInput className="num" value={line.tax_rate} onChange={(v) => updateLine(i, { tax_rate: v })} />
                  </td>
                  <td className="num">{symbol}{formatMoney(lineAmount(line))}</td>
                  <td className="line-item-actions">
                    {menu}
                    {lines.length > 1 && (
                      <button type="button" className="icon-btn line-item-remove" onClick={() => removeLine(i)} title="Remove" aria-label="Remove">
                        &times;
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="line-item-add-row">
        <button type="button" className="link-btn" onClick={addLine}>+ Add line</button>
        <button type="button" className="link-btn" onClick={addHeader}>+ Add header</button>
      </div>

      {bulkModalIndex !== null && (
        <InsertItemsBulkModal
          items={items}
          symbol={symbol}
          onClose={() => setBulkModalIndex(null)}
          onInsert={(chosen) => insertBulkItems(bulkModalIndex, chosen)}
        />
      )}
    </>
  );
}
