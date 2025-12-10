#!/bin/sh
set -e

# Default backend URL for nginx proxy
BACKEND_URL="${BACKEND_URL:-http://localhost:8080}"

# Generate nginx config from template with backend URL
export BACKEND_URL
envsubst '${BACKEND_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Generate runtime config for frontend
# API_URL is relative since nginx proxies /api to backend
cat <<EOF > /usr/share/nginx/html/config.js
window.APP_CONFIG = {
  API_URL: "/api"
};
EOF

echo "Nginx configured to proxy /api to: ${BACKEND_URL}"
echo "Frontend API_URL set to: /api"

# Start nginx
exec nginx -g 'daemon off;'
