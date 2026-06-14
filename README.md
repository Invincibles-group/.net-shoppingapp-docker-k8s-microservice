# Shopping Microservices (.NET 8)

A full-stack e-commerce application built with microservices architecture. It has a
React storefront where you can browse products, add items to a cart, check out, and
view orders — with login, roles (customer and admin), and separate pages for each.

The backend is six .NET 8 services, each with its own responsibility and (where needed)
its own database. The whole thing runs on Docker Compose for local development and
deploys to Kubernetes (Kind cluster) for learning container orchestration.

## Tech stack

| Layer     | Technology                                                     |
|-----------|----------------------------------------------------------------|
| Frontend  | React 18, Vite, React Router                                  |
| Backend   | .NET 8 Minimal APIs (6 services)                               |
| Databases | PostgreSQL 16 (×3 — one per service), Redis 7 (basket cache)   |
| Auth      | JWT (issued by Identity.API, validated by Ordering.API)         |
| Gateway   | YARP reverse proxy (routes API calls to the right service)      |
| Web server| nginx (serves the React SPA, proxies `/api` to the Gateway)    |
| Containers| Docker, Docker Compose                                         |
| Orchestration | Kubernetes (Kind), Kustomize                              |


## Architecture

```
                                 ┌──────────────────────┐
                                 │    Web (nginx)       │  :3000 (compose) / :80 (k8s)
    browser  ──────────────────▶ │  serves React SPA    │
                                 │  proxies /api → GW   │
                                 └──────────┬───────────┘
                                            │  /api/*
                                            ▼
                                 ┌──────────────────────┐
                                 │   Gateway (YARP)     │  :8080
                                 │  routes by URL path  │
                                 └──┬───┬───┬───┬──────┘
                     ┌──────────────┘   │   │   └──────────────┐
                     ▼                  ▼   ▼                  ▼
              ┌─────────────┐  ┌────────────┐  ┌──────────────┐  ┌──────────────┐
              │Identity.API │  │Catalog.API │  │ Basket.API   │  │Ordering.API  │
              │  :5004      │  │  :5001     │  │  :5002       │  │  :5003       │
              └──────┬──────┘  └─────┬──────┘  └──┬───────┬───┘  └──────┬───────┘
                     │               │            │       │  checkout   │
                     ▼               ▼            ▼       └──────────▶ │
              ┌────────────┐  ┌────────────┐  ┌──────────┐        ┌────┴───────┐
              │ PostgreSQL │  │ PostgreSQL │  │  Redis   │        │ PostgreSQL │
              │ identitydb │  │ catalogdb  │  │ (basket) │        │ orderingdb │
              └────────────┘  └────────────┘  └──────────┘        └────────────┘
```

### What each service does

| Service        | What it does                                              | Data store              | Compose port | K8s Service name   |
|----------------|-----------------------------------------------------------|-------------------------|-------------|---------------------|
| **Web**        | Serves the React storefront; nginx proxies `/api` to Gateway | none                 | 3000        | `nginx-service`     |
| **Gateway**    | Single API entry point — routes `/catalog`, `/basket-api`, `/order`, `/identity` to the right service using YARP | none | 8080 | `gateway-service` |
| **Identity.API** | User registration and login; issues JWT tokens with role (Customer or Admin) | PostgreSQL (`identitydb`) | 5004 | `identity-service` |
| **Catalog.API**  | Product catalog — list, create, update, delete products    | PostgreSQL (`catalogdb`) | 5001 | `catalog-service`  |
| **Basket.API**   | Shopping cart per user; checkout calls Ordering.API to place an order then clears the cart | Redis | 5002 | `basket-service` |
| **Ordering.API** | Stores orders; `/orders/mine` (customer, JWT required), `/orders` (admin only, JWT required) | PostgreSQL (`orderingdb`) | 5003 | `order-service` |

### How traffic flows (a real example)

When you click "Add to cart" in the browser, this is what actually happens:

