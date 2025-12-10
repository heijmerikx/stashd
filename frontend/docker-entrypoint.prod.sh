#!/bin/sh
set -e

# Generate runtime config from environment variables
# This allows the same Docker image to be configured at container startup

cat <<EOF > /usr/share/nginx/html/config.js
window.APP_CONFIG = {
  API_URL: "${VITE_API_URL:-http://localhost:8080/api}"
};
EOF

echo "Runtime config generated with API_URL: ${VITE_API_URL:-http://localhost:8080/api}"

# Start nginx
exec nginx -g 'daemon off;'
