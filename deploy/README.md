# Hoffle Deployment & Operations Configs

This directory holds host configurations, reverse proxy templates, systemd units, and NAS templates for running Hoffle in production.

| Path | Description |
| :--- | :--- |
| [`nginx.example.conf`](nginx.example.conf) | Annotated Nginx reverse-proxy template for self-hosters (HTTPS, WebSocket upgrades, upload size limits). |
| [`hoffle.online.conf`](hoffle.online.conf) | Production Nginx virtual host configuration for `hoffle.online` and `chat.hoffle.online`. |
| [`livekit.hoffle.online.conf`](livekit.hoffle.online.conf) | Nginx TLS termination and WebSocket proxy config for the LiveKit SFU (`livekit.hoffle.online`). |
| [`cloudflare-realip.conf`](cloudflare-realip.conf) | Restores real visitor IP addresses when running behind Cloudflare proxy ranges. |
| [`coturn/`](coturn/) | Coturn STUN/TURN relay configuration (`turnserver.conf`) and dynamic external-IP sync timer. |
| [`huddle-service/`](huddle-service/) | Production `systemd` socket-activated service (`huddle.service`, `huddle.socket`) running `workerd` directly with `huddle-watchdog.sh`. |
| [`huddle-healthcheck/`](huddle-healthcheck/) | Systemd healthcheck timer and nightly graceful restart units. |
| [`memguard/`](memguard/) | Host memory pressure monitor (`hoffle-memguard.py`) that protects the server from OOM stalls. |
| [`downloads/`](downloads/) | Systemd timer that mirrors GitHub Release desktop installers locally for fast direct downloads. |
| [`unraid/`](unraid/) | Unraid Community Applications XML template (`hoffle.xml`) for single-container NAS installs. |
