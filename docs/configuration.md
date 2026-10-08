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
| `HUDDLE_CSP`     | unset     | `1` sends the bundled Content-Security-Policy. See [Content-Security-Policy](#content-security-policy). |
| `HUDDLE_CSP_POLICY` | unset  | Send this policy verbatim instead of the bundled one. Overrides `HUDDLE_CSP`. |

### Response headers

Every response carries these, with no configuration:

| Header | Value | Why |
| ------ | ----- | --- |
| `X-Content-Type-Options` | `nosniff` | Stops a mislabelled upload from being executed as HTML. |
| `X-Frame-Options` | `SAMEORIGIN` | Stops Hoffle being framed by another site. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Keeps invite tokens out of the `Referer` sent to third-party hosts via link previews. |
| `Permissions-Policy` | camera/microphone/display-capture for `self` only; geolocation, payment, USB denied | Voice and screen share need those three; nothing here needs the rest. |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Only sent when the request arrived over HTTPS. |

### Content-Security-Policy

Left off by default. A policy that does not match your setup breaks voice, uploads
or themes *silently* — the browser blocks the request and the app just stops
working — so it is opt-in rather than on by default.

```bash
HUDDLE_CSP=1
```

Then check, in this order, before leaving it on: join a voice room, upload an
image and a PDF, apply a custom theme, send a voice message, open a link preview,
and start the music bot. If any of those break, either leave the CSP off or write
your own with `HUDDLE_CSP_POLICY`.

The bundled policy allows `blob:` (the dice renderer, the noise-suppression
worklet and the session recorder all run from blob URLs), `'wasm-unsafe-eval'`
(MediaPipe selfie segmentation), `'unsafe-inline'` for styles (themes inject CSS),
and `ws:`/`wss:` for the realtime socket and LiveKit. Tightening it means
checking those features still work.

## Rate limiting

Built in, no configuration. Fixed windows, counted in the database so they hold
across restarts and worker isolates:

| Action | Budget |
| ------ | ------ |
| Login | 10 attempts per 5 minutes, per IP **and** per username |
| Signup | 5 attempts per 10 minutes, per IP |

Per-username login limiting means one attacker cannot lock you out by hammering
your name, and a botnet cannot avoid the IP limit by rotating for a single
account. Both buckets must have room for a login to proceed. Exceeding a budget
returns `429` with a `Retry-After` header.

Behind a reverse proxy, the client address comes from `CF-Connecting-IP`, then
the first hop of `X-Forwarded-For`, then `X-Real-IP`. If none is present every
request shares one bucket — it fails closed (over-limiting) rather than open, so
make sure your proxy sets one of those headers.


## Web address

| Variable          | Default    | What it does |
| ----------------- | ---------- | ------------ |
| `BASE_PATH`       | `/hangout` | Path the app is served under. Requests to `/` and other paths outside it are routed into it, so you rarely need to change this. |
| `LANDING_DOMAINS` | `hoffle.online,www.hoffle.online` | Comma-separated domains where `/` shows the public landing page instead of the app. Set it to your marketing domain if you have one. |

## Voice and video

| Variable             | Default | What it does |
| -------------------- | ------- | ------------ |
| `HUDDLE_ICE_SERVERS` | Cloudflare public STUN | JSON array of [`RTCIceServer`](https://developer.mozilla.org/docs/Web/API/RTCIceServer) objects. Add your TURN server here, then verify it with `npm run check:turn -- --ice-servers "$HUDDLE_ICE_SERVERS"`. See [Voice](self-hosting.md#voice-when-calls-do-not-connect). |
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

### Native Android app notifications (Firebase)

The Android app in `mobile/` gets notifications through Firebase Cloud Messaging, since browser push can't run inside the app.

| Variable              | What it does |
| --------------------- | ------------ |
| `FCM_SERVICE_ACCOUNT` | The Firebase service-account key (Project settings → Service accounts → **Generate new private key**), as one line of JSON. |

The matching `google-services.json` goes into the app build; see `mobile/README.md`. iOS isn't covered: a sideloaded app can't receive Apple push notifications.

### Phone notifications without vendor keys (ntfy / UnifiedPush)

Each user can paste an [ntfy](https://ntfy.sh) topic URL under **Settings → Appearance → Phone notifications**. Hoffle then POSTs mentions, DMs, event reminders and incoming calls (high priority) to that topic, and the ntfy app delivers them in the background on Android and iOS. Nothing here needs VAPID, APNs or FCM credentials. Run your own ntfy server if you'd rather not use ntfy.sh.

| Variable                    | What it does |
| --------------------------- | ------------ |
| `HUDDLE_PUSH_ALLOW_PRIVATE` | Set to `1` to allow `http://` and LAN/private addresses (e.g. an `ntfy` container on the same compose network). Off by default, since the server makes these requests. |

## Integrations

| Variable                | What it does |
| ----------------------- | ------------ |
| `KLIPY_API_KEY`         | Enables GIF search in the message box ([klipy.com](https://klipy.com)). Without it, pasting or uploading GIFs still works. |
| `GEMINI_API_KEY`        | Enables `/ask` ([free key](https://aistudio.google.com/apikey)). Answers use Flash-Lite, search DuckDuckGo when a question needs current info, and allow 3 questions a minute and 60 an hour per user. |
| `GEMINI_MODEL`          | Models `/ask` tries in order, comma separated. Default `gemini-3.1-flash-lite,gemini-3.5-flash-lite`. |
| `ANTHROPIC_API_KEY`     | Answers `/ask` with Claude instead (paid, [platform.claude.com](https://platform.claude.com)). If `GEMINI_API_KEY` is set too, Gemini answers whenever Claude fails or runs out of credit. |
| `ANTHROPIC_MODEL`       | Claude model for `/ask`. Default `claude-haiku-5-5`. |
| `AI_DAILY_LIMIT`        | `/ask` answers per day for the whole server, default 200, which keeps a free key under its quota. |
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
