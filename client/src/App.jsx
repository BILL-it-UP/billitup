import { useEffect, useState } from "react";
import { Routes, Route, Navigate, Link, NavLink, useNavigate } from "react-router-dom";
import {
  IconDashboard, IconQuote, IconCreditNote, IconRecurring,
  IconCustomers, IconItems, IconReports, IconSettings, IconLogout, IconChevron,
  IconVendors, IconPurchases, IconPayments, IconSuggestion, IconChat, IconClock, IconTrash,
} from "./components/Icons";
import SuggestionBox from "./components/SuggestionBox";
import AnnouncementPopup from "./components/AnnouncementPopup";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import TermsAndPrivacy from "./pages/TermsAndPrivacy";
import Landing from "./pages/Landing";
import AddFirm from "./pages/AddFirm";
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
import Trash from "./pages/Trash";
import PublicInvoiceView from "./pages/PublicInvoiceView";
import PortalLogin from "./pages/PortalLogin";
import PortalSetPassword from "./pages/PortalSetPassword";
import PortalDashboard from "./pages/PortalDashboard";
import PaymentsTimeline from "./pages/PaymentsTimeline";
import Vendors from "./pages/Vendors";
import Purchases from "./pages/Purchases";
import TimeTracking from "./pages/TimeTracking";
import Reports from "./pages/Reports";
import Suggestions from "./pages/Suggestions";
import Support from "./pages/Support";
import Settings from "./pages/Settings";
import AdminLogin from "./pages/AdminLogin";
import AdminPanel from "./pages/AdminPanel";
import BusinessHealth from "./pages/BusinessHealth";
import { api, getUser, clearSession, setSession } from "./lib/api";
import { startTour, hasTourBeenSeen } from "./lib/tour";