```
1. Browser sends    POST /api/basket-api/basket
2. nginx sees /api  → strips /api → forwards to    Gateway :8080  /basket-api/basket
3. Gateway sees /basket-api  → strips prefix → forwards to    Basket.API :8080  /basket
4. Basket.API saves the cart to Redis and returns 200
```

On checkout, Basket.API makes a **service-to-service HTTP call** to Ordering.API
(`POST /orders`) to create the order, then clears the cart from Redis.

### Why two "proxy" layers (nginx and Gateway)?

They do different jobs:

- **nginx** serves the website files (HTML, JS, CSS) and makes the browser talk to one
  address (no CORS issues). It only knows "send `/api` to the Gateway."
- **Gateway (YARP)** knows about all the backend services and routes each API path to the
  correct one. It's the internal traffic cop.

nginx faces the browser; the Gateway faces the microservices.


## Project structure

```
.
├── docker-compose.yml          # runs everything locally (services + databases)
├── src/
│   ├── namespace.yml           # k8s namespace definition
│   ├── kustomization.yml       # k8s: applies all manifests in order
│   ├── Catalog.API/
│   │   ├── Program.cs, Models/, Data/
│   │   ├── Dockerfile
│   │   ├── appsettings.json
│   │   └── k8s/               # catalog-app.yml, catalog-db.yml, catalog-db-pvc.yml,
│   │                          #   configMap.yml, secrets.yml
│   ├── Identity.API/           # same pattern: code + Dockerfile + k8s/
│   ├── Ordering.API/
│   ├── Basket.API/
│   ├── Gateway/
│   │   ├── appsettings.json           # routing for local dev (localhost:500x)
│   │   ├── appsettings.Docker.json    # routing for compose/k8s (service DNS names)
│   │   └── K8s/
│   └── Web/
│       ├── src/               # React app (pages: Store, Cart, Login, Account, Admin)
│       ├── nginx.conf         # proxies /api → gateway
│       ├── Dockerfile
│       └── k8s/
```

Each service has its own `k8s/` folder containing its Kubernetes manifests. Kustomize
(`kustomization.yml`) ties them all together so one command deploys everything.


## Accounts and roles

The app has login with two roles:

| Account   | Username | Password  | What you can do                              |
|-----------|----------|-----------|----------------------------------------------|
| Admin     | `admin`  | `admin123`| See the **Admin** dashboard (all orders, revenue stats) |
| Customer  | (register your own) | (your choice, min 4 chars) | Shop, add to cart, checkout, see **My orders** |

The admin account is created automatically when Identity.API starts for the first time.

**How auth works:** Identity.API issues a JWT token containing the user's role. The
browser stores the token and sends it as `Authorization: Bearer <token>` on protected
API calls. Ordering.API validates the token and checks the role — customers see only
their own orders, admins see everyone's.


## Database requirements

Docker Compose starts the databases for you — no manual installation needed:

- 3× PostgreSQL 16 — one per service (`catalogdb`, `identitydb`, `orderingdb`)
- 1× Redis 7 — basket/cart storage

Default credentials (dev only): user `postgres`, password `postgres`.

**Why different databases?** Each service owns its data independently (a core
microservices pattern). The catalog and orders are relational data (SQL queries, joins),
so they use PostgreSQL. A shopping cart is temporary key-value data with high churn, so
it uses Redis. This also gives you two different stateful workloads to practice
deploying on Kubernetes.


## Run locally with Docker Compose

**Prerequisites:** Docker Desktop (or Docker Engine + the compose plugin).

```bash
docker compose up --build
```

First build takes a few minutes (restoring NuGet packages + npm install inside images).
When everything is up:

| What                  | URL                               |
|-----------------------|-----------------------------------|
| **Storefront**        | http://localhost:3000              |
| Gateway               | http://localhost:8080              |
| Identity API (Swagger)| http://localhost:5004/swagger      |
| Catalog API (Swagger) | http://localhost:5001/swagger      |
| Basket API (Swagger)  | http://localhost:5002/swagger      |
| Ordering API (Swagger)| http://localhost:5003/swagger      |

