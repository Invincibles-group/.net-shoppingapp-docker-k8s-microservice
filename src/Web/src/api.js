// Everything goes through /api, which nginx (prod) or Vite (dev) proxies to the Gateway.
const API = "/api";

async function handle(res) {
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`);
  return data;
}

const json = (body) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

const bearer = (token) => ({ headers: { Authorization: `Bearer ${token}` } });

export const api = {
  // identity
  register: (username, password) => fetch(`${API}/identity/register`, json({ username, password })).then(handle),
  login: (username, password) => fetch(`${API}/identity/login`, json({ username, password })).then(handle),

  // catalog
  getProducts: () => fetch(`${API}/catalog/products`).then(handle),

  // basket (keyed by buyerId = username)
  getBasket: (id) => fetch(`${API}/basket-api/basket/${id}`).then(handle),
  saveBasket: (basket) => fetch(`${API}/basket-api/basket`, json(basket)).then(handle),
  checkout: (id) => fetch(`${API}/basket-api/basket/${id}/checkout`, { method: "POST" }).then(handle),

  // ordering (JWT-protected)
  getMyOrders: (token) => fetch(`${API}/order/orders/mine`, bearer(token)).then(handle),
  getAllOrders: (token) => fetch(`${API}/order/orders`, bearer(token)).then(handle)
};
