import { useEffect, useState } from "react";
import { useBlocker } from "react-router-dom";
import { createPortal } from "react-dom";

// Warns before unsaved work is lost, matching what Naveen flagged from Zoho's
// own behavior: leaving the browser tab or window entirely (its own native
// "Leave this page?" dialog, which only ever offers Stay/Leave, a browser
// limitation, no custom buttons or a Save action are possible there), and
// navigating to a different page inside the app itself, which never triggers
// that native dialog since it's just a route change, not a real page unload
// (2026-09-21). isDirty decides whether either warning is armed at all;
// onSaveAndLeave is called for the in-app dialog's own "Save & Leave" button
// and should save the form and throw (or reject) on failure so the dialog
// can show the error and stay open rather than losing the user's work.
export default function UnsavedChangesGuard({ isDirty, onSaveAndLeave }) {
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      setSaveError("");
      setSaving(false);
    }
  }, [blocker.state]);

  if (blocker.state !== "blocked") return null;

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await onSaveAndLeave();
      blocker.proceed();
    } catch (err) {
      setSaveError(err.message || "Could not save. Fix the error above, or discard your changes instead.");
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-backdrop" onMouseDown={() => blocker.reset()}>
      <div className="modal-panel" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Leave this page?</h3>
          <button type="button" className="modal-close" onClick={() => blocker.reset()} aria-label="Close">
            &times;
          </button>
        </div>
        <div>
          <p className="muted">
            You have unsaved changes here. Save them before you go, or discard them and leave anyway.
          </p>
          {saveError && <p className="error">{saveError}</p>}
          <div className="modal-actions">
            <button type="button" className="link-btn" onClick={() => blocker.reset()} disabled={saving}>
              Keep Editing
            </button>
            <button type="button" className="btn-danger" onClick={() => blocker.proceed()} disabled={saving}>
              Discard Changes
            </button>
            <button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save & Leave"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
