# Shopping Microservices (.NET 8)

A small but realistic e-commerce backend built as microservices. It is intentionally
sized for learning: enough moving parts to be interesting on Kubernetes (multiple
services, two database engines, a gateway, inter-service calls), but small enough to
understand end-to-end.

## Architecture

```
                       ┌──────────────┐
   client  ───────────▶│   Gateway    │  (YARP reverse proxy, :8080)
                       └──────┬───────┘
            ┌─────────────────┼──────────────────┐
            ▼                 ▼                  ▼
     ┌────────────┐   ┌────────────┐     ┌──────────────┐
     │ Catalog.API│   │ Basket.API │     │ Ordering.API │
     │  (:5001)   │   │  (:5002)   │     │   (:5003)    │
     └─────┬──────┘   └─────┬──────┘     └──────┬───────┘
           │                │ checkout ──────────┘ (HTTP)
           ▼                ▼                     ▼
     ┌────────────┐   ┌──────────┐         ┌────────────┐
     │ PostgreSQL │   │  Redis   │         │ PostgreSQL │
     │ catalogdb  │   │ (basket) │         │ orderingdb │
     └────────────┘   └──────────┘         └────────────┘
```

| Service       | Responsibility                          | Data store            | Local port |
|---------------|-----------------------------------------|-----------------------|------------|
| Web           | Storefront UI (React); nginx proxies /api → Gateway | none      | 3000       |
| Identity.API  | Register / login, issues JWT (roles)    | PostgreSQL (identitydb)| 5004      |
| Catalog.API   | Product catalog (CRUD)                  | PostgreSQL (catalogdb)| 5001       |
| Basket.API    | Shopping cart per buyer + checkout      | Redis                 | 5002       |
| Ordering.API  | Orders; JWT-protected reads             | PostgreSQL (orderingdb)| 5003      |
| Gateway       | Single entry point / routing (YARP)     | none                  | 8080       |

The **Web** storefront (a real, clickable store) talks only to its own nginx, which
reverse-proxies `/api/*` to the Gateway — so the browser stays same-origin and there's
no CORS to configure. Browsing hits Catalog, adding to cart hits Basket (Redis), and
Checkout makes Basket call Ordering, which writes the order to PostgreSQL. Clicking
through the store genuinely exercises every service.

**Why these stores:** the catalog and orders are relational, structured data that
benefits from a real database, so they use PostgreSQL. A shopping basket is transient,
key-value, and high-churn, so it uses Redis. This split mirrors how real systems pick
storage per service and gives you two different stateful workloads to run on Kubernetes.

## Database requirements

You do **not** need to install anything by hand if you use Docker Compose — it starts
the databases for you:

- 3x PostgreSQL 16 (one DB per service: `catalogdb`, `orderingdb`, `identitydb`)
- 1x Redis 7 (basket)

Default credentials (dev only): user `postgres`, password `postgres`.

## Run it locally (easiest: Docker Compose)

Prereqs: Docker Desktop (or Docker Engine + the compose plugin).

```bash
cd shopping-microservices
docker compose up --build
```

First build takes a few minutes (it restores NuGet packages inside the images).
When it's up, open the store:

- **Storefront:    http://localhost:3000**  ← the actual shopping app
- Gateway:         http://localhost:8080
- Identity Swagger: http://localhost:5004/swagger
- Catalog Swagger: http://localhost:5001/swagger
- Basket Swagger:  http://localhost:5002/swagger
- Ordering Swagger: http://localhost:5003/swagger

## Accounts & roles

The store now has login. Open http://localhost:3000 and use the **Sign in** screen:

- **Register** a new account → you get the **Customer** role. You can shop, check out,
  and see your own orders under **My orders**.
- **Admin** is pre-seeded so you can try the dashboard immediately:
  username `admin`, password `admin123`. Signing in as admin shows the **Admin** tab,
  which lists *every* order in the store with revenue/customer stats.

How it works: Identity.API issues a JWT carrying the user's role. The browser stores it
and sends it as `Authorization: Bearer …` on order calls. Ordering.API validates the
token and enforces the rules — `/orders/mine` returns just your orders, `/orders`
(all orders) requires the `Admin` role. Change the admin password and the shared
`Jwt__Key` before doing anything real with this.

Add a few items to the cart, hit Checkout, and the order shows up under My orders — and
in the admin dashboard. That click-through round-trips through identity, catalog,
basket, and ordering.

The Catalog and Ordering services create their schema and (for Catalog) seed sample
products automatically on first start. They retry for ~30s while the databases warm up.

Tear down (and wipe data):
```bash
docker compose down -v
```

## Try the full flow (via the Gateway)

