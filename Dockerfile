# ==========================================
# Hoffle: Microservice Web App & Realtime Worker
# ==========================================

# The bundle is plain JavaScript, so it is built once on the build machine's
# own platform and copied into every image. Built under QEMU for arm64, the
# vite build sometimes hung until CI gave up after 6 hours.
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json vite.config.ts next.config.js wrangler.jsonc /app/
RUN npm ci

COPY app/ /app/app/
COPY lib/ /app/lib/
COPY worker/ /app/worker/
COPY public/ /app/public/
COPY types/ /app/types/
COPY scripts/ /app/scripts/
# The site's /docs pages are built from these markdown files.
COPY README.md /app/
COPY docs/ /app/docs/

# Build client bundle and worker
RUN npm run build

FROM node:22-bookworm-slim AS runner

# Install ca-certificates, curl (for healthchecks), and tini (for PID 1 process supervision)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    sqlite3 \
    tini \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies for the target platform (wrangler runs a native workerd)
COPY package.json package-lock.json tsconfig.json vite.config.ts next.config.js wrangler.jsonc /app/
RUN npm ci

# Copy application source code
COPY app/ /app/app/
COPY lib/ /app/lib/
COPY worker/ /app/worker/
COPY types/ /app/types/
COPY scripts/ /app/scripts/
COPY README.md /app/
COPY docs/ /app/docs/

# The built bundle, and public/ with the files the build generated into it
COPY --from=build /app/public/ /app/public/
COPY --from=build /app/dist/ /app/dist/

# Default environment variables
ENV NODE_ENV=production
ENV PORT=8730
ENV HOST=0.0.0.0
ENV PERSIST_DIR=/app/state
# Headroom so wrangler dev (Miniflare) does not stall in GC under load
ENV NODE_OPTIONS=--max-old-space-size=2048
# Every V8 collection a full one, so workerd's memory levels off instead of
# growing with every request (see scripts/workerd-config.sh)
ENV MINIFLARE_WORKERD_V8_FLAGS=--gc-global

# Persistent storage for SQLite (D1), uploads (R2) and generated secrets
RUN mkdir -p /app/state
VOLUME ["/app/state"]

EXPOSE 8730

HEALTHCHECK --interval=30s --timeout=15s --start-period=60s --retries=5 \
  CMD curl -fsS http://127.0.0.1:8730/api/health > /dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/entrypoint.sh"]
