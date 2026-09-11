import { useState } from "react";
import { Routes, Route, Navigate, Link, NavLink, useNavigate } from "react-router-dom";
import {
  IconDashboard, IconQuote, IconCreditNote, IconRecurring,
  IconCustomers, IconItems, IconReports, IconSettings, IconLogout, IconChevron,
} from "./components/Icons";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Items from "./pages/Items";
import NewInvoice from "./pages/NewInvoice";
import InvoiceView from "./pages/InvoiceView";
import Quotes from "./pages/Quotes";
import NewQuote from "./pages/NewQuote";
import QuoteView from "./pages/QuoteView";
import CreditNotes from "./pages/CreditNotes";
import NewCreditNote from "./pages/NewCreditNote";
import CreditNoteView from "./pages/CreditNoteView";
import RecurringInvoices from "./pages/RecurringInvoices";
import NewRecurringInvoice from "./pages/NewRecurringInvoice";
import PublicInvoiceView from "./pages/PublicInvoiceView";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import { getUser, clearSession } from "./lib/api";

function RequireAuth({ children }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

const NAV_ITEMS = [
  { to: "/", label: "Invoices", icon: IconDashboard, end: true },
  { to: "/quotes", label: "Quotes", icon: IconQuote },
  { to: "/credit-notes", label: "Credit Notes", icon: IconCreditNote },
  { to: "/recurring-invoices", label: "Recurring", icon: IconRecurring },
  { to: "/customers", label: "Customers", icon: IconCustomers },
  { to: "/items", label: "Items", icon: IconItems },
  { to: "/reports", label: "Reports", icon: IconReports, ownerOnly: true },
  { to: "/settings", label: "Settings", icon: IconSettings, ownerOnly: true },
];

function Shell({ children }) {
  const navigate = useNavigate();
  const user = getUser();
  const logout = () => { clearSession(); navigate("/login"); };
  const isOwnerOrAdmin = user?.role === "owner" || user?.role === "admin";
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("billitup_sidebar_collapsed") === "1"; } catch { return false; }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("billitup_sidebar_collapsed", next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  const initials = (user?.name || "?").trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("");

  return (
    <div className={`app-shell${collapsed ? " sidebar-collapsed" : ""}`}>
      <aside className="no-print sidebar">
        <Link to="/" className="sidebar-brand">
          <span className="sidebar-brand-mark"><img src="/logo-icon-512.png" alt="" /></span>
          <span className="sidebar-brand-word">Bill<em>it</em>Up</span>
        </Link>

        <nav className="sidebar-nav">
          {NAV_ITEMS.filter((item) => !item.ownerOnly || isOwnerOrAdmin).map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
              title={label}
            >
              <Icon />
              <span className="sidebar-link-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <button type="button" className="sidebar-toggle" onClick={toggleCollapsed} title={collapsed ? "Expand" : "Collapse"}>
          <IconChevron direction={collapsed ? "right" : "left"} size={16} />
          <span className="sidebar-link-label">Collapse</span>
        </button>
      </aside>

      <div className="app-main-col">
        <header className="no-print topbar">
          <div className="topbar-spacer" />
          {user && (
            <div className="topbar-user">
              <span className="topbar-avatar">{initials}</span>
              <span className="topbar-user-text">
                <strong>{user.name}</strong>
                <span className="muted">{user.role}</span>
              </span>
              <button className="link-btn topbar-logout" onClick={logout} title="Log out">
                <IconLogout size={17} />
              </button>
            </div>
          )}
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/signup" element={<Signup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/view/invoice/:token" element={<PublicInvoiceView />} />
      <Route path="/" element={<RequireAuth><Shell><Dashboard /></Shell></RequireAuth>} />
      <Route path="/customers" element={<RequireAuth><Shell><Customers /></Shell></RequireAuth>} />
      <Route path="/items" element={<RequireAuth><Shell><Items /></Shell></RequireAuth>} />
      <Route path="/invoices/new" element={<RequireAuth><Shell><NewInvoice /></Shell></RequireAuth>} />
      <Route path="/invoices/:id" element={<RequireAuth><Shell><InvoiceView /></Shell></RequireAuth>} />
      <Route path="/quotes" element={<RequireAuth><Shell><Quotes /></Shell></RequireAuth>} />
      <Route path="/quotes/new" element={<RequireAuth><Shell><NewQuote /></Shell></RequireAuth>} />
      <Route path="/quotes/:id" element={<RequireAuth><Shell><QuoteView /></Shell></RequireAuth>} />
      <Route path="/credit-notes" element={<RequireAuth><Shell><CreditNotes /></Shell></RequireAuth>} />
      <Route path="/credit-notes/new" element={<RequireAuth><Shell><NewCreditNote /></Shell></RequireAuth>} />
      <Route path="/credit-notes/:id" element={<RequireAuth><Shell><CreditNoteView /></Shell></RequireAuth>} />
      <Route path="/recurring-invoices" element={<RequireAuth><Shell><RecurringInvoices /></Shell></RequireAuth>} />
      <Route path="/recurring-invoices/new" element={<RequireAuth><Shell><NewRecurringInvoice /></Shell></RequireAuth>} />
      <Route path="/reports" element={<RequireAuth><Shell><Reports /></Shell></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><Shell><Settings /></Shell></RequireAuth>} />
    </Routes>
  );
}
