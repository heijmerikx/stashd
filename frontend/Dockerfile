# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
# VITE_API_URL: use /api for Docker Compose (proxied), or set full URL for external deployments
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy both nginx configs - entrypoint selects based on NGINX_CONFIG env var
COPY nginx.docker.conf /tmp/nginx.docker.conf
COPY nginx.conf /tmp/nginx.standalone.conf

# Copy entrypoint script
COPY docker-entrypoint.prod.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# NGINX_CONFIG env var: "docker" (default) or "standalone"
ENV NGINX_CONFIG=docker

ENTRYPOINT ["/docker-entrypoint.sh"]
