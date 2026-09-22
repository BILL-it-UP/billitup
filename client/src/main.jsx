import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { api, getUser } from "./lib/api";

// Anything that throws outside React's own render cycle (a bad API response
// handled badly, a timer callback, a browser extension) doesn't reach
// ErrorBoundary below — React only catches errors inside its own tree. These
// two listeners are the net for everything else: they can't recover the
// page, but they report to the same error_log ErrorBoundary reports to (see
// its own comment) so a background failure shows up on Master Admin's
// per-business health page instead of only a console nobody but that one
// person will ever open (2026-09-15).
window.addEventListener("error", (event) => {
  console.error("BillItUp: unhandled error", event.error || event.message);
  if (getUser()) api.reportClientError(event.error?.message || event.message || "Unhandled error", window.location.pathname);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("BillItUp: unhandled promise rejection", event.reason);
  if (getUser()) api.reportClientError(event.reason?.message || String(event.reason), window.location.pathname);
});

// A data router instead of the plain <BrowserRouter> App used to sit inside
// (2026-09-21). App keeps its own familiar <Routes>/<Route> tree entirely
// unchanged below, mounted as this one router's single splat route, so this
// swap is otherwise invisible, it exists only so UnsavedChangesGuard's
// useBlocker (which needs a real data router to intercept in-app navigation,
// unlike the browser's own beforeunload event, which fires regardless of
// which router is used) has one to attach to.
const router = createBrowserRouter([{ path: "*", Component: App }]);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  </StrictMode>,
);
