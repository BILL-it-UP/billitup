import { useEffect, useMemo, useState } from "react";
import { api, getUser } from "../lib/api";
import { exportSheet } from "../lib/exportExcel";
import ItemFormModal from "../components/ItemFormModal";
import ConfirmDialog from "../components/ConfirmDialog";
import { IconEdit, IconTrash } from "../components/Icons";

export default function Items() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  // null = closed, {} = Add mode, an item object = Edit mode for that item.
  const [modalItem, setModalItem] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const canManage = ["owner", "admin"].includes(getUser()?.role);

  const load = () => api.listItems().then(setItems);
  useEffect(() => { load(); }, []);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) =>
      (i.name || "").toLowerCase().includes(q) ||
      (i.hsn_sac_code || "").toLowerCase().includes(q)
    );
  }, [items, search]);

  const openAdd = () => { setModalItem(null); setShowModal(true); setError(""); };
  const openEdit = (item) => { setModalItem(item); setShowModal(true); setError(""); };

  const handleSaved = () => {
    setShowModal(false);
    load();
  };

  // Deleting is blocked server-side (with a clear message) for any item
  // already used on an invoice, quote, or purchase — see the comment on the
  // DELETE route in server/src/routes/items.js. That error surfaces here the
  // same way any other save error does.
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteItem(deleteTarget.id);
      setItems((prev) => prev.filter((i) => i.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err.message);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Items</h1>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {items.length > 0 && (
            <button type="button" className="link-btn" onClick={() => exportItemsToExcel(items)}>
              Export to Excel
            </button>
          )}
          {canManage && (
            <button type="button" onClick={openAdd} data-tour="items-add-button">+ Add Item</button>
          )}
        </div>
      </div>
      {!canManage && <p className="muted">Ask an Owner or Admin to add or edit items.</p>}
      {error && <p className="error">{error}</p>}

      {items.length > 0 && (
        <div className="list-toolbar">
          <input
            type="search"
            placeholder="Search by name or HSN/SAC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {filteredItems.length === 0 && items.length > 0 && (
        <p className="list-empty-filtered">No items match your search.</p>
      )}

      <table className="table">
        <thead>
          <tr>
            <th>Name</th><th>Type</th><th>Unit</th><th>Rate</th><th>Tax %</th><th>HSN/SAC</th><th>Sales Account</th>
            {canManage && <th />}
          </tr>
        </thead>
        <tbody>
          {filteredItems.map((i) => (
            <tr key={i.id}>
              <td>{i.name}</td><td>{i.type === "service" ? "Service" : "Goods"}</td><td>{i.unit}</td><td>₹{i.rate}</td><td>{i.tax_rate}%</td><td>{i.hsn_sac_code}</td>
              <td>{i.sales_account || ""}</td>
              {canManage && (
                <td className="item-row-actions">
                  <button type="button" className="icon-btn" onClick={() => openEdit(i)} title="Edit item" aria-label="Edit item">
                    <IconEdit size={16} />
                  </button>
                  <button type="button" className="icon-btn" onClick={() => setDeleteTarget(i)} title="Delete item" aria-label="Delete item">
                    <IconTrash size={16} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {showModal && (
        <ItemFormModal
          item={modalItem}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this item?"
          message={`This removes "${deleteTarget.name}" from your item catalog. It can't be undone. If it's already been used on an invoice, quote, or purchase, deleting it won't be allowed, you'll see a message explaining why instead.`}
          confirmLabel="Delete Item"
          danger
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function exportItemsToExcel(items) {
  const rows = items.map((i) => ({
    Name: i.name,
    Type: i.type === "service" ? "Service" : "Goods",
    Unit: i.unit || "",
    Rate: Number(i.rate),
    "Tax %": Number(i.tax_rate) || 0,
    "HSN/SAC": i.hsn_sac_code || "",
    Description: i.description || "",
    "Sales Account": i.sales_account || "",
    "Cost Price": i.cost_price != null ? Number(i.cost_price) : "",
    "Purchase Account": i.purchase_account || "",
    "Purchase Description": i.purchase_description || "",
  }));
  exportSheet("items.xlsx", "Items", rows);
}
