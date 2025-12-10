#!/bin/sh
set -e

# Default backend URL for nginx proxy
BACKEND_URL="${BACKEND_URL:-http://localhost:8080}"

# Extract hostname from BACKEND_URL for SSL SNI
# e.g., https://my-backend.railway.app -> my-backend.railway.app
BACKEND_HOST=$(echo "$BACKEND_URL" | sed -E 's|^https?://||' | sed -E 's|/.*$||' | sed -E 's|:.*$||')

# Generate nginx config from template with backend URL and host
export BACKEND_URL
export BACKEND_HOST
envsubst '${BACKEND_URL} ${BACKEND_HOST}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf

# Generate runtime config for frontend
# API_URL is relative since nginx proxies /api to backend
cat <<EOF > /usr/share/nginx/html/config.js
window.APP_CONFIG = {
  API_URL: "/api"
};
EOF

echo "Nginx configured to proxy /api to: ${BACKEND_URL}"
echo "Backend host for SNI: ${BACKEND_HOST}"
echo "Frontend API_URL set to: /api"

# Start nginx
exec nginx -g 'daemon off;'
