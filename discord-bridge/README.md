# Huddle Discord Bridge

A standalone Discord bot that forwards Discord messages into Huddle channels. **One-way only: Discord → Huddle** (Huddle messages are never sent back to Discord).

## How it works

The bot listens to messages in your Discord server and posts them into Huddle via the [`/api/bots/messages`](../app/api/bots/messages/route.ts) API endpoint. Each forwarded message shows the Discord author's name with "(Discord)" appended, plus a link back to the original Discord message.

## Setup

### 1. Create a Discord application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to **Bot** → **Privileged Gateway Intents** → enable **Message Content Intent**
4. Copy the bot token

### 2. Invite the bot to your server

Generate an invite URL with these permissions:
- **Read Messages / View Channels**
- **Read Message History**

Use the Discord Developer Portal's "OAuth2 → URL Generator" or construct it manually:
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_APP_ID&permissions=66560&scope=bot
```

### 3. Configure the bridge

```bash
cd discord-bridge
cp .env.example .env
```

Edit `.env`:
- `DISCORD_BOT_TOKEN` — your Discord bot token
- `HUDDLE_BOT_TOKEN` — the same `BOT_TOKEN` value from Huddle's `.dev.vars`
- `HUDDLE_URL` — where Huddle is running (default: `http://127.0.0.1:8730`)
- `DISCORD_TO_HUDDLE_MAP` — which Discord channels map to which Huddle channels

### 4. Install and run

```bash
npm install
npm start
```

## Channel mapping

The `DISCORD_TO_HUDDLE_MAP` env var controls which Discord channels forward to which Huddle channels. You can use Discord channel names or IDs:

```bash
# By name
DISCORD_TO_HUDDLE_MAP=general:general,memes:memes

# By Discord channel ID (right-click a channel → Copy ID)
DISCORD_TO_HUDDLE_MAP=123456789012345678:general,987654321098765432:memes

# Mixed
DISCORD_TO_HUDDLE_MAP=123456789012345678:general,memes:memes
```

If no map is configured, **all** messages from all Discord channels are forwarded to the Huddle channel specified by `HUDDLE_DEFAULT_CHANNEL` (default: `general`).

## Running as a service

### systemd

Create `/etc/systemd/system/huddle-discord-bridge.service`:

```ini
[Unit]
Description=Huddle Discord Bridge
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/coxaexs/huddle/discord-bridge
EnvironmentFile=/home/coxaexs/huddle/discord-bridge/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now huddle-discord-bridge
```

## What gets forwarded

- ✅ Text messages
- ✅ Attachment URLs (images, files — posted as links)
- ✅ Embed URLs (link previews, video embeds)
- ✅ The original Discord message link (clickable in Huddle)
- ❌ Bot messages (ignored to prevent loops)
- ❌ DM messages (only guild/server messages are forwarded)