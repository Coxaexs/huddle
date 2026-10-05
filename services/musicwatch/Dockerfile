# The Music + Watch bot: the full music bot from
# https://github.com/Coxaexs/musicwatchtogether (dashboard, DJ booth, lyrics,
# Watch Together, and the same queue in Discord voice channels).
#
# Built straight from that repo, so `docker compose build musicwatch` picks up
# its latest version. Pin a branch, tag or commit with MUSICBOT_REF.

FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    ffmpeg \
    git \
    libopus0 \
    tini \
    && rm -rf /var/lib/apt/lists/*

ARG MUSICBOT_REPO=https://github.com/Coxaexs/musicwatchtogether.git
ARG MUSICBOT_REF=main
RUN git clone --depth 1 --branch "$MUSICBOT_REF" "$MUSICBOT_REPO" /opt/musicbot \
    && rm -rf /opt/musicbot/.git

# yt-dlp is upgraded past the pinned range on purpose: YouTube breaks old
# versions every few weeks, and a rebuild should fix that.
RUN pip install --no-cache-dir -r /opt/musicbot/requirements.txt \
    && pip install --no-cache-dir --upgrade yt-dlp

COPY entrypoint.sh hoffle_only.py /opt/hoffle/
RUN chmod +x /opt/hoffle/entrypoint.sh

# The bot keeps its settings, playlists and database next to its code, so the
# code is copied into /data at start and /data is the volume.
WORKDIR /data
VOLUME ["/data"]

ENV PYTHONUNBUFFERED=1 \
    WEB_UI_HOST=0.0.0.0 \
    WEB_UI_PORT=8722 \
    MUSIC_LIBRARY_PATH=/data/musics \
    DJ_STEMS=0

EXPOSE 8722

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8722/healthz > /dev/null || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/opt/hoffle/entrypoint.sh"]
