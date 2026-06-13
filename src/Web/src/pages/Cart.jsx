import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { api } from "../api.js";

const money = (n) => "$" + Number(n).toFixed(2);

export default function Cart({ basket, refreshBasket }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const items = basket.items ?? [];
  const total = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  async function save(next) {
    setBusy(true);
    try {
      await api.saveBasket({ buyerId: user.username, items: next });
      await refreshBasket();
    } catch {
      setError("Couldn't update the cart.");
    } finally {
      setBusy(false);
    }
  }

  const setQty = (id, q) => q >= 1 && save(items.map((i) => (i.productId === id ? { ...i, quantity: q } : i)));
  const remove = (id) => save(items.filter((i) => i.productId !== id));

  async function checkout() {
    setBusy(true); setError(null);
    try {
      await api.checkout(user.username);
      await refreshBasket();
      navigate("/account");
    } catch {
      setError("Checkout failed. Is the ordering service reachable?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="narrow">
      <div className="page-head"><h1>Your cart</h1></div>
      {error && <p className="notice error">{error}</p>}

      {items.length === 0 ? (
        <div className="empty">
          <p>Your cart is empty.</p>
          <Link to="/" className="btn btn-sm">Browse the shop</Link>
        </div>
      ) : (
        <div className="cart-card">
          <ul className="cart-list">
            {items.map((i) => (
              <li key={i.productId} className="cart-row">
                <div className="cart-info">
                  <span className="cart-name">{i.productName}</span>
                  <span className="muted mono">{money(i.unitPrice)} each</span>
                </div>
                <div className="stepper">
                  <button onClick={() => setQty(i.productId, i.quantity - 1)} disabled={busy} aria-label="decrease">−</button>
                  <span>{i.quantity}</span>
                  <button onClick={() => setQty(i.productId, i.quantity + 1)} disabled={busy} aria-label="increase">+</button>
                </div>
                <span className="line-total mono">{money(i.unitPrice * i.quantity)}</span>
                <button className="link-btn" onClick={() => remove(i.productId)} disabled={busy}>Remove</button>
              </li>
            ))}
          </ul>
          <div className="cart-summary">
            <div className="summary-row"><span>Total</span><span className="mono total">{money(total)}</span></div>
            <button className="btn btn-block" onClick={checkout} disabled={busy}>
              {busy ? "Placing order…" : "Checkout"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
