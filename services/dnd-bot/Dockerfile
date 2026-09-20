FROM python:3.12-alpine

WORKDIR /app
COPY server.py /app/

EXPOSE 8732

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD python3 -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8732/health')" || exit 1

CMD ["python3", "-u", "/app/server.py"]