```bash
# 1. List catalog (note a product Id from the output)
curl http://localhost:8080/catalog/products

# 2. Put an item in a basket (replace PRODUCT_ID)
curl -X POST http://localhost:8080/basket-api/basket \
  -H "Content-Type: application/json" \
  -d '{
        "buyerId": "alice",
        "items": [
          { "productId": "PRODUCT_ID", "productName": "Wireless Mouse", "unitPrice": 39.99, "quantity": 2 }
        ]
      }'

# 3. View the basket
curl http://localhost:8080/basket-api/basket/alice

# 4. Checkout -> creates an order in Ordering.API and clears the basket
curl -X POST http://localhost:8080/basket-api/basket/alice/checkout

# 5. Orders are now behind auth. Get a token first, then call /orders:
TOKEN=$(curl -s -X POST http://localhost:8080/identity/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')

# admin can see ALL orders:
curl http://localhost:8080/order/orders -H "Authorization: Bearer $TOKEN"
```

(With login enabled, the storefront uses your **username** as the buyer id, so shop
while signed in. A customer reads their own orders at `/order/orders/mine` with their
token; only an admin can read `/order/orders`.)

## Run without Docker (each service in its own terminal)

Prereqs: .NET 8 SDK, plus a local PostgreSQL and Redis (or point the connection
strings at containers you start manually).

```bash
# start infra however you like, e.g.:
docker run -d --name catalog-db  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=catalogdb  -p 5432:5432 postgres:16
docker run -d --name ordering-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=orderingdb -p 5434:5432 postgres:16
docker run -d --name identity-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=identitydb -p 5435:5432 postgres:16
docker run -d --name basket-redis -p 6379:6379 redis:7

# then, in separate terminals:
cd src/Identity.API && dotnet run --urls http://localhost:5004
cd src/Catalog.API  && dotnet run --urls http://localhost:5001
cd src/Ordering.API && dotnet run --urls http://localhost:5003
cd src/Basket.API   && dotnet run --urls http://localhost:5002
cd src/Gateway      && dotnet run --urls http://localhost:8080
```

Identity and Ordering must share the same `Jwt:Key`/`Issuer`/`Audience` (defaults match
in their `appsettings.json`). If you point identity-db at a different port, set
`ConnectionStrings__IdentityDb` accordingly.

Then start the storefront (needs Node 20+). `vite.config.js` already proxies `/api`
to the Gateway on :8080:

```bash
cd src/Web && npm install && npm run dev   # opens http://localhost:3000
```

If you used port 5434 for ordering-db above, set its connection string accordingly,
e.g. `ConnectionStrings__OrderingDb="Host=localhost;Port=5434;Database=orderingdb;Username=postgres;Password=postgres"`.

## Notes for the Kubernetes step (your part)

This is laid out so you can build the manifests yourself. A few pointers:

- Each service has a Dockerfile and listens on container port **8080**
  (`ASPNETCORE_URLS=http://+:8080`). Build/push each image, then create a
  Deployment + Service (ClusterIP) per service.
- Config is read from environment variables, so use ConfigMaps for non-secret URLs
  (e.g. `Services__Ordering`) and Secrets for DB passwords (`ConnectionStrings__*`) and
  the shared JWT signing key (`Jwt__Key`). Identity.API and Ordering.API must receive
  the **same** `Jwt__Key`/`Jwt__Issuer`/`Jwt__Audience` or token validation will fail.
- The three PostgreSQL instances and Redis are your **stateful** components — good
  candidates for StatefulSets + PersistentVolumeClaims (or managed cloud equivalents).
- Service-to-service calls use DNS names. In compose those are `catalog-service`, etc.;
  in Kubernetes they use the same Service names (e.g. `catalog-service`, `order-service`).
- There are two front-ish layers: the **Web** service (nginx + static SPA) is what
  users hit, and it proxies `/api` to the **Gateway**. On Kubernetes, expose Web with
  an Ingress (or LoadBalancer Service); keep the Gateway and all APIs as internal
  ClusterIP Services.
- Each backend service exposes `GET /health` (returns 200) — wire these up as readiness
  and liveness probes.

---

