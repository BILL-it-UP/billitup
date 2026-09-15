import { Component } from "react";
import { IconAlert } from "./Icons";

// Catches any error thrown while rendering the app below it and shows a
// normal-looking "something went wrong" screen instead of the blank white
// page React leaves behind by default when a render error goes uncaught.
// Wrapped around the whole app in main.jsx (2026-09-15) — Naveen specifically
// asked that the site never go blank or look dead when something breaks.
//
// This only catches render/lifecycle errors in the React tree below it (per
// React's own rules) — it does not catch errors inside event handlers or
// async code, which already show up as console errors without blanking the
// page, and it does not catch errors in itself. window.onerror /
// unhandledrejection listeners below are a second, wider net for those other
// cases: they can't recover the page like this can, but they make sure a
// silent background failure still leaves a trace in the console for anyone
// who checks, and log the error id to the same place so both paths look the
// same to whoever's fixing it later.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Logged to the console rather than sent anywhere — BillItUp has no
    // server-side error-reporting endpoint yet. Anyone reproducing an issue
    // for Naveen can still paste this from their browser console.
    console.error("BillItUp crashed while rendering:", error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="simple-auth-page">
        <div className="simple-auth-card">
          <img src="/logo-icon-512.png" alt="" className="simple-auth-logo" />
          <div className="simple-auth-icon-badge crash-icon-badge">
            <IconAlert size={22} />
          </div>
          <h1>Something went wrong</h1>
          <p className="simple-auth-subtitle">
            This page hit an unexpected error. Your data is safe, this is just
            the screen failing to display. Reloading almost always fixes it.
          </p>
          <button type="button" className="btn crash-reload-btn" onClick={() => window.location.reload()}>
            Reload page
          </button>
          <div className="simple-auth-links">
            <a href="/">Back to dashboard</a>
          </div>
        </div>
      </div>
    );
  }
}
