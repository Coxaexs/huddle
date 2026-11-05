# Bots

Hoffle has three kinds of bots:

- **Bots from the Developer Portal**, which anyone can make and add to a server with an invite link, the way Discord works. See [Making a bot](#making-a-bot).
- **Unmodified Discord bots** written with discord.js, discord.py and similar libraries. See [Running real Discord bots](#running-real-discord-bots).
- **Simple scripts** that post messages over plain HTTP. See [Hoffle's own bot API](#hoffles-own-bot-api).

The examples use `http://localhost:8730`. Replace it with your server's address, and use `https://` / `wss://` if it is behind HTTPS.

## Making a bot

1. Open the **Developer Portal** at `/hangout/developers` (or Server Settings → Integrations → Your own bot).
2. Create a bot and copy its token. It is shown once. If you lose it, reset it.
3. Under **Invite link**, tick the permissions your bot needs and copy the link.
4. Share the link. Anyone with **Manage Server** opens it, picks a server, sees what the bot asks for and authorizes it.

One token works in every server that added the bot. Run your bot wherever you like: it connects to Hoffle the same way a Discord bot connects to Discord.

- **Public bot:** on, anyone with the link can add it. Off, only you can.
- **Privileged intents:** Message Content, Server Members and Presence are off until you switch them on. A bot that asks for one anyway is disconnected with close code 4014, as on Discord.

### What a bot added this way can do

Exactly what the server granted it, and nothing else:

- It only reaches servers that added it, and its global commands only appear there.
- Every API call is checked against what it was granted. Anything not on the list is refused.
- It cannot see private channels unless it was granted Administrator.
- It cannot read message history without the Message Content intent.
- It cannot kick, ban or change the server's owner, even as Administrator.
- It cannot give anyone a role with more permissions than it holds.
- It has no access to direct messages.

The person adding a bot cannot grant it more than they hold themselves. Add the same link again to change what a bot was granted, and remove a bot in **Server Settings → Integrations**.

The `permissions` number in an invite link uses Hoffle's own bit numbers, so a number from a Discord calculator means something else. Use the one in the Developer Portal.

These bots use the Discord-compatible API (`/api/v10`), not the plain `/api/v1` API further down.

### Activities

A bot can offer its own voice room activity: a page of yours that opens inside Hoffle, in the room's Activities menu, in every server that added the bot.

```http
PUT    /hangout/api/v10/applications/{appId}/activities/{name}
DELETE /hangout/api/v10/applications/{appId}/activities/{name}
GET    /hangout/api/v10/applications/{appId}/activities
```

```json
{ "title": "Quiz Night", "description": "Everyone plays", "icon": "🧠", "url": "https://bot.example/quiz" }
```

- `name`: 1-32 of `a-z 0-9 _ -`. Up to 10 activities per bot.
- `url`: must be `https`. Your page has to allow being framed.

Each person who opens it arrives with `?hoffle_ticket=…` on your URL. Trade it, from your server and with your bot token, to learn who they are:

```http
GET /hangout/api/v10/applications/{appId}/activity-tickets/{ticket}
```

```json
{ "user": { "id": "…", "username": "…", "global_name": "…" }, "channel_id": "…", "guild_id": "…" }
```

A ticket works once, for five minutes, and only for your bot. Don't trust anything else in the URL.

### The room player

Switch on **Room player** in the Developer Portal and your bot can play audio in voice rooms through Hoffle's player: the queue, controls, full-screen view and player widgets all show it, and each listener's browser plays the audio. The server has to grant your bot **Connect** and **Speak**.

```http
POST /hangout/api/bot/player
Authorization: Bearer <your bot token>
```

```json
{ "channelId": "<voice room>", "startNow": true, "tracks": [
  { "title": "Song", "artist": "Band", "duration": 180, "audioUrl": "https://bot.example/song.mp3", "thumbnail": "https://bot.example/cover.jpg" }
] }
```

- `audioUrl` must be `https`, and your server has to allow browsers to stream it.
- Send `{ "channelId": "…", "action": { "name": "pause" } }` for `pause`, `resume`, `toggle`, `skip`, `stop`, `seek`, `volume`, `loop`, `shuffle` or `clear`.
- `GET /hangout/api/bot/player?channelId=…` reads what is playing.
- Members' pause, skip and the like work whichever bot is playing. Register your own commands for anything else: `/play` belongs to the music bot only where the music bot is.

Lyrics, search, playlists and the DJ booth are the music bot's. Build your own with widgets and activities.

## Managing bots in a server

Server administrators manage bots in **Server Settings → Integrations**:

- **D&D Companion** and **Discord Bridge** are added with one click there.
- Every other bot is added with its invite link.
- Active bots can be turned off or removed at any time.

The music bot, with **Watch Together** and **Reels Together**, is added with its invite link like any other bot. Until a server adds it, `/play` and the other music commands aren't there.

## Running real Discord bots

Hoffle implements Discord's v10 gateway and REST API, so bots written with **discord.js**, **discord.py** and other standard libraries run against it. A bot needs no code changes beyond pointing it at your server.

### Point a bot at Hoffle

**discord.js** — set the REST base URL; the gateway URL is discovered from it automatically:

```javascript
import { Client, GatewayIntentBits } from "discord.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  rest: { api: "http://localhost:8730/hangout/api" },
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;
  if (message.content === "!ping") message.reply("Pong!");
});

client.login("hfl_bot_your_token_here");
```

**discord.py** — the gateway host is a separate constant from the REST base, so override both:

```python
import discord, yarl

discord.http.Route.BASE = "http://localhost:8730/hangout/api/v10"
discord.gateway.DiscordWebSocket.DEFAULT_GATEWAY = yarl.URL(
    "ws://localhost:8730/hangout/api/gateway"
)

intents = discord.Intents.default()
intents.message_content = True

class Bot(discord.Client):
    async def on_message(self, message):
        if message.author.bot:
            return
        if message.content == "!ping":
            await message.channel.send("Pong!")

Bot(intents=intents).run("hfl_bot_your_token_here")
```

Use `wss://` and `https://` when your Hoffle is behind TLS. `GET /gateway/bot` answers with `wss://` whenever the request came in over https, including behind Cloudflare or a proxy that sets `X-Forwarded-Proto`, so discord.js finds the right gateway by itself. Tokens are the same ones used everywhere else: the global `BOT_TOKEN` (see `state/secrets.env`), or a per-server token from Server Settings -> Bots & Integrations.

Serve images through the CDN route by adding `cdn: "http://localhost:8730/hangout/api/cdn"` to the discord.js `rest` options.

### What works

- **Gateway v10**: HELLO, IDENTIFY, HEARTBEAT/ACK, RESUME with event replay, sequence numbers, intent gating, and Discord's fatal close codes. `zlib-stream` transport compression is supported, which discord.py requires.
- **Snowflake ids**: every guild, channel, message, user and role gets a real 64-bit snowflake that sorts by creation time, so `createdTimestamp` and id-based pagination behave.
- **Events**: `READY`, `GUILD_CREATE` (with channels, roles, members and presences inline), `MESSAGE_CREATE/UPDATE/DELETE`, `MESSAGE_DELETE_BULK`, `MESSAGE_REACTION_ADD/REMOVE`, `TYPING_START`, `GUILD_MEMBER_REMOVE`, `GUILD_BAN_ADD`, `GUILD_MEMBERS_CHUNK`, `INTERACTION_CREATE`.
- **REST**: users, guilds, channels, messages (history with `before`/`after`/`around`, embeds, replies, edits, bulk delete, pins), members, roles, role assignment, bans, emojis.
- **Slash commands**: bots register application commands the usual way (`PUT /applications/{id}/commands`, or a library's `tree.sync()`). Registered commands appear in Hoffle's own slash menu, and running one dispatches `INTERACTION_CREATE`. Replies, deferred replies, follow-ups and ephemeral responses all work.
  - Arguments are typed: subcommands are the first word (`/initiative join 3`), options go in order or by name (`/create name:Thorin class_name:fighter`), and choices match their label, their value or a unique prefix. Missing or invalid arguments are reported to the person typing instead of reaching the bot.
  - A bot command with the same name as one of Hoffle's D&D link-out stubs (`/character`, `/levelup`, `/gmview`...) replaces the stub.
- **Embeds and components**: embeds render as cards (fields, colours, thumbnails, images, footers). Buttons, link buttons and string selects work: a press becomes a `MESSAGE_COMPONENT` interaction carrying the message, so discord.py Views and discord.js collectors route it. `UpdateMessage` and deferred-update responses edit that message in place, for everyone or, on an ephemeral message, for the one person who can see it. Only the bot that sent a message receives presses on it.
- **Ephemeral**: `defer(ephemeral=True)` followed by a follow-up, and `followup.send(ephemeral=True)`, stay private.
- **The MESSAGE_CONTENT intent** behaves as on Discord: without it, message events arrive with the content blanked rather than not at all.
- **Threads**: `POST /channels/{id}/threads` and `/channels/{id}/messages/{mid}/threads`, thread members, active and archived lists. Every Hoffle thread is public.
- **Reactions**: bots react as themselves (`PUT /channels/{id}/messages/{mid}/reactions/{emoji}/@me`) and remove their own; the reaction shows under the bot's name. Server emoji are written `name:id` as on Discord. `GET .../reactions/{emoji}` lists who reacted.
- **Files**: messages, edits and webhooks take Discord's multipart form (`payload_json` plus `files[n]`), up to 10 files of 40 MB each. Libraries' `files=` / `files:` options just work.
- **Webhooks**: `POST/GET /channels/{id}/webhooks`, `GET /guilds/{id}/webhooks`, `GET/PATCH/DELETE /webhooks/{id}`, and the token routes (`POST /webhooks/{id}/{token}` with `wait`, `thread_id`, `username`, `avatar_url` and files; `GET/PATCH/DELETE /webhooks/{id}/{token}/messages/{mid}`). Webhooks a bot makes don't count toward the 15 people can make in Server Settings.
- **Typing**: `POST /channels/{id}/typing` shows the bot typing, and `TYPING_START` reaches bots when people type (at most once every 8 seconds per person and channel).
- **Edits** are limited to the bot's own messages, as on Discord (`50005 Cannot edit a message authored by another user`).

### What does not work

- **Voice** (use [the room player](#the-room-player) instead). Discord's voice gateway needs raw UDP with Opus and xsalsa20 encryption, and Cloudflare Workers cannot open UDP sockets. Music bots and anything else that joins a voice channel will not connect. Use Hoffle's own music bot instead, which plays into Hoffle voice rooms directly.
- **Modals**, **autocomplete suggestions**, **user/channel/role/attachment options**, **scheduled events**, **stage instances**, and **editing per-channel permission overwrites** through the API: Hoffle has no equivalent surface yet, so these return empty or an explicit error rather than pretending.
- **Sharding** beyond a single shard, which a self-hosted instance never needs.
- **RESUME after the gateway hibernates.** The replay buffer is in memory, so a resume against an evicted object answers `INVALID_SESSION`; clients handle this by re-identifying.

### Hoffle extensions

Fields Discord does not have, added where a bot benefits. Libraries ignore them.

- `author.hoffle_avatar_url` (a picture URL, absolute or under your base path) and `author.hoffle_avatar` (the emoji avatar) on users.
- `message.hoffle`: `{ kind, audio_url, link, bridge }` — a voice message's audio, a Hoffle link card, and `bridge.url` for a message the Discord bridge carried over.
- `thread.hoffle_anchor_message_id`: the message a thread was started from.
- `MESSAGE_REACTION_*` events carry `hoffle_reactor` when the reactor is a bot (`bot:<id>`) or someone the Discord bridge reacts for (`ext:discord:<id>`).

### Rate limits

Hoffle does not rate limit bots. The standard `x-ratelimit-*` headers are returned on every response so libraries pace themselves normally, but the bucket never runs out.

## Widgets

A bot can also give members a **widget**: a small card it keeps up to date, which anyone in the server can pin to their channel list, member list or header (Settings → Appearance → Layout → *Customize layout & widgets…*). A music bot's now-playing card with play/pause/skip, a poll, a server status light, a match score.

A widget is shaped like a message, so you build it with what your library already has: `content`, `embeds` and `components` (buttons, link buttons, string selects). Pressing a button reaches your bot as an ordinary `MESSAGE_COMPONENT` interaction, and answering it with *update message* (`interaction.response.edit_message(...)` in discord.py, `interaction.update(...)` in discord.js) changes the widget for everyone. Deferred updates followed by an edit of `@original` work too.

### Publishing a widget

```http
PUT    /hangout/api/v10/applications/{appId}/guilds/{guildId}/widgets/{name}
PATCH  /hangout/api/v10/applications/{appId}/guilds/{guildId}/widgets/{name}
DELETE /hangout/api/v10/applications/{appId}/guilds/{guildId}/widgets/{name}
GET    /hangout/api/v10/applications/{appId}/guilds/{guildId}/widgets
```

A bot made for one server (a token from Server Settings → Bots & Integrations) can leave out `guilds/{guildId}`.

```json
{
  "title": "Now playing",
  "sizes": ["small", "medium", "large"],
  "webview_url": "https://bot.example.com/dashboard",
  "embeds": [{ "title": "Song name", "description": "Artist", "thumbnail": { "url": "https://…/cover.jpg" } }],
  "components": [{ "type": 1, "components": [
    { "type": 2, "style": 1, "custom_id": "toggle", "emoji": { "name": "⏯" }, "label": "Play/pause" },
    { "type": 2, "style": 2, "custom_id": "skip", "emoji": { "name": "⏭" }, "label": "Skip" }
  ] }]
}
```

- `name`: 1–32 of `a-z 0-9 _ -`. Up to 10 widgets per bot per server.
- `title`: shown above the widget and in the Customize tray.
- `sizes`: which of `small`, `medium`, `large` it supports (default: all three). **Small** is one line: the embed's thumbnail and title and the first row's buttons (shown by their emoji, so give them one). **Medium** is the embed's title, description and thumbnail with one row of buttons. **Large** is everything: fields, image, footer, every row. The header only takes small widgets; the channel list's top takes small and medium.
- `webview_url`: an `https://` page shown inside Hoffle when someone presses the widget's 🌐 button (your dashboard, settings, a bigger view). Pages that forbid framing can still be opened in a new tab from there.
- `channel_id` (body or query): keeps a separate copy of the widget for one room. Members see the copy for the voice room they are in (or the channel they have open), else the server-wide one. A room's copy starts from the server-wide one, so set `title`/`sizes` once and then send each room only its content.

`PUT` replaces the message (fields you leave out are cleared, as a new message would be); `PATCH` changes only what it names. `DELETE` without `channel_id` removes every copy.

### discord.py example

```python
import aiohttp, discord

API = "http://localhost:8730/hangout/api/v10"

class Poll(discord.ui.View):
    def __init__(self):
        super().__init__(timeout=None)          # widget buttons never expire
        self.votes = {"tea": 0, "coffee": 0}

    def embed(self):
        return discord.Embed(title="Tea or coffee?", description=" · ".join(f"{k}: {v}" for k, v in self.votes.items()))

    @discord.ui.button(label="Tea", emoji="🍵", custom_id="tea")
    async def tea(self, interaction, button):
        self.votes["tea"] += 1
        await interaction.response.edit_message(embed=self.embed(), view=self)

    @discord.ui.button(label="Coffee", emoji="☕", custom_id="coffee")
    async def coffee(self, interaction, button):
        self.votes["coffee"] += 1
        await interaction.response.edit_message(embed=self.embed(), view=self)

class Bot(discord.Client):
    async def setup_hook(self):
        self.poll = Poll()
        self.add_view(self.poll)                # routes presses by custom_id

    async def on_ready(self):
        body = {"title": "Morning poll", "embeds": [self.poll.embed().to_dict()],
                "components": self.poll.to_components()}
        async with aiohttp.ClientSession(headers={"Authorization": f"Bot {TOKEN}"}) as http:
            for guild in self.guilds:
                await http.put(f"{API}/applications/{self.application_id}/guilds/{guild.id}/widgets/poll", json=body)
```

### discord.js example

```javascript
client.once("ready", async () => {
  for (const guild of client.guilds.cache.values()) {
    await client.rest.put(`/applications/${client.application.id}/guilds/${guild.id}/widgets/status`, {
      body: {
        title: "Server status",
        sizes: ["small", "medium"],
        embeds: [{ title: "🟢 Online", description: "12 players" }],
        components: [{ type: 1, components: [{ type: 2, style: 2, custom_id: "refresh", emoji: { name: "🔄" }, label: "Refresh" }] }],
      },
    });
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isButton() && interaction.customId === "refresh") {
    await interaction.update({ embeds: [{ title: "🟢 Online", description: `${await countPlayers()} players` }] });
  }
});
```

The interaction carries the `guild_id`, the `channel_id` the member is looking at (or the widget's room), the `member`, and a `message` standing in for the widget, whose `id` is stable per widget.

### The built-in Music widget

Hoffle's own music player has a widget too: what your voice room hears, play/pause, skip, a box to play a song next (the same as `/playnext`), the queue (large size) and the Music + Watch dashboard in a web view. It is in the Customize tray of every server that added the music bot.

## Hoffle's own bot API

Alongside the Discord-compatible surface, Hoffle keeps a simpler REST API at `/api/v1` for scripts that just want to post a message. You can build bots using standard HTTP clients without a Discord library.

### Authentication

Bots authenticate using an Authorization header:

```http
Authorization: Bot <BOT_TOKEN>
```

Or:

```http
Authorization: Bearer <BOT_TOKEN>
```

Tokens can be either the global `BOT_TOKEN` (generated into `state/secrets.env` on first start, or set in `.env`) or a server-specific bot token generated under Server Settings -> Bots & Integrations.

### REST Endpoints

#### Get Current Bot Profile
```http
GET /hangout/api/v1/users/@me
```
Returns:
```json
{
  "id": "bot-id",
  "username": "My Bot",
  "discriminator": "0000",
  "avatar": "B",
  "bot": true,
  "server_id": "optional-server-id"
}
```

#### List Accessible Guilds (Servers)
```http
GET /hangout/api/v1/guilds
```

#### List Channels in a Guild
```http
GET /hangout/api/v1/guilds/{guildId}/channels
```

#### Fetch Channel Messages
```http
GET /hangout/api/v1/channels/{channelId}/messages?limit=50&before={messageId}
```

#### Send a Message to a Channel
```http
POST /hangout/api/v1/channels/{channelId}/messages
Content-Type: application/json

{
  "content": "Hello world from my bot!",
  "username": "Custom Bot Name",
  "avatar_url": "https://example.com/avatar.png",
  "embeds": [
    {
      "title": "Alert Title",
      "description": "Details about the event",
      "fields": [
        { "name": "Status", "value": "Operational" }
      ]
    }
  ]
}
```

#### Delete a Message
```http
DELETE /hangout/api/v1/channels/{channelId}/messages/{messageId}
```

### Real-Time Event Streaming

#### Server-Sent Events (SSE) Stream
Bots can receive live events over HTTP without configuring WebSockets:

```http
GET /hangout/api/v1/gateway/events?token=<BOT_TOKEN>
```

Events emitted:
- `READY`: Initial connection handshake with bot profile and server access.
- `MESSAGE_CREATE`: Dispatched whenever a user or bot sends a message in a channel.
- `MESSAGE_DELETE`: Dispatched when a message is deleted.

#### WebSocket Realtime Gateway
Bots can also connect directly to the WebSocket gateway at:
```
ws://localhost:8730/hangout/api/realtime
```
With header `Authorization: Bot <BOT_TOKEN>`.

### Bot Code Examples

#### Python Example

```python
import json
import urllib.request

TOKEN = "hfl_bot_your_token_here"
BASE_URL = "http://localhost:8730/hangout/api/v1"
CHANNEL_ID = "general"

def send_message(channel_id, content):
    url = f"{BASE_URL}/channels/{channel_id}/messages"
    payload = json.dumps({"content": content}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Authorization": f"Bot {TOKEN}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode("utf-8"))

send_message(CHANNEL_ID, "Greetings from Python!")
```

#### Node.js Example

```javascript
const TOKEN = "hfl_bot_your_token_here";
const BASE_URL = "http://localhost:8730/hangout/api/v1";

async function sendMessage(channelId, content) {
  const res = await fetch(`${BASE_URL}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Bot ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
  return res.json();
}

sendMessage("general", "Greetings from Node.js!");
```

## Discord bridge

Mirrors channels with a Discord server both ways: each person keeps their name and picture, and edits, deletes, replies, reactions, files, threads and typing follow. Each server sets it up on its own in **Server Settings → Integrations → Discord Bridge**; the instance runs one bridge service for all of them. See [Discord bridge](self-hosting.md#discord-bridge) for running it.
