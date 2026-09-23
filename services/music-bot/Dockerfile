FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip install --no-cache-dir aiohttp yt-dlp

COPY huddle_music_helper.py /app/

# Listen on every interface so the hoffle container can reach it over the
# compose network. The port is not published to the host.
ENV HOST=0.0.0.0
ENV PORT=8731

EXPOSE 8731

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://127.0.0.1:8731/health || exit 1

CMD ["python3", "-u", "/app/huddle_music_helper.py"]
