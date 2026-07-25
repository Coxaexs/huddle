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
hub Durable Object only relays the handshake. `HUDDLE_ICE_SERVERS` (a JSON array
of `RTCIceServer`) can add a TURN server for friends behind strict NATs; without
one, public STUN is used and most home connections work.

Music is not streamed by the bot. `/play` resolves a track through the helper on
:8731, and the hub publishes one position for the room; every listener plays the
same source and is nudged back onto that position. That is what makes the
progress bar the control it looks like — clicking it seeks for everyone.

The music bot's dashboard can see these rooms too. Set in its `.env`:

    HUDDLE_BASE_URL=http://127.0.0.1:8730/hangout
    HUDDLE_BOT_TOKEN=<same value as BOT_TOKEN in .dev.vars>

## Configuration

`.dev.vars` (not in git) holds the secrets:

    MUSICWATCH_PASSWORD   password for the music bot dashboard
    BOT_TOKEN             shared secret for /api/bot/* and /api/bots/messages

Everything else lives in `wrangler.jsonc`, overridden per-host by `--var` flags
in the systemd unit.