**Try it:** open http://localhost:3000, click **Sign in**, register an account, browse
the shop, add items, go to Cart, hit Checkout, then check **My orders**. To see the
admin view, sign in as `admin` / `admin123`.

Tear down and wipe all data:
```bash
docker compose down -v
```


## Try the API directly (curl)

```bash
# List products
curl http://localhost:8080/catalog/products

# Add an item to a basket (replace PRODUCT_ID with a real id from above)
curl -X POST http://localhost:8080/basket-api/basket \
  -H "Content-Type: application/json" \
  -d '{
        "buyerId": "alice",
        "items": [
          { "productId": "PRODUCT_ID", "productName": "Wireless Mouse", "unitPrice": 39.99, "quantity": 2 }
        ]
      }'

# View the basket
curl http://localhost:8080/basket-api/basket/alice

# Checkout (creates an order, clears the basket)
curl -X POST http://localhost:8080/basket-api/basket/alice/checkout

# Get a JWT token (admin)
TOKEN=$(curl -s -X POST http://localhost:8080/identity/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | sed 's/.*"token":"\([^"]*\)".*/\1/')

# View all orders (admin only)
curl http://localhost:8080/order/orders -H "Authorization: Bearer $TOKEN"
```

> **Note:** when using the storefront UI, your **username** becomes the buyer id. The
> curl examples above use "alice" as a raw buyer id, which bypasses login. Both paths
> create real orders.


## Run without Docker (each service in its own terminal)

**Prerequisites:** .NET 8 SDK, Node 20+, and either local PostgreSQL + Redis or
containers for them.

Start the databases:
```bash
docker run -d --name catalog-db  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=catalogdb  -p 5432:5432 postgres:16
docker run -d --name ordering-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=orderingdb -p 5434:5432 postgres:16
docker run -d --name identity-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=identitydb -p 5435:5432 postgres:16
docker run -d --name basket-redis -p 6379:6379 redis:7
```

Start each service in a separate terminal:
```bash
cd src/Identity.API && dotnet run --urls http://localhost:5004
cd src/Catalog.API  && dotnet run --urls http://localhost:5001
cd src/Ordering.API && dotnet run --urls http://localhost:5003
cd src/Basket.API   && dotnet run --urls http://localhost:5002
cd src/Gateway      && dotnet run --urls http://localhost:8080
```

Start the frontend:
```bash
cd src/Web && npm install && npm run dev   # opens http://localhost:3000
```

> Identity and Ordering must share the same JWT key/issuer/audience (the defaults in
> their `appsettings.json` already match). If ordering-db is on port 5434, set
> `DB_HOST=localhost` and adjust the port in the connection string.


---


