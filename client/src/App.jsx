import { Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import Signup from "./pages/Signup";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Items from "./pages/Items";
import NewInvoice from "./pages/NewInvoice";
import InvoiceView from "./pages/InvoiceView";
import { getUser, clearSession } from "./lib/api";

function RequireAuth({ children }) {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function Shell({ children }) {
  const navigate = useNavigate();
  const user = getUser();
  const logout = () => { clearSession(); navigate("/login"); };

  return (
    <div className="app-shell">
      <header className="no-print top-nav">
        <div className="brand">BillItUp</div>
        <nav>
          <Link to="/">Invoices</Link>
          <Link to="/customers">Customers</Link>
          <Link to="/items">Items</Link>
        </nav>
        <div className="nav-user">
          {user && <span>{user.name} ({user.role})</span>}
          {user && <button className="link-btn" onClick={logout}>Log out</button>}
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/signup" element={<Signup />} />
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<RequireAuth><Shell><Dashboard /></Shell></RequireAuth>} />
      <Route path="/customers" element={<RequireAuth><Shell><Customers /></Shell></RequireAuth>} />
      <Route path="/items" element={<RequireAuth><Shell><Items /></Shell></RequireAuth>} />
      <Route path="/invoices/new" element={<RequireAuth><Shell><NewInvoice /></Shell></RequireAuth>} />
      <Route path="/invoices/:id" element={<RequireAuth><Shell><InvoiceView /></Shell></RequireAuth>} />
    </Routes>
  );
}
