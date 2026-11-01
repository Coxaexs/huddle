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
  plays the room's mix there. On its own that makes the Hoffle side one voice
  on Discord, because a bot is one voice; with **voice helpers** (below) each
  Hoffle person shows up there on their own. Either way a voice only shows as
  talking while someone on Hoffle is.
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

### Voice helpers: each Hoffle person on their own

Discord gives a bot exactly one voice in a server, so separate voices take
separate bots. Each voice helper is one more Discord application whose bot
stands in for one Hoffle person in the Discord call: it sits in the channel
under their name and picture (in that server only), mirrors their mute and
deafen, and shows as talking exactly while they do. Hoffle people beyond the
helpers on hand are heard through the main bot's mix, as before. The main bot
still listens to Discord and runs the chat; helpers only play.

1. Make one application per helper in the
   [Developer Portal](https://discord.com/developers/applications) and give
   each a name and picture, e.g. "Hoffle Voice 1". No privileged intents are
   needed. With N helpers, up to N Hoffle people show up separately at once.
2. Put their bot tokens in `.env`, comma separated:
   `DISCORD_VOICE_BOT_TOKENS=token1,token2,token3`, and restart the bridge.
3. Each Discord server adds each helper once: **Server Settings →
   Integrations → Discord Bridge → Voices on Discord** has a button per helper
   (View Channel, Connect, Speak and Change Nickname).

- A helper sits in one channel per server, like the main bot, and serves
  every server it has been added to.
- People keep their helper while they stay; newcomers take free ones in the
  order they joined, and get the same helper as last time when it is free, so
  Discord isn't renaming helpers back and forth. A helper takes its own name
  back a minute after its person leaves.
- Pictures are Hoffle uploads (fetched from Hoffle on this machine) or
  Discord's own CDN; any other picture link leaves the helper's own picture.
- Someone on Discord who disconnects or moves a helper keeps it out of that
  server for a minute; its person is mixed into the main bot meanwhile.
- `/healthz` lists the helpers under `voiceHelpers`, and per call under
  `voice[].helpers` who each one is standing in for.

Discord voice is end-to-end encrypted (DAVE); `@discordjs/voice` with
`@snazzah/davey` handles it. Opus runs in WebAssembly (`opusscript`): the
native `@discordjs/opus` crashes Node 22 on exit.

## Tests

```bash
npm test
```