## Deploy to Kubernetes (Kind cluster)

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [Kind](https://kind.sigs.k8s.io/docs/user/quick-start/#installation) — Kubernetes in Docker
- [kubectl](https://kubernetes.io/docs/tasks/tools/)

### 1. Create a Kind cluster

```bash
kind create cluster --name shopping-cluster
```

### 2. Build Docker images

```bash
docker compose build
```

This produces images named by Docker Compose convention (`<project>-<service>`):

| Compose service    | Image built                                |
|--------------------|--------------------------------------------|
| `catalog-service`  | `shopping-microservices-catalog-service`    |
| `identity-service` | `shopping-microservices-identity-service`   |
| `order-service`    | `shopping-microservices-order-service`      |
| `basket-service`   | `shopping-microservices-basket-service`     |
| `gateway-service`  | `shopping-microservices-gateway-service`    |
| `web`              | `shopping-microservices-web`               |

### 3. Tag images to match the names in k8s manifests

The Kubernetes manifests reference different image names (e.g. `catalog-api` instead of
`catalog-service`), so we tag them:

```bash
docker tag shopping-microservices-catalog-service:latest  shopping-microservices-catalog-api:latest
docker tag shopping-microservices-identity-service:latest  shopping-microservices-identity-api:latest
docker tag shopping-microservices-order-service:latest     shopping-microservices-ordering-api:latest
docker tag shopping-microservices-basket-service:latest    shopping-microservices-basket-api:latest
docker tag shopping-microservices-gateway-service:latest   shopping-microservices-gateway:latest
```

> **Why the tag step?** Docker Compose names images after the service key in
> `docker-compose.yml` (e.g. `catalog-service`). The k8s manifests use different names
> (e.g. `catalog-api`). Tagging bridges the two. You could also rename one side to
> match the other and skip this step.

### 4. Load images into the Kind cluster

Kind runs its own container registry. Your locally-built images aren't visible to it
until you load them:

```bash
kind load docker-image shopping-microservices-catalog-api:latest    --name shopping-cluster
kind load docker-image shopping-microservices-identity-api:latest   --name shopping-cluster
kind load docker-image shopping-microservices-ordering-api:latest   --name shopping-cluster
kind load docker-image shopping-microservices-basket-api:latest     --name shopping-cluster
kind load docker-image shopping-microservices-gateway:latest        --name shopping-cluster
kind load docker-image shopping-microservices-web:latest            --name shopping-cluster
```

### 5. Deploy everything with Kustomize

```bash
kubectl apply -k src/
```

This creates (in order): the namespace (`shoppingapp-ns`), ConfigMap and Secret, PVCs,
database Deployments, app Deployments, the Gateway, and the Web frontend.

### 6. Verify pods are running

```bash
kubectl get pods -n shoppingapp-ns
```

Wait until all pods show `Running` and `1/1` Ready. Databases may take 10–30 seconds;
app pods retry their DB connections automatically.

### 7. Access the application

**Option A — port-forward (simplest):**
```bash
kubectl port-forward svc/nginx-service 3000:80 -n shoppingapp-ns
```
Open http://localhost:3000

**Option B — port-forward the Gateway directly (for API testing):**
```bash
kubectl port-forward svc/gateway-service 8080:8080 -n shoppingapp-ns
```
Test: `curl http://localhost:8080/catalog/products`

**Option C — NodePort:**
```bash
kubectl get svc nginx-service -n shoppingapp-ns
# Look at the PORT(S) column, e.g. 80:31234/TCP → open http://localhost:31234
```

### 8. Check service connectivity inside the cluster

```bash
# Through the gateway
kubectl exec -n shoppingapp-ns deployment/nginx-deployment -- \
  wget -qO- http://gateway-service:8080/catalog/products

# Individual health checks
kubectl exec -n shoppingapp-ns deployment/nginx-deployment -- wget -qO- http://catalog-service:8080/health
kubectl exec -n shoppingapp-ns deployment/nginx-deployment -- wget -qO- http://identity-service:8080/health
kubectl exec -n shoppingapp-ns deployment/nginx-deployment -- wget -qO- http://order-service:8080/health
kubectl exec -n shoppingapp-ns deployment/nginx-deployment -- wget -qO- http://basket-service:8080/health
```

### 9. Tear down

```bash
# Remove all resources but keep the cluster
kubectl delete -k src/

# Or delete the entire cluster
kind delete cluster --name shopping-cluster
```


## Kubernetes service map

| K8s Service name     | Port | What it routes to     | Image                                  |
|----------------------|------|-----------------------|----------------------------------------|
| `nginx-service`      | 80   | Web (nginx + React SPA) | `shopping-microservices-web`         |
| `gateway-service`    | 8080 | Gateway (YARP)         | `shopping-microservices-gateway`      |
| `catalog-service`    | 8080 | Catalog.API            | `shopping-microservices-catalog-api`  |
| `identity-service`   | 8080 | Identity.API           | `shopping-microservices-identity-api` |
| `order-service`      | 8080 | Ordering.API           | `shopping-microservices-ordering-api` |
| `basket-service`     | 8080 | Basket.API             | `shopping-microservices-basket-api`   |
| `catalog-service-db` | 5432 | PostgreSQL (catalogdb) | `postgres:latest`                     |
| `identity-service-db`| 5432 | PostgreSQL (identitydb)| `postgres:latest`                     |
| `order-service-db`   | 5432 | PostgreSQL (orderingdb)| `postgres:latest`                     |
| `basket-service-db`  | 6379 | Redis (basket cache)   | `redis:latest`                        |


## Useful kubectl commands

```bash
# See all resources in the namespace
kubectl get all -n shoppingapp-ns

# Watch pods in real time (useful during deployment)
kubectl get pods -n shoppingapp-ns -w

# Check why a pod is failing
kubectl describe pod <pod-name> -n shoppingapp-ns
kubectl logs <pod-name> -n shoppingapp-ns

# See resource usage (requires metrics-server — see troubleshooting)
kubectl top pod -n shoppingapp-ns

# Restart a deployment (e.g. after rebuilding an image)
kubectl rollout restart deployment/catalog-deployment -n shoppingapp-ns

# Scale a deployment
kubectl scale deployment/catalog-deployment --replicas=2 -n shoppingapp-ns
```


## Troubleshooting

| Problem | What it means | Fix |
|---------|--------------|-----|
| `ImagePullBackOff` | Kind can't find the image | Load it: `kind load docker-image <image> --name shopping-cluster` |
| `CrashLoopBackOff` on an app pod | Usually the database isn't ready yet | Check DB pod: `kubectl logs <db-pod> -n shoppingapp-ns`. The apps retry for ~30s automatically. |
| `CrashLoopBackOff` with `OOMKilled` | Pod ran out of memory | Increase the memory limit in the deployment's `resources.limits.memory` |
| `Pending` pod that never starts | Cluster doesn't have enough resources for the request, or PVC can't bind | `kubectl describe pod <name>` and look at the Events section |
| Port-forward says `connection refused` | Wrong port. All .NET services listen on **8080** inside the container | Use `port-forward svc/catalog-service 8080:8080` (not 5001) |
| Gateway returns 502/404 | Gateway config has wrong service names | Check: `kubectl exec deployment/gateway-deployment -- cat /app/appsettings.Docker.json` |
| Can't reach catalog from browser | nginx proxy isn't pointing at the gateway | Verify: `kubectl exec deployment/nginx-deployment -- cat /etc/nginx/conf.d/default.conf` |
| `kubectl top` says "Metrics API not available" | metrics-server isn't installed | On Kind: `kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml` then patch with `--kubelet-insecure-tls` |
| Login works but orders page says "Couldn't load orders" | JWT key mismatch between Identity and Ordering | Both must have the same `Jwt__Key` value. In k8s, inject it via env/Secret. |


## Known limitations and next steps

Things that work but could be better — in rough priority order:

1. **No health probes on app pods.** The databases have readiness/liveness probes, but the
   application pods don't yet. Each app exposes `GET /health` — wiring probes is a small,
   high-value improvement.
2. **JWT key is hardcoded, not injected in k8s.** Identity and Ordering fall back to the
   same default key in `appsettings.json`, so auth works — but it's relying on a lucky
   coincidence. The key should be in a Secret and injected via environment variables.
3. **Secret committed to git.** `secrets.yml` contains a base64-encoded password. base64
   is not encryption. Fine for learning; use Sealed Secrets or create secrets out-of-band
   for anything real.
4. **`:latest` image tags.** All images use `:latest`, which isn't reproducible. Pin to
   specific versions (e.g. `postgres:16`, your app images as `:1.0`).
5. **Postgres mount path** is `/var/lib/postgresql` instead of the recommended
   `/var/lib/postgresql/data` with a `subPath`.
6. **No CI/CD.** Images are built and loaded manually. A GitHub Actions workflow to build,
   test, and push on every commit would automate this.
7. **No tests.** The .NET services have no unit or integration tests.
8. **Databases are Deployments, not StatefulSets.** Works at one replica, but StatefulSets
   are the conventional choice for stateful workloads.
