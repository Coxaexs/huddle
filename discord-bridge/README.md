# Hoffle <-> Discord Bidirectional Bridge

A standalone Node.js service (`discord.js`) that mirrors messages, attachments, and embeds in real time between Discord channels and Hoffle channels.

---

## How It Works

- **Discord -> Hoffle**: Listens to `MessageCreate` events on Discord and posts them to the mapped Hoffle channel via the Hoffle Bot API, preserving author display names, avatars, attachments, and embeds.
- **Hoffle -> Discord**: Connects to the Hoffle bot event stream and forwards new messages into the corresponding Discord channel.
- **Loop Prevention**: Ignores bot echoes and messages originating from the bridge itself.

---

## Configuration

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

| Variable | Description |
| :--- | :--- |
| `DISCORD_BOT_TOKEN` | Token of your Discord bot (from the Discord Developer Portal, with **Message Content Intent** enabled). |
| `HUDDLE_URL` | Base URL of your Hoffle instance (default: `http://127.0.0.1:8730`). |
| `HUDDLE_BASE_PATH` | Base path of Hoffle (default: `/hangout`). |
| `HUDDLE_BOT_TOKEN` | Hoffle bot token (`hfl_bot_...` or `BOT_TOKEN` from `state/secrets.env`). |
| `HUDDLE_DEFAULT_CHANNEL` | Fallback Hoffle channel slug or ID (default: `general`). |
| `DISCORD_TO_HUDDLE_MAP` | Comma-separated pairs of `discordChannelId:hoffleChannelId` (e.g. `1234567890:general,0987654321:memes`). |

---

## Running

### With Docker Compose (Recommended)

From the repository root:

```bash
docker compose --profile bridge up -d
```

### Standalone with Node.js

```bash
cd discord-bridge
npm install
npm start
```
