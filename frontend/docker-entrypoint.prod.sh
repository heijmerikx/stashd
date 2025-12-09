#!/bin/sh
set -e

# Select nginx config based on NGINX_CONFIG env var
# - "docker" (default): proxies /api to backend-api container (for Docker Compose)
# - "standalone": no proxy, frontend calls backend directly via VITE_API_URL (for Railway, k8s, etc.)
NGINX_CONFIG="${NGINX_CONFIG:-docker}"

if [ "$NGINX_CONFIG" = "standalone" ]; then
    echo "Using standalone nginx config (no /api proxy)"
    cp /tmp/nginx.standalone.conf /etc/nginx/conf.d/default.conf
else
    echo "Using docker nginx config (proxying /api to backend-api:3000)"
    cp /tmp/nginx.docker.conf /etc/nginx/conf.d/default.conf
fi

exec nginx -g "daemon off;"
