import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { api } from "../api.js";

const money = (n) => "$" + Number(n).toFixed(2);

function gradient(seed) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 72% 62%), hsl(${(h + 45) % 360} 72% 52%))`;
}

export default function Store({ basket, refreshBasket }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
  const [adding, setAdding] = useState(null);

  useEffect(() => {
    api.getProducts().then(setProducts)
      .catch(() => setError("Can't reach the catalog. Is the backend running? (docker compose up)"));
  }, []);

  async function addToCart(p) {
    if (!user) { navigate("/login"); return; }
    setAdding(p.id);
    const items = [...(basket.items ?? [])];
    const found = items.find((i) => i.productId === p.id);
    if (found) found.quantity += 1;
    else items.push({ productId: p.id, productName: p.name, unitPrice: p.price, quantity: 1 });
    try {
      await api.saveBasket({ buyerId: user.username, items });
      await refreshBasket();
    } catch {
      setError("Couldn't update your cart. Is the basket service up?");
    } finally {
      setAdding(null);
    }
  }

  return (
    <section>
      <div className="hero">
        <h1>Gear that just works.</h1>
        <p>Keyboards, mice, displays and the bits in between — curated, in stock, shipped fast.</p>
      </div>

      {error && <p className="notice error">{error}</p>}
      {!products && !error && <p className="notice">Loading products…</p>}
      {products?.length === 0 && <p className="notice">No products yet.</p>}

      {products?.length > 0 && (
        <ul className="grid">
          {products.map((p) => (
            <li key={p.id} className="card">
              <div className="thumb" style={{ background: gradient(p.name) }}>
                <span className="thumb-tag">{p.category}</span>
              </div>
              <div className="card-body">
                <h2 className="card-name">{p.name}</h2>
                <p className="card-desc">{p.description}</p>
                <div className="card-foot">
                  <span className="price">{money(p.price)}</span>
                  <button
                    className="btn btn-sm"
                    onClick={() => addToCart(p)}
                    disabled={adding === p.id || p.availableStock === 0}
                  >
                    {p.availableStock === 0 ? "Sold out" : adding === p.id ? "Adding…" : "Add"}
                  </button>
                </div>
                <span className="stock">{p.availableStock} in stock</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
