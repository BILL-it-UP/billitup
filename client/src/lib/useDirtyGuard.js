import { useEffect, useRef } from "react";

// Tracks whether a New/Edit form has unsaved changes, for UnsavedChangesGuard
// to warn on before it lets the user navigate away (2026-09-21). Rather than
// hand-tracking a "dirty" flag on every single field's own onChange, which is
// easy to miss one of on a form this size, this just compares a JSON snapshot
// of the same payload object the form already builds for saving against a
// baseline captured once the form has finished loading its starting data.
// getSnapshot should be the page's own buildPayload()-style function (or
// anything returning a plain object built from current state); ready should
// stay false until every piece of state that snapshot depends on, including
// anything set asynchronously after the page's own data fetches resolve, has
// actually settled, or the baseline would be captured too early and the form
// would look dirty the moment those fetches land even though the user never
// touched anything.
export function useDirtyGuard(getSnapshot, ready) {
  const baselineRef = useRef(null);

  useEffect(() => {
    if (ready && baselineRef.current === null) {
      baselineRef.current = JSON.stringify(getSnapshot());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const isDirty = ready && baselineRef.current !== null && JSON.stringify(getSnapshot()) !== baselineRef.current;

  // Called right after a successful save, before navigating anywhere, so the
  // form is no longer considered dirty by the time any post-save navigate()
  // call runs (otherwise that navigate would immediately trip its own guard).
  const markClean = () => {
    baselineRef.current = JSON.stringify(getSnapshot());
  };

  return { isDirty, markClean };
}
