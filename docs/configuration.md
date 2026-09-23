# Configuration reference

With Docker, settings go in a `.env` file next to `docker-compose.yml`. Start from the template:

```bash
cp .env.example .env
```

Apply changes with `docker compose up -d`. Nothing is required: every setting has a working default.

Where a setting can come from, later sources override earlier ones:

1. `state/secrets.env`: generated on first start. Holds `BOT_TOKEN` and `BOOTSTRAP_CODE`.
2. `.dev.vars`: only if you mount one into the container (older setups did this).
3. `.env` / container environment variables.

Running without Docker (`npm run serve`)? Put the same settings in `.dev.vars` instead. See [`.dev.vars.example`](../.dev.vars.example).

## Docker

| Variable      | Default | What it does |
| ------------- | ------- | ------------ |
| `HOFFLE_PORT` | `8730`  | Port on your machine that Hoffle is published on. |

## Security

| Variable         | Default   | What it does |
| ---------------- | --------- | ------------ |
| `BOOTSTRAP_CODE` | generated | Code required to create the first (owner) account. After that account exists, it no longer does anything. |
| `BOT_TOKEN`      | generated | Global secret for system bots, the music publisher and internal services. Treat it like a password. |

## Web address

| Variable          | Default    | What it does |
| ----------------- | ---------- | ------------ |
| `BASE_PATH`       | `/hangout` | Path the app is served under. Requests to `/` and other paths outside it are routed into it, so you rarely need to change this. |
| `LANDING_DOMAINS` | `hoffle.online,www.hoffle.online` | Comma-separated domains where `/` shows the public landing page instead of the app. Set it to your marketing domain if you have one. |

## Voice and video

| Variable             | Default | What it does |
| -------------------- | ------- | ------------ |
| `HUDDLE_ICE_SERVERS` | Cloudflare public STUN | JSON array of [`RTCIceServer`](https://developer.mozilla.org/docs/Web/API/RTCIceServer) objects. Add your TURN server here. See [Voice](self-hosting.md#voice-when-calls-do-not-connect). |
| `LIVEKIT_URL`        | unset   | `wss://` address of a LiveKit server. When set with the two keys below, voice goes through LiveKit instead of peer-to-peer. |
| `LIVEKIT_API_KEY`    | unset   | Key name from `livekit.yaml`. |
| `LIVEKIT_API_SECRET` | unset   | Secret from `livekit.yaml`. |

## Push notifications

Lets Hoffle notify people about DMs and mentions while the tab is closed. Generate a key pair once:

```bash
docker compose exec hoffle npx web-push generate-vapid-keys
```

| Variable            | What it does |
| ------------------- | ------------ |
| `VAPID_PUBLIC_KEY`  | Public key from the command above. |
| `VAPID_PRIVATE_KEY` | Private key from the command above. |
| `VAPID_SUBJECT`     | A contact address, such as `mailto:you@example.com`. |

Do not change the keys later, or existing subscriptions stop working.

## Integrations

| Variable                | What it does |
| ----------------------- | ------------ |
| `KLIPY_API_KEY`         | Enables GIF search in the message box ([klipy.com](https://klipy.com)). Without it, pasting or uploading GIFs still works. |
| `LASTFM_API_KEY`, `LASTFM_SECRET` | Last.fm "now playing" integration. |
| `MUSICWATCH_PASSWORD`   | Password for the external music dashboard. |
| `MUSICWATCH_BASE_URL`, `MUSICWATCH_PUBLIC_URL` | Address of an external music dashboard, if you run one. |

## Internal service addresses

Docker Compose sets these for you. You only need them when running services by hand.

| Variable                | Compose value           | What it does |
| ----------------------- | ----------------------- | ------------ |
| `MUSIC_HELPER_BASE_URL` | `http://music-bot:8731` | yt-dlp resolver used by the music bot. |
| `DND_BASE_URL`          | `http://dnd-bot:8732`   | D&D 5e compendium service. |
| `DND_PUBLIC_URL`        | `https://dnd.deeppixel.online` | Public address of the D&D companion, for links shown to users. |

## Advanced

| Variable                  | What it does |
| ------------------------- | ------------ |
| `FEATURE_RECORD_SESSIONS` | `1` turns on the consent-gated D&D session recorder. See [dnd-session-recorder.md](dnd-session-recorder.md). |
| `RECORDER_SERVICE_URL`, `RECORDER_SERVICE_TOKEN` | Address and token of the recorder service. |
| `GOOGLE_SITE_VERIFICATION` | Google Search Console verification token for the landing page. |

## Adding a new setting (for developers)

Wrangler does not pass the container's environment through to the worker. `scripts/entrypoint.sh` copies an explicit list of variables (`PASSTHROUGH_KEYS`) into the env file the worker reads. If you add a binding that should be configurable from `.env`, add its name to that list.
