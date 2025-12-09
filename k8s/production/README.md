# Stashd Production Kubernetes Deployment

This guide covers the initial setup and deployment of Stashd to a Kubernetes cluster.

## Prerequisites

- `kubectl` configured with access to your cluster
- Traefik ingress controller installed with Let's Encrypt resolver named `letsencrypt`
- Longhorn storage class (or update `storageClassName` in PVC manifests)
- DNS configured to point to your cluster

## Docker Images

Stashd uses pre-built images from GitHub Container Registry:

- `ghcr.io/thedutchlab/stashd/backend:production`
- `ghcr.io/thedutchlab/stashd/frontend:production`

If the images are private, you'll need to create a pull secret (see `01-namespace-and-secrets.yaml` for instructions).

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                          Ingress                                 │
│                     (app.stashd.cc)                              │
│                            │                                     │
│              ┌─────────────┴─────────────┐                       │
│              │                           │                       │
│        /api/* routes              /* routes                      │
│              │                           │                       │
│              ▼                           ▼                       │
│      ┌───────────────┐          ┌───────────────┐                │
│      │  Backend API  │          │   Frontend    │                │
│      │   (Node.js)   │          │    (Nginx)    │                │
│      │    :3000      │          │     :80       │                │
│      └───────┬───────┘          └───────────────┘                │
│              │                                                   │
│        ┌─────┼─────┐                                             │
│        │     │     │                                             │
│        ▼     ▼     ▼                                             │
│   ┌────────┐ │ ┌────────┐    ┌─────────────────────────────┐     │
│   │PostgreSQL│ │ Redis  │    │   Backend Worker (x2)       │     │
│   │ :5432  │ │ │ :6379  │    │   (processes backup jobs)   │     │
│   │ (10Gi) │ │ │ (1Gi)  │    │   + temp storage (emptyDir) │     │
│   └────────┘ │ └────────┘    └─────────────────────────────┘     │
│              │                           │                       │
│              └───────────────────────────┘                       │
│                                                                  │
│                       Namespace: stashd                          │
└──────────────────────────────────────────────────────────────────┘
```

## Initial Setup

### Step 1: Configure Secrets

Before applying the manifests, edit `01-namespace-and-secrets.yaml` and replace placeholder values:

```yaml
# postgres-secret
POSTGRES_PASSWORD: "your-secure-database-password"

# app-secret
DB_PASSWORD: "your-secure-database-password"
JWT_SECRET: "your-jwt-secret"
ENCRYPTION_SECRET: "your-encryption-secret"
LICENSE_PUBLIC_KEY: "base64-encoded-public-key"
CORS_ORIGIN: "https://your-domain.com"
```

**Generate secure values:**

```bash
# Generate JWT secret
openssl rand -base64 32

# Generate encryption secret
openssl rand -base64 32
```

### Step 2: Update Domain

Edit `07-ingress.yaml` to replace `app.stashd.cc` with your actual domain.

Also update `CORS_ORIGIN` in `01-namespace-and-secrets.yaml` to match.

### Step 3: Apply Manifests

Apply all manifests in order:

```bash
# Apply namespace and secrets
kubectl apply -f 01-namespace-and-secrets.yaml

# Apply PostgreSQL (wait for it to be ready)
kubectl apply -f 02-postgres.yaml
kubectl wait --for=condition=ready pod -l app=postgres -n stashd --timeout=120s

# Apply Redis (wait for it to be ready)
kubectl apply -f 03-redis.yaml
kubectl wait --for=condition=ready pod -l app=redis -n stashd --timeout=120s

# Apply backend API and worker
kubectl apply -f 04-backend-api.yaml
kubectl apply -f 05-backend-worker.yaml

# Apply frontend
kubectl apply -f 06-frontend.yaml

# Apply ingress
kubectl apply -f 07-ingress.yaml
```

Or apply everything at once:

```bash
kubectl apply -f .
```

## Useful Commands

### View Resources

```bash
# All resources in namespace
kubectl get all -n stashd

# Pod status
kubectl get pods -n stashd

# Pod logs
kubectl logs -f deployment/backend-api -n stashd
kubectl logs -f deployment/backend-worker -n stashd
kubectl logs -f deployment/frontend -n stashd
kubectl logs -f deployment/postgres -n stashd
kubectl logs -f deployment/redis -n stashd
```

### Debugging

```bash
# Describe pod for events
kubectl describe pod -l app=backend-api -n stashd
kubectl describe pod -l app=backend-worker -n stashd

# Exec into container
kubectl exec -it deployment/backend-api -n stashd -- sh

# Check secrets
kubectl get secrets -n stashd
```

### Database Access

```bash
# Connect to PostgreSQL
kubectl exec -it deployment/postgres -n stashd -- psql -U stashd_user -d stashd
```

### Manual Deployment

```bash
# Force restart deployment
kubectl rollout restart deployment/backend-api -n stashd
kubectl rollout restart deployment/backend-worker -n stashd
kubectl rollout restart deployment/frontend -n stashd

# Check rollout status
kubectl rollout status deployment/backend-api -n stashd
kubectl rollout status deployment/backend-worker -n stashd
```

### Scaling

```bash
# Scale replicas (note: only backend-api/backend-worker/frontend, not databases)
kubectl scale deployment/backend-api --replicas=3 -n stashd
kubectl scale deployment/backend-worker --replicas=3 -n stashd
kubectl scale deployment/frontend --replicas=3 -n stashd
```

## Cleanup

To remove everything:

```bash
kubectl delete namespace stashd
```

**Warning:** This will delete all PersistentVolumeClaims and all data. Back up the database first if needed.
