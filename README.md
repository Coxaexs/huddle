# Huddle

A small private chat app for a group of friends — text channels, voice rooms,
and a music bot that plays into the voice room everyone is sitting in.

It runs as a Cloudflare Worker, but it is never deployed to Cloudflare: on this
machine `wrangler dev` serves it locally on port 8730 and nginx puts it at
`https://deeppixel.online/hangout`. D1 and R2 are the local SQLite/disk
emulations under `state/`, which is why that directory holds the real data and
must be backed up rather than deleted.

## Layout

    app/                 Next.js App Router pages, API routes and UI
      chat-shell.tsx     the whole client shell
      components/        auth gate, settings, slash palette, now-playing card
      hooks/             hub socket, WebRTC voice, synced playback
      api/               server routes (auth, servers, channels, music, bots)
    lib/                 shared server code
      hub.ts             the Durable Object: presence, voice, player clock
      schema.ts          D1 tables, migrated on demand
    worker/index.ts      worker entry: assets, realtime upgrade, then vinext
    huddle_music_helper.py  yt-dlp resolver on :8731 (its own systemd unit)

## Working on it

    npm install
    npm run build        # writes dist/, the shape wrangler already expects
    npm run serve        # or let the systemd unit do it

`npm run build` must be run with Node 22 (`node_modules/node/bin/node`); the
systemd unit uses that same binary.

To try changes without touching the live database, copy `state/` somewhere and
point `--persist-to` at the copy.

## Deploying a change

    npm run build
    sudo systemctl restart huddle.service

`npm run build` is also what publishes `.dev.vars`: the build copies it to
`dist/server/.dev.vars`, and that copy is the one wrangler actually reads.
Editing the root `.dev.vars` without rebuilding changes nothing, silently.

`wrangler dev` does not reliably pick up a rebuilt worker on its own, so the
restart is required. Nothing else needs to move: the systemd unit already points
at `dist/server/wrangler.json`, and the schema migrates itself on first request.

## Accounts

The first account created owns the Huddle; everyone after it needs an invite
code, made from Settings → Invites. Because the app is reachable from the open
internet, set `BOOTSTRAP_CODE` in `.dev.vars` before the first deploy — then
even that first signup needs a code only you have. Every member is automatically in every
server — there are no roles yet, on purpose.

Sessions are cookies scoped to `/hangout`, holding a random token whose hash is
what the database stores. Passwords are PBKDF2-SHA256 through WebCrypto.

## Voice and music

Voice rooms are a WebRTC mesh: browsers connect directly to each other and the
hub Durable Object only relays the handshake. Turkish ISPs commonly use carrier-grade NAT, where STUN alone cannot connect the
two ends: the call negotiates, the tiles appear, and then nothing is heard or
seen. A TURN server is what fixes that, and one runs on this machine —
`coturn`, reachable at `xray.deeppixel.online` (that hostname bypasses
Cloudflare, which will not proxy TURN) on 3478/UDP+TCP and 5349/TLS, with the
relay range 49160-49200/UDP forwarded through the router.

`HUDDLE_ICE_SERVERS` holds the JSON array of `RTCIceServer` entries the browser
is handed. `/api/voice/ice` reports whether it used that configuration or fell
back to plain STUN, because a silent fallback looks exactly like a working setup
until nobody can hear each other.

Music is not streamed by the bot. `/play` resolves a track through the helper on
:8731, and the hub publishes one position for the room; every listener plays the
same source and is nudged back onto that position. That is what makes the
progress bar the control it looks like — clicking it seeks for everyone.

The music bot's dashboard can see these rooms too. Set in its `.env`:

    HUDDLE_BASE_URL=http://127.0.0.1:8730/hangout
    HUDDLE_BOT_TOKEN=<same value as BOT_TOKEN in .dev.vars>

## What else is in here

Direct messages (the only thing not visible to everyone — the hub filters those
broadcasts by audience), pinned messages, message deleting, profile pictures,
GIFs, and a right-click menu on people for per-person volume, a personal mute,
or a server mute that stops their microphone for everyone.

Slash commands cover both bots. Anything under "Music" runs in your Huddle voice
room; "Discord music" reaches the same bot but drives its Discord voice
connection, because those features live in its ffmpeg pipeline.

## Configuration

`.dev.vars` (not in git) holds the secrets:

    MUSICWATCH_PASSWORD   password for the music bot dashboard
    BOT_TOKEN             shared secret for /api/bot/* and /api/bots/messages
    BOOTSTRAP_CODE        needed by the very first signup
    TENOR_API_KEY         optional; enables GIF search in the composer
    HUDDLE_ICE_SERVERS    optional; JSON RTCIceServer[] for a TURN server

Everything else lives in `wrangler.jsonc`, overridden per-host by `--var` flags
in the systemd unit.
