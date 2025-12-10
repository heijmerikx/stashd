<div align="center">

<img src="frontend/public/favicon.svg" alt="Stashd Logo" width="120" height="120">

# Stashd

**Self-hosted backup orchestration without vendor lock-in**

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-alpha-orange.svg)]()
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED.svg)](https://docker.com/)

*Centralized backup management to gain independence and autonomy over your data*

[Getting Started](#development-quick-start) •
[Documentation](#deployment) •
[Website](https://stashd.cc)

</div>

---

## Focus

Testing/stability/feedback, not adding more (significant) features at the moment. 

## Deployment Quick Start

### On Railway

#### 1. Deploy Databases

- Deploy a **Redis** container
- Deploy a **PostgreSQL** container

#### 2. Deploy Backend

1. Create a new service using the **Docker Image** option
2. Enter the image URL:
   ```
   ghcr.io/heijmerikx/stashd-backend:0.1.0-alpha.9
   ```
   Choose the latest image tag available.
3. Configure environment variables (use Railway references to connect to your databases):

   | Variable | Description |
   |----------|-------------|
   | `DB_HOST` | PostgreSQL host |
   | `DB_NAME` | PostgreSQL database name |
   | `DB_USER` | PostgreSQL user |
   | `DB_PASSWORD` | PostgreSQL password |
   | `REDIS_HOST` | Redis host |
   | `REDIS_USERNAME` | Redis username |
   | `REDIS_PASSWORD` | Redis password |
   | `JWT_SECRET` | Secret for JWT signing (32+ chars) |
   | `ENCRYPTION_SECRET` | Secret for encrypting credentials (32+ chars) |

#### 3. Deploy Frontend

1. Create a new service using the **Docker Image** option
2. Enter the image URL:
   ```
   ghcr.io/heijmerikx/stashd-frontend:0.1.0-alpha.9
   ```
   Here too, have the version match the backend image tag
3. Configure environment variables:

   | Variable | Description |
   |----------|-------------|
   | `BACKEND_URL` | Internal backend URL, e.g. `https://my-stashd-backend.up.railway.app` (without `/api`) |

   The frontend nginx proxies `/api` requests to the backend, so no CORS configuration is needed.

### Docker Compose

1. Create a `.env` file with required variables:

```bash
DB_PASSWORD=your_secure_db_password
JWT_SECRET=your_jwt_secret_min_32_chars
ENCRYPTION_SECRET=your_encryption_secret_min_32_chars
CORS_ORIGIN=http://localhost
```

2. Run with Docker Compose:

```bash
docker compose up -d
```

This starts:
- **Frontend**: http://localhost (port 80)
- **Backend API**: http://localhost:3000
- **PostgreSQL** and **Redis** (internal)
- **2 worker replicas** for backup job processing

Optional environment variables:
- `STASHD_VERSION` - Image version tag (default: `alpha`)
- `HTTP_PORT` - Frontend port (default: 80)
- `API_PORT` - Backend API port (default: 3000)
- `BACKUP_PATH` - Host path for backup storage (default: Docker volume)

To pin a specific version:
```bash
STASHD_VERSION=0.1.0-alpha.1 docker compose up -d
```

### Kubernetes

Check the k8s directory for examples for reference.

## Development

Run with Docker Compose:

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8080
- **PostgreSQL**: localhost:5430
- **Redis**: localhost:6380

## Environment Variables

### Backend
- `PORT` - Server port (default: 3000)
- `DB_HOST` - PostgreSQL host
- `DB_PORT` - PostgreSQL port
- `DB_NAME` - Database name
- `DB_USER` - Database user
- `DB_PASSWORD` - Database password
- `REDIS_HOST` - Redis host for job queue
- `REDIS_PORT` - Redis port (default: 6379)
- `JWT_SECRET` - Secret for JWT signing
- `ENCRYPTION_SECRET` - Secret for encrypting sensitive data (notification credentials). Must be 32+ characters for AES-256
- `CORS_ORIGIN` - Allowed CORS origin

### Frontend
- `BACKEND_URL` - Backend URL for nginx proxy (e.g. `http://backend:8080`)

## Deployment

### Graceful Shutdown job queues

The backend handles `SIGTERM` gracefully - it waits for active backup jobs to complete before exiting. This prevents interrupted backups during deployments.

**Docker Compose:** Uses `stop_grace_period: 5m` to allow up to 5 minutes for backups to complete.

**Kubernetes:** Set `terminationGracePeriodSeconds` in your Pod spec:
```yaml
spec:
  terminationGracePeriodSeconds: 300  # 5 minutes
```

## Versioning

Stashd uses semantic versioning. During alpha, images are tagged as:
- `0.1.0-alpha.1`, `0.1.0-alpha.2`, etc. - specific versions
- `alpha` - latest alpha release

## License

Stashd is dual-licensed under Apache 2.0 and a commercial license.

- **Personal & Open Source**: Free under Apache 2.0
- **Commercial Use**: Requires a [commercial license](https://stashd.cc/)
