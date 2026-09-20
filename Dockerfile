# Build from this directory: docker build -t atc-console .
# Stage 1: build the Svelte app (dev dependencies only live here).
FROM node:22-alpine AS ui
WORKDIR /app
COPY package.json package-lock.json vite.legacy.config.js svelte.config.js ./
COPY ui ./ui
RUN npm ci && npm run build

# Stage 2: runtime dependencies.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Stage 3: runtime image.
FROM node:22-alpine
ENV NODE_ENV=production DB_PATH=/data/console.db SERVICES_FILE=/config/services.json PUBLIC_DIR=/app/public PORT=3004
WORKDIR /app
RUN mkdir -p /data /config && chown node:node /data /config
COPY --from=deps /app/node_modules ./node_modules
COPY --from=ui /app/public ./public
COPY package.json ./
COPY openapi.yaml ./
COPY src ./src
COPY scripts ./scripts
USER node
VOLUME ["/data", "/config"]
EXPOSE 3004
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- --no-check-certificate "$( [ -n "$TLS_CERT_PATH" ] && echo https || echo http )://127.0.0.1:3004/health" || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
