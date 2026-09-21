# ==========================================
# Hoffle: Microservice Web App & Realtime Worker
# ==========================================

FROM node:22-bookworm-slim AS runner

# Install ca-certificates, curl (for healthchecks), and tini (for PID 1 process supervision)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package dependencies and install
COPY package.json package-lock.json tsconfig.json vite.config.ts next.config.js wrangler.jsonc /app/
RUN npm ci

# Copy application source code
COPY app/ /app/app/
COPY lib/ /app/lib/
COPY worker/ /app/worker/
COPY public/ /app/public/
COPY types/ /app/types/
COPY scripts/ /app/scripts/

# Build client bundle and worker
RUN npm run build

# Default environment variables
ENV NODE_ENV=production
ENV PORT=8730
ENV HOST=0.0.0.0
ENV PERSIST_DIR=/app/state

# Persistent storage for SQLite (D1) and uploads (R2)
RUN mkdir -p /app/state
VOLUME ["/app/state"]

EXPOSE 8730

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://127.0.0.1:8730/hangout/api/health || curl -f http://127.0.0.1:8730/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/entrypoint.sh"]
