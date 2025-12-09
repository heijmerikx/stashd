# Build stage
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for building)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-bookworm-slim

WORKDIR /app

# Install database backup tools
# - PostgreSQL: Multiple versions via apt.postgresql.org
# - MySQL: Official MySQL 8 client from MySQL APT repo (supports caching_sha2_password)
# - MongoDB: mongodump from mongodb-database-tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    && mkdir -p /etc/apt/keyrings \
    # Add PostgreSQL repo
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/keyrings/postgresql.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    # Add MongoDB repo
    && curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /etc/apt/keyrings/mongodb.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/mongodb.gpg] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" > /etc/apt/sources.list.d/mongodb.list \
    && apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client-15 \
    postgresql-client-16 \
    postgresql-client-17 \
    default-mysql-client \
    mongodb-database-tools \
    redis-tools \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy SQL migration files (not compiled by TypeScript)
COPY --from=builder /app/src/db/migrations ./dist/db/migrations

# Create backups directory
RUN mkdir -p /data/backups

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Run migrations and start server
CMD ["sh", "-c", "node dist/scripts/migrate.js && node dist/index.js"]
