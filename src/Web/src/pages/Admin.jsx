import { Fragment, useEffect, useState } from "react";
import { useAuth } from "../auth.jsx";
import { api } from "../api.js";

const money = (n) => "$" + Number(n).toFixed(2);
const when = (d) => new Date(d).toLocaleString();

export default function Admin() {
  const { token } = useAuth();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api.getAllOrders(token).then(setOrders)
      .catch(() => setError("Couldn't load orders. Admin role required."));
  }, [token]);

  const totalRevenue = (orders ?? []).reduce(
    (s, o) => s + o.items.reduce((t, i) => t + i.unitPrice * i.quantity, 0), 0);
  const customers = new Set((orders ?? []).map((o) => o.buyerId)).size;

  return (
    <section>
      <div className="page-head">
        <h1>Admin dashboard</h1>
        <p className="muted">Every order across the store</p>
      </div>

      {error && <p className="notice error">{error}</p>}
      {!orders && !error && <p className="notice">Loading…</p>}

      {orders && (
        <>
          <div className="stats">
            <div className="stat"><span className="stat-num">{orders.length}</span><span className="stat-label">Orders</span></div>
            <div className="stat"><span className="stat-num mono">{money(totalRevenue)}</span><span className="stat-label">Revenue</span></div>
            <div className="stat"><span className="stat-num">{customers}</span><span className="stat-label">Customers</span></div>
          </div>

          {orders.length === 0 ? (
            <p className="notice">No orders have been placed yet.</p>
          ) : (
            <div className="table-card">
              <table className="data-table">
                <thead>
                  <tr><th>Order</th><th>Customer</th><th>Placed</th><th>Status</th><th className="r">Total</th><th></th></tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const total = o.items.reduce((t, i) => t + i.unitPrice * i.quantity, 0);
                    const isOpen = open === o.id;
                    return (
                      <Fragment key={o.id}>
                        <tr>
                          <td className="mono">#{o.id.slice(0, 8)}</td>
                          <td>{o.buyerId}</td>
                          <td className="muted">{when(o.orderDate)}</td>
                          <td><span className="chip chip-ok">{o.status}</span></td>
                          <td className="r mono">{money(total)}</td>
                          <td className="r">
                            <button className="link-btn" onClick={() => setOpen(isOpen ? null : o.id)}>
                              {isOpen ? "Hide" : "Items"}
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="detail-row">
                            <td colSpan="6">
                              <ul className="detail-lines">
                                {o.items.map((i) => (
                                  <li key={i.id ?? i.productId}>
                                    <span>{i.quantity} × {i.productName}</span>
                                    <span className="mono">{money(i.unitPrice * i.quantity)}</span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
