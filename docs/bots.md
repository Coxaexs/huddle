# Bots

Hoffle has three kinds of bots:

- **Built-in bots** (music, D&D companion) that you switch on per server. See [Managing bots in a server](#managing-bots-in-a-server).
- **Unmodified Discord bots** written with discord.js, discord.py and similar libraries. See [Running real Discord bots](#running-real-discord-bots).
- **Simple scripts** that post messages over plain HTTP. See [Hoffle's own bot API](#hoffles-own-bot-api).

The examples use `http://localhost:8730`. Replace it with your server's address, and use `https://` / `wss://` if it is behind HTTPS.

## Managing bots in a server

Server administrators can manage bots directly from the Hoffle web interface:

1. Open Server Settings (click the server name header -> Server Settings).
2. Navigate to "Bots & Integrations".
3. Add built-in bots with one click:
   - Hoffle Music Bot: Synchronized voice audio, queue, and playback control.
   - D&D Companion: 5e spell, monster, and item compendium lookups and cryptographic dice rolls.
   - Discord Bridge: Live channel bridging between Hoffle and Discord.
4. Or click "Create Bot Integration" to generate a dedicated bot token for custom scripts.
5. Active bots can be enabled, disabled, or removed at any time.

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

Use `wss://` and `https://` when your Hoffle is behind TLS. Tokens are the same ones used everywhere else: the global `BOT_TOKEN` (see `state/secrets.env`), or a per-server token from Server Settings -> Bots & Integrations.

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

### What does not work

- **Voice.** Discord's voice gateway needs raw UDP with Opus and xsalsa20 encryption, and Cloudflare Workers cannot open UDP sockets. Music bots and anything else that joins a voice channel will not connect. Use Hoffle's own music bot instead, which plays into Hoffle voice rooms directly.
- **Bots adding reactions.** Reactions belong to an account in Hoffle's schema and a bot has none. Bots can read reactions and receive reaction events, but `PUT /reactions/.../@me` returns 403.
- **Modals**, **autocomplete suggestions**, **user/channel/role/attachment options**, **threads**, **webhooks**, **scheduled events**, **stage instances**, and **per-channel permission overwrites**: Hoffle has no equivalent surface, so these return empty or an explicit error rather than pretending.
- **Sharding** beyond a single shard, which a self-hosted instance never needs.
- **RESUME after the gateway hibernates.** The replay buffer is in memory, so a resume against an evicted object answers `INVALID_SESSION`; clients handle this by re-identifying.

### Rate limits

Hoffle does not rate limit bots. The standard `x-ratelimit-*` headers are returned on every response so libraries pace themselves normally, but the bucket never runs out.

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

To mirror messages between a Discord server and Hoffle, see [Discord bridge](self-hosting.md#discord-bridge) in the self-hosting guide.
