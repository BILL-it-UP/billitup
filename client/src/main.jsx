import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

// Anything that throws outside React's own render cycle (a bad API response
// handled badly, a timer callback, a browser extension) doesn't reach
// ErrorBoundary below — React only catches errors inside its own tree. These
// two listeners are the net for everything else: they can't recover the
// page, but they guarantee the failure is visible in the console instead of
// the app just quietly stopping (2026-09-15).
window.addEventListener("error", (event) => {
  console.error("BillItUp: unhandled error", event.error || event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("BillItUp: unhandled promise rejection", event.reason);
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
