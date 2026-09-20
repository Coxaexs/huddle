# ==========================================
# Hoffle: Open Source Discord Alternative
# Multi-process self-hosted container with:
# - Hoffle Web App & Worker (Port 8730)
# - Python yt-dlp Music Helper (Port 8731)
# ==========================================

FROM node:22-bookworm-slim AS runner

# Install Python 3, pip, ffmpeg, and ca-certificates for yt-dlp music streaming
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies for the music helper
COPY huddle_music_helper.py /app/
RUN python3 -m venv /app/pyenv && \
    /app/pyenv/bin/pip install --no-cache-dir aiohttp yt-dlp

# Copy package dependencies and install
COPY package.json package-lock.json tsconfig.json vite.config.ts next.config.js wrangler.jsonc /app/
RUN npm ci

# Copy application source code
COPY app/ /app/app/
COPY lib/ /app/lib/
COPY worker/ /app/worker/
COPY public/ /app/public/
COPY types/ /app/types/

# Build the client bundle and worker
RUN npm run build

# Default environment variables
ENV NODE_ENV=production
ENV PORT=8730
ENV HOST=0.0.0.0
ENV PERSIST_DIR=/app/state

# Create state directory for SQLite (D1) and uploads (R2)
RUN mkdir -p /app/state

# Entrypoint script that boots both the music helper and the worker
COPY <<'EOF' /app/entrypoint.sh
#!/bin/sh
set -e

echo "=== Starting Hoffle Music Helper on :8731 ==="
/app/pyenv/bin/python3 /app/huddle_music_helper.py &
MUSIC_PID=$!

echo "=== Starting Hoffle Server on :8730 ==="
# Ensure .dev.vars exists if not provided
touch /app/.dev.vars

# Run wrangler dev binding to 0.0.0.0 so the container is accessible from host
npx wrangler dev \
  --config /app/dist/server/wrangler.json \
  --env-file /app/.dev.vars \
  --ip 0.0.0.0 \
  --port 8730 \
  --persist-to /app/state &
SERVER_PID=$!

# Trap signals for graceful shutdown
trap "kill -TERM $MUSIC_PID $SERVER_PID; exit 0" INT TERM

wait $SERVER_PID
EOF

RUN chmod +x /app/entrypoint.sh

# Persistent storage for messages, users, and media uploads
VOLUME ["/app/state"]

EXPOSE 8730 8731

ENTRYPOINT ["/app/entrypoint.sh"]
