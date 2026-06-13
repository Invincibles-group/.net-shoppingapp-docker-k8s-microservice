import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { api } from "../api.js";

const money = (n) => "$" + Number(n).toFixed(2);
const when = (d) => new Date(d).toLocaleString();

export default function Account() {
  const { user, token } = useAuth();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getMyOrders(token).then(setOrders)
      .catch(() => setError("Couldn't load your orders."));
  }, [token]);

  return (
    <section className="narrow">
      <div className="page-head">
        <h1>Hello, {user.username}</h1>
        <p className="muted">Your order history</p>
      </div>

      {error && <p className="notice error">{error}</p>}
      {!orders && !error && <p className="notice">Loading…</p>}
      {orders?.length === 0 && (
        <div className="empty">
          <p>No orders yet.</p>
          <Link to="/" className="btn btn-sm">Start shopping</Link>
        </div>
      )}

      <ul className="orders">
        {orders?.map((o) => {
          const total = o.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
          return (
            <li key={o.id} className="order-card">
              <div className="order-head">
                <span className="mono order-id">#{o.id.slice(0, 8)}</span>
                <span className="chip chip-ok">{o.status}</span>
                <span className="muted order-date">{when(o.orderDate)}</span>
              </div>
              <ul className="order-lines">
                {o.items.map((i) => (
                  <li key={i.id ?? i.productId}>
                    <span>{i.quantity} × {i.productName}</span>
                    <span className="mono">{money(i.unitPrice * i.quantity)}</span>
                  </li>
                ))}
              </ul>
              <div className="order-total mono">Total {money(total)}</div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
