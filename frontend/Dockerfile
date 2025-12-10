# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# App version from git tag (passed at build time)
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy nginx config template (will be processed at runtime)
COPY nginx.conf.template /etc/nginx/conf.d/default.conf.template

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy entrypoint script
COPY docker-entrypoint.prod.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

# Use entrypoint to configure nginx and start
ENTRYPOINT ["/docker-entrypoint.sh"]
