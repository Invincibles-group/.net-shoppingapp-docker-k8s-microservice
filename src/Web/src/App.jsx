import { useCallback, useEffect, useState } from "react";
import { Routes, Route, NavLink, Navigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "./auth.jsx";
import { api } from "./api.js";
import Store from "./pages/Store.jsx";
import Cart from "./pages/Cart.jsx";
import Account from "./pages/Account.jsx";
import Admin from "./pages/Admin.jsx";
import Login from "./pages/Login.jsx";

function RequireAuth({ children, adminOnly = false }) {
  const { user, isAdmin } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, isAdmin, logout } = useAuth();
  const [basket, setBasket] = useState({ items: [] });

  const refreshBasket = useCallback(async () => {
    if (!user) { setBasket({ items: [] }); return; }
    try {
      const b = await api.getBasket(user.username);
      setBasket(b ?? { items: [] });
    } catch { /* surfaced on the page */ }
  }, [user]);

  useEffect(() => { refreshBasket(); }, [refreshBasket]);

  const count = (basket.items ?? []).reduce((n, i) => n + i.quantity, 0);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden>◆</span>
            <span className="brand-name">Volt</span>
          </Link>

          <nav className="nav">
            <NavLink to="/" end>Shop</NavLink>
            {user && !isAdmin && <NavLink to="/account">My orders</NavLink>}
            {isAdmin && <NavLink to="/admin">Admin</NavLink>}
            {user && (
              <NavLink to="/cart" className="cart-pill" aria-label="Cart">
                <span>Cart</span>
                {count > 0 && <span className="cart-count">{count}</span>}
              </NavLink>
            )}
            {user ? (
              <div className="user-chip">
                <span className="avatar">{user.username[0].toUpperCase()}</span>
                <span className="user-name">{user.username}</span>
                <button className="ghost" onClick={logout}>Sign out</button>
              </div>
            ) : (
              <NavLink to="/login" className="btn btn-sm">Sign in</NavLink>
            )}
          </nav>
        </div>
      </header>

      <main className="main">
        <Routes>
          <Route path="/" element={<Store basket={basket} refreshBasket={refreshBasket} />} />
          <Route path="/login" element={<Login />} />
          <Route path="/cart" element={<RequireAuth><Cart basket={basket} refreshBasket={refreshBasket} /></RequireAuth>} />
          <Route path="/account" element={<RequireAuth><Account /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth adminOnly><Admin /></RequireAuth>} />
        </Routes>
      </main>

      <footer className="footer">
        <span>Volt — a demo store</span>
        <span>identity · catalog · basket · ordering · gateway</span>
      </footer>
    </div>
  );
}
