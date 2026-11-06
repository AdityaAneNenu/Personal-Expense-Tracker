import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  CircleHelp,
  ChevronRight,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  ShieldCheck,
  Tags,
  Target,
  Wallet,
  X,
} from "lucide-react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import ThemeToggle from "./ThemeToggle";

const navigation = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/transactions", label: "Transactions", icon: CreditCard },
  { path: "/budgets", label: "Budgets", icon: Target },
  { path: "/reports", label: "Reports", icon: BarChart3 },
  { path: "/categories", label: "Categories", icon: Tags },
  { path: "/alerts", label: "Alerts", icon: Bell },
];
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <Wallet size={22} strokeWidth={2.1} />
      </span>
      <span>
        SpendWise<span className="brand-dot">.</span>
      </span>
    </span>
  );
}
export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia?.("(max-width: 800px)").matches ?? false,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const drawerRef = useRef(null);
  const triggerRef = useRef(null);
  const closeRef = useRef(null);
  const mainRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const drawerOpen = open && isMobile;
  const currentPage =
    navigation.find((item) => location.pathname.startsWith(item.path))?.label ||
    "Your account";
  useEffect(() => {
    setOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    const query = window.matchMedia?.("(max-width: 800px)");
    if (!query) return;
    const resize = (event) => {
      setIsMobile(event.matches);
      if (!event.matches) setOpen(false);
    };
    query.addEventListener("change", resize);
    return () => query.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    if (!drawerOpen) return;
    const trigger = triggerRef.current;
    const mainShell = mainRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = requestAnimationFrame(() => closeRef.current?.focus());

    // A mobile navigation drawer behaves like a modal: the rest of the page
    // is inert, Tab stays inside, and Escape returns focus to the menu button.
    const containFocus = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = Array.from(
        drawerRef.current.querySelectorAll(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) return;
      const focusIsOutside = !drawerRef.current.contains(
        document.activeElement,
      );
      if (
        event.shiftKey &&
        (document.activeElement === first || focusIsOutside)
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || focusIsOutside)
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", containFocus, true);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", containFocus, true);
      document.body.style.overflow = previousOverflow;
      if (window.matchMedia?.("(max-width: 800px)").matches) {
        if (trigger?.isConnected) trigger.focus();
      } else {
        if (mainShell?.isConnected) mainShell.querySelector("main")?.focus();
      }
    };
  }, [drawerOpen]);
  async function signOut() {
    setBusy(true);
    setError(null);
    try {
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((name) => name[0])
    .join("")
    .toUpperCase();
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        tabIndex={drawerOpen ? -1 : undefined}
      >
        Skip to content
      </a>
      {drawerOpen && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          tabIndex={-1}
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        id="main-navigation-drawer"
        ref={drawerRef}
        className={`sidebar ${drawerOpen ? "is-open" : ""}`}
        role={drawerOpen ? "dialog" : undefined}
        aria-modal={drawerOpen ? true : undefined}
        aria-label={drawerOpen ? "Navigation" : undefined}
        inert={isMobile && !drawerOpen}
      >
        <div className="sidebar-brand">
          <Link to="/dashboard" aria-label="SpendWise dashboard">
            <Brand />
          </Link>
          <button
            className="icon-button mobile-close"
            ref={closeRef}
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X size={21} />
          </button>
        </div>
        <p className="sidebar-subtitle">Personal finance, made clear.</p>
        <p className="nav-section-label">Your workspace</p>
        <nav aria-label="Main navigation">
          {navigation.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""}`
              }
            >
              <Icon size={20} strokeWidth={1.8} />
              <span>{label}</span>
              {label === "Dashboard" && <span className="nav-active-dot" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <ShieldCheck size={23} />
            </span>
            <h3>Make it a daily habit</h3>
            <p>A small entry today makes your next monthly review easier.</p>
            <Link to="/transactions/new">
              Log a transaction <Plus size={15} />
            </Link>
          </div>
          <Link to="/profile" className="account-link">
            <span className="avatar">{initials}</span>
            <span>
              <strong>{user.name}</strong>
              <small>Personal account</small>
            </span>
          </Link>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          <button className="logout-button" onClick={signOut} disabled={busy}>
            <LogOut size={17} />
            {busy ? "Signing out…" : "Log out"}
          </button>
        </div>
      </aside>
      <div className="main-shell" ref={mainRef} inert={drawerOpen}>
        <div className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              ref={triggerRef}
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
              aria-controls="main-navigation-drawer"
              onClick={() => setOpen(!open)}
            >
              <Menu size={23} />
            </button>
            <div className="topbar-breadcrumb">
              <span className="workspace-label">Personal workspace</span>
              <ChevronRight
                className="breadcrumb-divider"
                size={15}
                aria-hidden="true"
              />
              <span className="current-page">{currentPage}</span>
            </div>
          </div>
          <div className="topbar-right">
            <ThemeToggle />
            <span className="currency-note">
              INR <span>₹</span>
            </span>
            <Link className="icon-button" to="/alerts" aria-label="View alerts">
              <Bell size={20} />
            </Link>
            <Link
              className="avatar small-avatar"
              to="/profile"
              aria-label="View profile"
            >
              {initials}
            </Link>
          </div>
        </div>
        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
        <footer className="app-footer">
          <span>SpendWise · A little clarity, every day.</span>
          <Link to="/profile">
            <CircleHelp size={14} />
            About your account
          </Link>
        </footer>
      </div>
    </div>
  );
}
