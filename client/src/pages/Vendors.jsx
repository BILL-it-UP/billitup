import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { exportSheet } from "../lib/exportExcel";
import { INDIAN_STATES } from "../lib/gst";
import ConfirmDialog from "../components/ConfirmDialog";

const BLANK_VENDOR_FORM = { name: "", phone: "", email: "", address: "", pincode: "", country: "India", gstin: "", state: "" };

// Vendors/suppliers a business buys from — the other side of Customers,
// kept as its own simple list so Purchases has someone to attach a bill to.
// Owner/Admin only, same sensitivity tier as Reports (see routes/vendors.js).
// Brought up to the same Add/Edit/Delete pattern as the Customers page
// (2026-09-15): a popup Add form instead of the old always-open inline row,
// plus edit and delete, which vendors never had before.
export default function Vendors() {
  const [vendors, setVendors] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [form, setForm] = useState(BLANK_VENDOR_FORM);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = () => api.listVendors().then(setVendors);
  useEffect(() => { load(); }, []);

  const filteredVendors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) =>
      (v.name || "").toLowerCase().includes(q) ||
      (v.phone || "").toLowerCase().includes(q) ||
      (v.email || "").toLowerCase().includes(q) ||
      (v.gstin || "").toLowerCase().includes(q)
    );
  }, [vendors, search]);

  const openAddModal = () => {
    setForm(BLANK_VENDOR_FORM);
    setError("");
    setShowAddModal(true);
  };

  const closeAddModal = () => {
    setShowAddModal(false);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.createVendor(form);
      setForm(BLANK_VENDOR_FORM);
      setShowAddModal(false);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const startEdit = (v) => {
    setEditingId(v.id);
    setEditError("");
    setEditForm({
      name: v.name || "",
      phone: v.phone || "",
      email: v.email || "",
      address: v.address || "",
      pincode: v.pincode || "",
      country: v.country || "India",
      gstin: v.gstin || "",
      state: v.state || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
    setEditError("");
  };

  const saveEdit = async (id) => {
    setEditSaving(true);
    setEditError("");
    try {
      const updated = await api.updateVendor(id, editForm);
      setVendors((prev) => prev.map((v) => (v.id === id ? { ...v, ...updated } : v)));
      cancelEdit();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteVendor(deleteTarget.id);
      setVendors((prev) => prev.filter((v) => v.id !== deleteTarget.id));
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
        <h1>Vendors</h1>
        <div className="form-row" style={{ gap: 12 }}>
          <button type="button" onClick={openAddModal}>+ Add Vendor</button>
          {vendors.length > 0 && (
            <button type="button" className="link-btn" onClick={() => exportVendorsToExcel(vendors)}>
              Export to Excel
            </button>
          )}
        </div>
      </div>
      {error && !showAddModal && <p className="error">{error}</p>}

      {showAddModal && (
        <div className="modal-backdrop" onMouseDown={closeAddModal}>
          <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Vendor</h3>
              <button type="button" className="modal-close" onClick={closeAddModal} aria-label="Close">
                &times;
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <label className="block">
                Name
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
              </label>
              <div className="form-row">
                <label className="block">
                  Phone
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </label>
                <label className="block">
                  Email
                  <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </label>
              </div>
              <label className="block">
                Address
                <textarea
                  rows={2}
                  placeholder="Building, street, area..."
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </label>
              <div className="form-row">
                <label className="block">
                  PIN code
                  <input value={form.pincode} onChange={(e) => setForm({ ...form, pincode: e.target.value })} />
                </label>
                <label className="block">
                  Country
                  <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                </label>
              </div>
              <div className="form-row">
                <label className="block">
                  GSTIN (optional)
                  <input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} />
                </label>
                <label className="block">
                  State
                  <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}>
                    <option value="">State (optional)</option>
                    {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
              </div>
              {error && <p className="error">{error}</p>}
              <div className="modal-actions">
                <button type="button" className="link-btn" onClick={closeAddModal}>Cancel</button>
                <button type="submit">Add Vendor</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {vendors.length > 0 && (
        <div className="list-toolbar">
          <input
            type="search"
            placeholder="Search by name, phone, email, GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {vendors.length === 0 && <p className="muted">No vendors yet. Add one above to start logging purchases against them.</p>}
      {filteredVendors.length === 0 && vendors.length > 0 && (
        <p className="list-empty-filtered">No vendors match your search.</p>
      )}

      {filteredVendors.length > 0 && (
        <table className="table">
          <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th>GSTIN</th><th>State</th><th></th></tr></thead>
          <tbody>
            {filteredVendors.map((v) => {
              const isEditing = editingId === v.id;

              if (isEditing) {
                return (
                  <tr key={v.id}>
                    <td><input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required /></td>
                    <td><input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></td>
                    <td><input value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></td>
                    <td>
                      <textarea
                        className="address-textarea"
                        rows={2}
                        value={editForm.address}
                        onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                      />
                      <input className="pincode-input" placeholder="PIN code" value={editForm.pincode} onChange={(e) => setEditForm({ ...editForm, pincode: e.target.value })} />
                      <input className="country-input" placeholder="Country" value={editForm.country} onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} />
                    </td>
                    <td><input value={editForm.gstin} onChange={(e) => setEditForm({ ...editForm, gstin: e.target.value })} /></td>
                    <td>
                      <select value={editForm.state} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}>
                        <option value="">State</option>
                        {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                    <td>
                      <button type="button" className="link-btn" disabled={editSaving} onClick={() => saveEdit(v.id)}>{editSaving ? "Saving..." : "Save"}</button>
                      {" · "}
                      <button type="button" className="link-btn" disabled={editSaving} onClick={cancelEdit}>Cancel</button>
                      {editError && <div className="error" style={{ fontSize: 12, marginTop: 4 }}>{editError}</div>}
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={v.id}>
                  <td>{v.name}</td><td>{v.phone}</td><td>{v.email}</td>
                  <td>{[v.address, v.pincode, v.country].filter(Boolean).join(", ")}</td>
                  <td>{v.gstin}</td><td>{v.state}</td>
                  <td>
                    <button type="button" className="link-btn" onClick={() => startEdit(v)}>Edit</button>
                    {" · "}
                    <button type="button" className="link-btn" onClick={() => setDeleteTarget(v)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete this vendor?"
          message={`This removes "${deleteTarget.name}" from your vendor list. It can't be undone. Any purchase bills already logged against them keep their amounts, they just won't show a vendor name anymore.`}
          confirmLabel="Delete Vendor"
          danger
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function exportVendorsToExcel(vendors) {
  const rows = vendors.map((v) => ({
    Name: v.name, Phone: v.phone || "", Email: v.email || "",
    Address: v.address || "", "PIN Code": v.pincode || "", Country: v.country || "",
    GSTIN: v.gstin || "", State: v.state || "",
  }));
  exportSheet("vendors.xlsx", "Vendors", rows);
}
