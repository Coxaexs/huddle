# Hoffle

Hoffle is an open-source, self-hosted real-time communication platform designed for friend groups and communities. It provides text channels, voice rooms with spatial audio, synchronized music playback, tabletop battlemaps, and a Discord-compatible bot platform that runs unmodified discord.js and discord.py bots.

## Architecture

Hoffle is built to run as a multi-service architecture:

- Hoffle Web and Worker: Next.js App Router and Cloudflare Worker runtime (running locally via Wrangler).
- Durable Object Hub: Manages presence, WebRTC signaling, voice coordination, and synchronized media playback.
- Local Storage: SQLite database (D1 emulation) and disk assets (R2 emulation) persisted in the `state/` directory.
- Music Bot Service: Dedicated container running Python, yt-dlp, and ffmpeg to resolve and stream music on port 8731.
- D&D 5e Bot Service: Dedicated container providing a 5e SRD compendium (spells, monsters, items, rules) on port 8732.
- Discord Bridge: Bidirectional bridge synchronizing messages between Discord channels and Hoffle channels.

## Quick Start with Docker Compose

The fastest way to deploy Hoffle and all companion bots is with Docker Compose.

### 1. Clone and Configure

```bash
git clone https://github.com/coxaexs/huddle.git hoffle
cd hoffle
cp .dev.vars.example .dev.vars
```

Edit `.dev.vars` to set your initial secret keys:

- `BOT_TOKEN`: Shared secret key used for bot authentication and server-to-server operations.
- `BOOTSTRAP_CODE`: Secret invite code required by the very first account registration.

### 2. Start the Stack

```bash
docker compose up -d
```

This starts:

- Hoffle Web App and Realtime Worker on port 8730 (`http://localhost:8730/hangout`)
- Hoffle Music Bot audio resolver on port 8731
- Hoffle D&D 5e compendium service on port 8732

To view logs:

```bash
docker compose logs -f
```

To stop:

```bash
docker compose down
```

## Running Real Discord Bots

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

Use `wss://` and `https://` when your Hoffle is behind TLS. Tokens are the same ones as the rest of this document: the global `BOT_TOKEN`, or a per-server token from Server Settings -> Bots & Integrations.

Serve images through the CDN route by adding `cdn: "http://localhost:8730/hangout/api/cdn"` to the discord.js `rest` options.

### What works

