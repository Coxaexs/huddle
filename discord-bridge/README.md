# Hoffle Discord bridge

Mirrors chosen Discord channels with Hoffle channels, both ways:

- each person keeps their own name and picture on the other side (webhooks)
- pictures and files are copied across (too-big ones become links)
- edits, deletes, replies, reactions, threads and "is typing…" follow
- messages sent while the bridge was down are carried over when it is back
  (up to 12 hours)
- a Hoffle voice room paired with a Discord voice channel carries the call
  too (see **Voice** below)
- people who link their accounts (`/hoffle-account link`) show up as
  themselves on both sides

One bridge and one Discord bot serve every Hoffle server on the instance.
Each server sets itself up in **Server Settings → Integrations → Discord
Bridge**: invite the bot to the Discord server, run `/hoffle link CODE` there,
then pick which channels pair up. Settings shows whether the bridge is online
and which Discord permissions are missing.

## Running it

You need a Discord application with a bot
([Developer Portal](https://discord.com/developers/applications)). On its Bot
tab, turn on **Message Content Intent**. Leave **Public Bot** on if other
people's servers should be able to invite it.

Copy `.env.example` to `.env` and set `DISCORD_BOT_TOKEN`, Hoffle's
`BOT_TOKEN` (or `HOFFLE_ENV_FILE`) and `HOFFLE_PUBLIC_URL`.

**Docker:** `docker compose --profile bridge up -d` from the Hoffle folder.

**Without Docker** (Node 22.5 or newer):

```bash
cd discord-bridge
npm install
npm start
```

or as a user service: see `systemd/hoffle-discord-bridge.service`.

`curl 127.0.0.1:8733/healthz` shows whether both sides are connected.

## How it works

- Two discord.js clients: one on Discord, one on Hoffle's Discord-compatible
  gateway as the built-in "Discord Bridge" bot (its token is derived from
  Hoffle's `BOT_TOKEN`).
- It reads the links and channel pairs from Hoffle every 10 seconds
  (`GET /api/discord-bridge/config`) and reports its status and what it can
  see on Discord every 30 seconds (`POST /api/discord-bridge/status`).
- `state/bridge.db` (SQLite) remembers which message is which, the webhooks it
  made, how far it got in each channel, and who reacted. Delete it and the
  bridge starts fresh from the newest messages; old messages then no longer
  follow edits or reactions.

## Voice

Pair a Hoffle voice room with a Discord voice channel and keep **Voice chat**
on in the bridge settings.

- Everyone in the Discord channel gets their own seat in the Hoffle room, with
  their name, picture and a DISCORD tag (someone who linked their account sits
  as their Hoffle self). Their voice is their own LiveKit track, so Hoffle
  shows who is talking and can turn each of them up or down.
- While anyone is in the Hoffle room, the bot sits in the Discord channel and
  plays the room's mix there: the Hoffle side sounds like one voice on
  Discord, because a bot is one voice. It only shows as talking while someone
  on Hoffle is.
- `/hoffle-voice effect:` changes how a Discord person sounds to Hoffle
  (deep, chipmunk, robot, radio, echo, vampire, alien). Hoffle people's own
  voice effects reach Discord as they are.
- Discord voices are levelled on the way in (up to +18 dB, down to -12 dB,
  aiming for about -18 dBFS while speaking), because browsers already run
  automatic gain on Hoffle's own mics and an untouched Discord voice sounds
  faint next to them. `/healthz` shows each Discord voice under
  `voice[].people`: `speakingLevelDb` is how loud it arrives, `boostDb` what
  the leveller adds, and `gaps`/`decodeErrors`/`queueResets` tell "cutting
  out" apart from "too quiet".
- Sound only crosses while there is someone on both sides. A Hoffle moderator
  can remove a Discord person from the room; they stay out until they leave
  the Discord channel.
- Discord lets a bot sit in one voice channel per server: with several bridged
  voice channels in one Discord server, the first busy one gets the bot.
- The bot needs **Connect** and **Speak** in the channel (on a stage, also
  **Mute Members** to speak). Each Discord person in a call costs the bridge
  about 35 MB of memory.

Discord voice is end-to-end encrypted (DAVE); `@discordjs/voice` with
`@snazzah/davey` handles it. Opus runs in WebAssembly (`opusscript`): the
native `@discordjs/opus` crashes Node 22 on exit.

## Tests

```bash
npm test
```