## Run on Kubernetes (Kind cluster)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation) (Kubernetes in Docker)
- [kubectl](https://kubernetes.io/docs/tasks/tools/)

### 1. Create a Kind cluster (if not already created)

```bash
kind create cluster --name gchowdar-cluster --config kind-config.yml
```

### 2. Build all Docker images

```bash
cd shopping-microservices
docker compose build
```

This builds images for all services:
- `shopping-microservices-catalog-service`
- `shopping-microservices-identity-service`
- `shopping-microservices-order-service`
- `shopping-microservices-basket-service`
- `shopping-microservices-gateway-service`
- `shopping-microservices-web`

### 3. Tag images for Kind (match K8s manifest names)

```bash
docker tag shopping-microservices-catalog-service:latest shopping-microservices-catalog-api:latest
docker tag shopping-microservices-identity-service:latest shopping-microservices-identity-api:latest
docker tag shopping-microservices-order-service:latest shopping-microservices-ordering-api:latest
docker tag shopping-microservices-basket-service:latest shopping-microservices-basket-api:latest
docker tag shopping-microservices-gateway-service:latest shopping-microservices-gateway:latest
```

### 4. Load images into Kind cluster

```bash
kind load docker-image shopping-microservices-catalog-api:latest --name gchowdar-cluster
kind load docker-image shopping-microservices-identity-api:latest --name gchowdar-cluster
kind load docker-image shopping-microservices-ordering-api:latest --name gchowdar-cluster
kind load docker-image shopping-microservices-basket-api:latest --name gchowdar-cluster
kind load docker-image shopping-microservices-gateway:latest --name gchowdar-cluster
kind load docker-image shopping-microservices-web:latest --name gchowdar-cluster
```

### 5. Deploy everything with Kustomize (single command)

```bash
kubectl apply -k src/
```

This applies all manifests in the correct order:
- Namespace (`shoppingapp-ns`)
- ConfigMaps & Secrets
- PersistentVolumeClaims
- Database deployments (PostgreSQL × 3, Redis × 1)
- Application deployments (Catalog, Identity, Ordering, Basket APIs)
- Gateway deployment
- Nginx (Web frontend) deployment

### 6. Verify all pods are running

```bash
kubectl get pods -n shoppingapp-ns
```

Wait until all pods show `Running` and `READY 1/1`.

### 7. Access the application

**Option A: Port-forward the frontend**

```bash
kubectl port-forward svc/nginx-service 3000:80 -n shoppingapp-ns
```

Open http://localhost:3000

**Option B: Port-forward the gateway directly**

```bash
kubectl port-forward svc/gateway-service 8080:8080 -n shoppingapp-ns
```

Test with: `curl http://localhost:8080/catalog/products`

**Option C: Use NodePort**

```bash
# Find the assigned NodePort
kubectl get svc nginx-service -n shoppingapp-ns
# Access via: http://localhost:<NodePort>
```

### 8. Check service connectivity

```bash
# Test catalog through gateway
kubectl exec -n shoppingapp-ns deployment/nginx-deployment -- wget -qO- http://gateway-service:8080/catalog/products

# Test individual services
kubectl exec -n shoppingapp-ns deployment/nginx-deployment -- wget -qO- http://catalog-service:8080/health
kubectl exec -n shoppingapp-ns deployment/nginx-deployment -- wget -qO- http://identity-service:8080/health
kubectl exec -n shoppingapp-ns deployment/nginx-deployment -- wget -qO- http://order-service:8080/health
kubectl exec -n shoppingapp-ns deployment/nginx-deployment -- wget -qO- http://basket-service:8080/health
```

### 9. Tear down

```bash
kubectl delete -k src/
```

### 10. Delete the Kind cluster entirely

```bash
kind delete cluster --name gchowdar-cluster
```

---

## Kubernetes Service Map

| K8s Service Name     | Port | Backs              | Image                                       |
|----------------------|------|--------------------|---------------------------------------------|
| `catalog-service`    | 8080 | Catalog.API        | `shopping-microservices-catalog-api`        |
| `identity-service`   | 8080 | Identity.API       | `shopping-microservices-identity-api`       |
| `order-service`      | 8080 | Ordering.API       | `shopping-microservices-ordering-api`       |
| `basket-service`     | 8080 | Basket.API         | `shopping-microservices-basket-api`         |
| `gateway-service`    | 8080 | Gateway (YARP)     | `shopping-microservices-gateway`            |
| `nginx-service`      | 80   | Web (nginx + SPA)  | `shopping-microservices-web`               |
| `catalog-service-db` | 5432 | PostgreSQL         | `postgres:16`                               |
| `identity-service-db`| 5432 | PostgreSQL         | `postgres:16`                               |
| `order-service-db`   | 5432 | PostgreSQL         | `postgres:16`                               |
| `basket-service-db`  | 6379 | Redis              | `redis:latest`                              |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `ImagePullBackOff` | Image not loaded into Kind. Run `kind load docker-image <image> --name gchowdar-cluster` |
| `CrashLoopBackOff` on app pods | DB not ready yet. Check DB pod logs: `kubectl logs -n shoppingapp-ns deployment/<db-deployment>` |
| Port-forward `connection refused` | Container port mismatch. All .NET apps listen on **8080** |
| Gateway returns 404 | Gateway image has stale config. Rebuild: `docker compose build gateway-service`, re-tag, reload, and restart |
| Can't reach catalog from browser | Nginx needs correct `proxy_pass`. Verify: `kubectl exec -n shoppingapp-ns deployment/nginx-deployment -- cat /etc/nginx/conf.d/default.conf` |

Have fun deploying it!