function RequireAuth({ children }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// "/" used to always require login and bounce a logged-out visitor straight
// to /login — fine while BillItUp was only ever opened by someone who
// already had an account, but billitup.in is a real public URL now. A
// logged-out visitor gets the marketing page; a logged-in user still lands
// on their Dashboard exactly as before (2026-09-15).
function Home() {
  const user = getUser();
  if (!user) return <Landing />;
  return (
    <Shell>
      <Dashboard />
    </Shell>
  );
}

const NAV_ITEMS = [
  { to: "/", label: "Invoices", icon: IconDashboard, end: true },
  { to: "/quotes", label: "Quotes", icon: IconQuote },
  { to: "/credit-notes", label: "Credit Notes", icon: IconCreditNote },
  { to: "/recurring-invoices", label: "Recurring", icon: IconRecurring },
  { to: "/payments", label: "Payments", icon: IconPayments, ownerOnly: true },
  { to: "/vendors", label: "Vendors", icon: IconVendors, ownerOnly: true },
  { to: "/purchases", label: "Purchases", icon: IconPurchases, ownerOnly: true },
  { to: "/time-tracking", label: "Time Tracking", icon: IconClock },
  { to: "/customers", label: "Customers", icon: IconCustomers },
  { to: "/items", label: "Items", icon: IconItems },
  { to: "/reports", label: "Reports", icon: IconReports, ownerOnly: true },
  { to: "/support", label: "Support", icon: IconChat },
  { to: "/suggestions", label: "Suggestions", icon: IconSuggestion, ownerOnly: true },
  { to: "/trash", label: "Trash", icon: IconTrash, ownerOnly: true },
  { to: "/settings", label: "Settings", icon: IconSettings, ownerOnly: true },
];

// Firm switcher — only owners create/switch firms (see /api/auth/firms), so
// this only renders for role === "owner". Harmless for an owner with just
// one firm: the dropdown then just shows that one name plus "+ Add another
// firm", same as Zoho Books' organization switcher always being present.
function FirmSwitcher({ user, navigate }) {
  const [businesses, setBusinesses] = useState([]);

  useEffect(() => {
    api.getMyBusinesses().then(setBusinesses).catch(() => {});
  }, []);

  if (businesses.length === 0) return null;

  const handleChange = async (e) => {
    const value = e.target.value;
    if (value === "__add__") { navigate("/add-firm"); return; }
    const businessId = Number(value);
    if (businessId === user.business_id) return;
    try {
      const { token, user: switchedUser } = await api.switchBusiness(businessId);
      setSession(token, switchedUser);
      window.location.assign("/"); // full reload — every page's data is scoped to the active firm
    } catch {
      // If the switch fails for some reason, just leave the dropdown as-is.
    }
  };

  return (
    <select className="firm-switcher" value={user.business_id} onChange={handleChange} title="Switch firm">
      {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      <option value="__add__">+ Add another firm</option>
    </select>
  );
}

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

  // First-time product tour, pops up once, automatically, for a brand-new
  // login landing on the Dashboard (see lib/tour.js for the full step list,
  // why it's scoped to "/" specifically, and why it's skipped once seen). A
  // short delay lets the Dashboard settle before the spotlight appears
  // (2026-09-20).
  useEffect(() => {
    if (!user || window.location.pathname !== "/" || hasTourBeenSeen(user.id)) return;
    const timer = setTimeout(() => startTour(navigate, user), 700);
    return () => clearTimeout(timer);
  }, []);

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

        <SuggestionBox />

        <button type="button" className="sidebar-toggle" onClick={toggleCollapsed} title={collapsed ? "Expand" : "Collapse"}>
          <IconChevron direction={collapsed ? "right" : "left"} size={16} />
          <span className="sidebar-link-label">Collapse</span>
        </button>
      </aside>

      <AnnouncementPopup />

      <div className="app-main-col">
        <header className="no-print topbar">
          <div className="topbar-spacer">
            {user?.role === "owner" && <FirmSwitcher user={user} navigate={navigate} />}
          </div>
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
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/terms" element={<TermsAndPrivacy />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/view/invoice/:token" element={<PublicInvoiceView />} />
      <Route path="/portal/login" element={<PortalLogin />} />
      <Route path="/portal/set-password/:token" element={<PortalSetPassword />} />
      <Route path="/portal" element={<PortalDashboard />} />
      {/* Not part of the regular business login — a separate, unlinked
          console guarded by ADMIN_SECRET (see server/src/routes/admin.js),
          for flipping a business between free/premium by hand. */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="/admin/businesses/:id" element={<BusinessHealth />} />
      <Route path="/" element={<Home />} />
      <Route path="/customers" element={<RequireAuth><Shell><Customers /></Shell></RequireAuth>} />
      <Route path="/items" element={<RequireAuth><Shell><Items /></Shell></RequireAuth>} />
      <Route path="/invoices/new" element={<RequireAuth><Shell><NewInvoice /></Shell></RequireAuth>} />
      <Route path="/invoices/:id/edit" element={<RequireAuth><Shell><NewInvoice /></Shell></RequireAuth>} />
      <Route path="/invoices/:id" element={<RequireAuth><Shell><InvoiceView /></Shell></RequireAuth>} />
      <Route path="/quotes" element={<RequireAuth><Shell><Quotes /></Shell></RequireAuth>} />
      <Route path="/quotes/new" element={<RequireAuth><Shell><NewQuote /></Shell></RequireAuth>} />
      <Route path="/quotes/:id/edit" element={<RequireAuth><Shell><NewQuote /></Shell></RequireAuth>} />
      <Route path="/quotes/:id" element={<RequireAuth><Shell><QuoteView /></Shell></RequireAuth>} />
      <Route path="/credit-notes" element={<RequireAuth><Shell><CreditNotes /></Shell></RequireAuth>} />
      <Route path="/credit-notes/new" element={<RequireAuth><Shell><NewCreditNote /></Shell></RequireAuth>} />
      <Route path="/credit-notes/:id/edit" element={<RequireAuth><Shell><NewCreditNote /></Shell></RequireAuth>} />
      <Route path="/credit-notes/:id" element={<RequireAuth><Shell><CreditNoteView /></Shell></RequireAuth>} />
      <Route path="/recurring-invoices" element={<RequireAuth><Shell><RecurringInvoices /></Shell></RequireAuth>} />
      <Route path="/recurring-invoices/new" element={<RequireAuth><Shell><NewRecurringInvoice /></Shell></RequireAuth>} />
      <Route path="/recurring-invoices/:id/edit" element={<RequireAuth><Shell><NewRecurringInvoice /></Shell></RequireAuth>} />
      <Route path="/trash" element={<RequireAuth><Shell><Trash /></Shell></RequireAuth>} />
      <Route path="/payments" element={<RequireAuth><Shell><PaymentsTimeline /></Shell></RequireAuth>} />
      <Route path="/vendors" element={<RequireAuth><Shell><Vendors /></Shell></RequireAuth>} />
      <Route path="/purchases" element={<RequireAuth><Shell><Purchases /></Shell></RequireAuth>} />
      <Route path="/time-tracking" element={<RequireAuth><Shell><TimeTracking /></Shell></RequireAuth>} />
      <Route path="/reports" element={<RequireAuth><Shell><Reports /></Shell></RequireAuth>} />
      <Route path="/suggestions" element={<RequireAuth><Shell><Suggestions /></Shell></RequireAuth>} />
      <Route path="/support" element={<RequireAuth><Shell><Support /></Shell></RequireAuth>} />
      <Route path="/settings" element={<RequireAuth><Shell><Settings /></Shell></RequireAuth>} />
      <Route path="/add-firm" element={<RequireAuth><Shell><AddFirm /></Shell></RequireAuth>} />
    </Routes>
  );
}