- **Gateway v10**: HELLO, IDENTIFY, HEARTBEAT/ACK, RESUME with event replay, sequence numbers, intent gating, and Discord's fatal close codes. `zlib-stream` transport compression is supported, which discord.py requires.
- **Snowflake ids**: every guild, channel, message, user and role gets a real 64-bit snowflake that sorts by creation time, so `createdTimestamp` and id-based pagination behave.
- **Events**: `READY`, `GUILD_CREATE` (with channels, roles, members and presences inline), `MESSAGE_CREATE/UPDATE/DELETE`, `MESSAGE_DELETE_BULK`, `MESSAGE_REACTION_ADD/REMOVE`, `TYPING_START`, `GUILD_MEMBER_REMOVE`, `GUILD_BAN_ADD`, `GUILD_MEMBERS_CHUNK`, `INTERACTION_CREATE`.
- **REST**: users, guilds, channels, messages (history with `before`/`after`/`around`, embeds, replies, edits, bulk delete, pins), members, roles, role assignment, bans, emojis.
- **Slash commands**: bots register application commands the usual way (`PUT /applications/{id}/commands`, or a library's `tree.sync()`). Registered commands appear in Hoffle's own slash menu, and running one dispatches `INTERACTION_CREATE`. Replies, deferred replies, follow-ups and ephemeral responses all work.
- **The MESSAGE_CONTENT intent** behaves as on Discord: without it, message events arrive with the content blanked rather than not at all.

### What does not work

- **Voice.** Discord's voice gateway needs raw UDP with Opus and xsalsa20 encryption, and Cloudflare Workers cannot open UDP sockets. Music bots and anything else that joins a voice channel will not connect. Use Hoffle's own music bot instead, which plays into Hoffle voice rooms directly.
- **Bots adding reactions.** Reactions belong to an account in Hoffle's schema and a bot has none. Bots can read reactions and receive reaction events, but `PUT /reactions/.../@me` returns 403.
- **Modals**, **autocomplete suggestions**, **threads**, **webhooks**, **scheduled events**, **stage instances**, and **per-channel permission overwrites**: Hoffle has no equivalent surface, so these return empty or an explicit error rather than pretending.
- **Sharding** beyond a single shard, which a self-hosted instance never needs.
- **RESUME after the gateway hibernates.** The replay buffer is in memory, so a resume against an evicted object answers `INVALID_SESSION`; clients handle this by re-identifying.

### Rate limits

Hoffle does not rate limit bots. The standard `x-ratelimit-*` headers are returned on every response so libraries pace themselves normally, but the bucket never runs out.

## Hoffle's Own Bot API

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

Tokens can be either the global `BOT_TOKEN` defined in `.dev.vars` or a server-specific bot token generated under Server Settings -> Bots & Integrations.

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

## Server Bot Management

Server administrators can manage bots directly from the Hoffle web interface:

1. Open Server Settings (click the server name header -> Server Settings).
2. Navigate to "Bots & Integrations".
3. Add built-in bots with one click:
   - Hoffle Music Bot: Synchronized voice audio, queue, and playback control.
   - D&D Companion: 5e spell, monster, and item compendium lookups and cryptographic dice rolls.
   - Discord Bridge: Live channel bridging between Hoffle and Discord.
4. Or click "Create Bot Integration" to generate a dedicated bot token for custom scripts.
5. Active bots can be enabled, disabled, or removed at any time.

## Bidirectional Discord Bridge

Hoffle includes a dedicated Discord bridge service that synchronizes messages bidirectionally between Discord and Hoffle.

### Features
- Discord to Hoffle: Forwards Discord chat, attachments, and link previews into mapped Hoffle channels.
- Hoffle to Discord: Listens to Hoffle's real-time event gateway and relays chat into mapped Discord channels.
- Loop Protection: Automatically filters bridged messages and bot echoes.

### Setup

1. Create a Discord application in the Discord Developer Portal (https://discord.com/developers/applications).
2. Create a Bot user and enable Message Content Intent under Privileged Gateway Intents.
3. Invite the bot to your Discord server with Read Messages and Send Messages permissions.
4. Copy `discord-bridge/.env` and fill in:
   - `DISCORD_BOT_TOKEN`: The Discord bot token.
   - `HUDDLE_BOT_TOKEN`: A Hoffle Bot Token.
   - `HUDDLE_URL`: URL to your Hoffle server (e.g. `http://127.0.0.1:8730` or `http://hoffle:8730` in Docker).
   - `DISCORD_TO_HUDDLE_MAP`: Channel mapping in format `discord_channel:hoffle_channel,discord_channel_2:hoffle_channel_2`.
5. Run the bridge via Docker:
   ```bash
   docker compose --profile bridge up -d
   ```
   Or run locally:
   ```bash
   cd discord-bridge
   npm install
   npm start
   ```

## Development and Testing

### Requirements
- Node.js 22
- Python 3.10+ (for music and D&D services)
- Docker and Docker Compose (recommended for full stack)

### Running Unit Tests

Hoffle includes automated vitest suites covering protocols, spatial audio, friends, invites, permissions, and bot authentication:

```bash
npm test
```

### Local Build

```bash
npm install
npm run build
npm run serve
```

## Admin & Disaster Recovery CLI

Hoffle provides an administrative CLI for server owners to manage users, reset passwords, create invites, and safely back up the database:

```bash
# List all registered users
npm run admin -- list-users

# Safely reset a user's password (invalidating all sessions)
npm run admin -- reset-password <username> <new_password>

# Promote a user to administrator
npm run admin -- promote <username>

# Generate a server invite code from the terminal
npm run admin -- create-invite [max_uses] [expiry_hours]

# Create a safe, point-in-time SQLite snapshot via VACUUM INTO
npm run admin -- backup [destination_path]
```

## Voice Architecture: LiveKit SFU & P2P Mesh

Hoffle features a hybrid voice architecture:
- **P2P WebRTC Mesh (Default)**: Zero media server bandwidth fees, fully encrypted peer-to-peer audio and video for close-knit groups without opening extra ports.
- **LiveKit SFU (Scalable)**: When `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` are configured, Hoffle automatically routes voice and screen sharing through the LiveKit Selective Forwarding Unit (SFU) for Discord-grade scale.

Start LiveKit alongside Hoffle:
```bash
docker compose up -d livekit
```

### STUN / TURN Relay (Coturn)

For users behind restrictive carrier-grade NATs (CGNAT) or strict corporate firewalls, launch the integrated Coturn relay:
```bash
docker compose --profile turn up -d
```

## All-In-One Single Container Deployment

If you prefer a single self-contained container without Docker Compose (e.g., Unraid, TrueNAS, Synology):

```bash
docker build -f Dockerfile.all-in-one -t hoffle-all-in-one .
docker run -d \
  -p 8730:8730 \
  -v $(pwd)/state:/app/state \
  --name hoffle \
  hoffle-all-in-one
```

## Configuration Reference

Variables configured in `.dev.vars`:

- `BOT_TOKEN`: Shared secret for system-level bot operations and API access.
- `BOOTSTRAP_CODE`: Required passphrase for creating the initial owner account.
- `BASE_PATH`: Mount path (default `/hangout`; set to `/` for root domain hosting).
- `LANDING_DOMAINS`: Comma-separated domains displaying the public landing page (others load chat).
- `LIVEKIT_URL`: WebSocket URL to LiveKit SFU (e.g., `wss://livekit.hoffle.online`).
- `LIVEKIT_API_KEY`: API key for LiveKit token authentication.
- `LIVEKIT_API_SECRET`: API secret for LiveKit token authentication.
- `VAPID_PUBLIC_KEY`: Web Push VAPID public key for offline browser notifications.
- `VAPID_PRIVATE_KEY`: Web Push VAPID private key.
- `VAPID_SUBJECT`: Mailto or contact URI for Web Push dispatch (e.g., `mailto:admin@example.com`).
- `MUSIC_HELPER_BASE_URL`: Address of the yt-dlp audio resolver service (default `http://127.0.0.1:8731`).
- `DND_BASE_URL`: Address of the D&D 5e compendium service (default `http://127.0.0.1:8732`).
- `HUDDLE_ICE_SERVERS`: JSON array of `RTCIceServer` objects for custom STUN/TURN server deployment.
- `TENOR_API_KEY`: Optional key for animated GIF search in the composer.
- `MUSICWATCH_PASSWORD`: Optional password for the external music dashboard.

## License

Hoffle is free and open-source software licensed under the **[GNU Affero General Public License v3.0 (GNU AGPLv3)](LICENSE)**.

Under this license:
- You are free to run, study, modify, and distribute Hoffle.
- If you run a modified version of Hoffle on a server and provide network services to users, you are required to make the complete corresponding source code of that modified version available to those users under the GNU AGPLv3.

See the [LICENSE](LICENSE) file for the full license terms and conditions.

## Third-Party Open Source Attributions

Hoffle is built with and grateful to the following open source projects and communities:
- **React** (MIT License) - Meta Platforms, Inc.
- **Three.js** (MIT License) - Ricardo Cabello (mrdoob) and Three.js authors
- **Lucide Icons** (ISC License) - Lucide Contributors
- **RNNoise** (Apache-2.0 License) - Jean-Marc Valin / Xiph.Org Foundation
- **pdf-lib** & **@pdf-lib/fontkit** (MIT & Apache-2.0 Licenses) - Andrew Dillon / Hopding
- **pdfjs-dist** (Apache-2.0 License) - Mozilla Foundation
- **@3d-dice/dice-box** (MIT License) - Frank S
- **yt-dlp** (The Unlicense) - yt-dlp contributors
- **ffmpeg** (LGPL / GPL) - FFmpeg team

