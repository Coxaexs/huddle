# Self-hosting guide

This guide takes you from nothing to a running Hoffle that your friends can join. No previous self-hosting experience is assumed. If you already know Docker, the [quick start in the README](../README.md#quick-start) is all you need.

- [What you need](#what-you-need)
- [1. Install Docker](#1-install-docker)
- [2. Download Hoffle](#2-download-hoffle)
- [3. Start it](#3-start-it)
- [4. Create your account](#4-create-your-account)
- [5. Invite your friends](#5-invite-your-friends)
- [Putting Hoffle on the internet (HTTPS)](#putting-hoffle-on-the-internet-https)
- [Changing settings](#changing-settings)
- [Updating](#updating)
- [Backups](#backups)
- [Admin commands](#admin-commands)
- [Voice: when calls do not connect](#voice-when-calls-do-not-connect)
- [Optional extras](#optional-extras)
- [Single-container install (Unraid, TrueNAS, Synology)](#single-container-install-unraid-truenas-synology)
- [Troubleshooting](#troubleshooting)
- [Uninstalling](#uninstalling)

## What you need

- A computer that stays on: a home server, an old laptop, a Raspberry Pi 4/5 (64-bit OS), or a cheap VPS. 2 GB of RAM is comfortable, 1 GB works.
- About 3 GB of free disk space for the images, plus room for uploads.
- Linux, macOS or Windows. Linux is the most common choice for a server.

## 1. Install Docker

Hoffle runs in Docker, so you install nothing else by hand.

- **Linux**: run the official install script, then log out and back in so you can use `docker` without `sudo`:

  ```bash
  curl -fsSL https://get.docker.com | sh
  ```

  ```bash
  sudo usermod -aG docker $USER
  ```

- **macOS / Windows**: install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and start it.

Check that it works. Both commands should print a version:

```bash
docker --version
```

```bash
docker compose version
```

If `docker compose` says "not a docker command", you have an old Docker. Update it with the step above.

## 2. Download Hoffle

```bash
git clone https://github.com/Coxaexs/huddle.git hoffle
```

```bash
cd hoffle
```

No `git`? Download the ZIP from the GitHub page (green **Code** button → **Download ZIP**), unzip it, and open a terminal in that folder.

## 3. Start it

```bash
docker compose up -d
```

The first start builds Hoffle on your machine, which takes 3 to 10 minutes depending on the computer. Later starts take seconds.

When it finishes, look at the log:

```bash
docker compose logs hoffle
```

You will see a box like this:

```
  ================================================================
   Hoffle is starting. Open it in your browser:

     http://localhost:8730
     (or http://<this-machine's-ip>:8730 from another device)

   Create the first account (it becomes the owner). When it asks
   for a setup code, enter:

     7KQ2MXP4HD
  ================================================================
```

The setup code is random and stops anyone else from claiming your server before you do. It only matters for the very first account.

## 4. Create your account

Open the address from the log in your browser. If Hoffle runs on another computer, use that computer's IP address. Find it with `hostname -I` on Linux, or in your router's device list.

Choose **Claim this Hoffle**, pick a username and password, and enter the setup code. That account is the owner and admin.

Lost the code? Print it again:

```bash
docker exec hoffle cat /app/state/secrets.env
```

## 5. Invite your friends

Open **Server Settings → Invite People → Create Invite Code** and send the code to your friends. Everyone after the first account needs an invite code to sign up.

Friends on the same Wi-Fi can use `http://<your-ip>:8730` straight away. For friends elsewhere, read the next section.

> **Voice and video need HTTPS.** Browsers only allow microphone and camera access on `https://` pages (and on `localhost`). Over plain `http://<ip>:8730`, chat works but voice does not. Set up HTTPS as described below before you invite friends for voice.

## Putting Hoffle on the internet (HTTPS)

You need three things:

1. **A domain name** pointing at your server's public IP, for example `chat.example.com`. A free one from [DuckDNS](https://www.duckdns.org) works fine.
2. **Ports 80 and 443 forwarded** on your router to the Hoffle machine. A VPS already has them open.
3. **A reverse proxy** that gets a free HTTPS certificate and forwards traffic to Hoffle.

The easiest reverse proxy is [Caddy](https://caddyserver.com/docs/install). It gets and renews certificates by itself. After installing it, put this in `/etc/caddy/Caddyfile` (replace the domain):

```
chat.example.com {
    reverse_proxy localhost:8730
}
```

Then reload Caddy:

```bash
sudo systemctl reload caddy
```

Open `https://chat.example.com` and you are done. WebSockets (live chat and voice signalling) work through Caddy with no extra configuration.

If you already use nginx, start from [`deploy/nginx.example.conf`](../deploy/nginx.example.conf). Remember the WebSocket upgrade headers for `/api/realtime` and set `client_max_body_size` high enough for uploads. Nginx Proxy Manager, Traefik and Cloudflare Tunnel also work. Point them at port 8730 and enable WebSocket support.

> **Can't forward ports?** (For example because your ISP uses CGNAT.) Use [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) or [Tailscale Funnel](https://tailscale.com/kb/1223/funnel). Both give you an HTTPS address without opening ports.

## Changing settings

Hoffle works without any configuration. To change something:

```bash
cp .env.example .env
```

Edit `.env` in any text editor. Every option is explained in the file, and there is a full list in [configuration.md](configuration.md). Then apply it:

```bash
docker compose up -d
```

Common changes:

| I want to…                             | Set in `.env`                                        |
| -------------------------------------- | ---------------------------------------------------- |
| Use a different port than 8730         | `HOFFLE_PORT=8080`                                   |
| Search GIFs in the message box         | `KLIPY_API_KEY=...`                                  |
| Get notifications with the tab closed  | `VAPID_*` keys (see [configuration](configuration.md#push-notifications)) |
| Fix voice for friends on strict networks | `HUDDLE_ICE_SERVERS` (see [Voice](#voice-when-calls-do-not-connect)) |

## Updating

```bash
git pull
```

```bash
docker compose up -d --build
```

Your messages, accounts and uploads live in the `state/` folder and are kept across updates. Take a [backup](#backups) before big updates, just in case.

## Backups

Everything Hoffle stores is in the `state/` folder next to `docker-compose.yml`: the database, uploaded files and the generated secrets. Back up that folder and you have backed up Hoffle.

The simplest safe backup stops Hoffle for a few seconds:

```bash
docker compose stop hoffle
```

```bash
sudo tar czf hoffle-backup-$(date +%F).tar.gz state
```

```bash
docker compose start hoffle
```

(`sudo` is needed on Linux because the container creates the files as root.)

To restore, stop Hoffle, replace `state/` with the folder from the archive, and start it again.

To snapshot just the database while Hoffle keeps running:

```bash
docker compose exec hoffle npm run admin -- backup /app/state/hoffle-db-backup.sqlite
```

The file appears at `state/hoffle-db-backup.sqlite`. It does not include uploaded files.

## Admin commands

Run these from the Hoffle folder:

```bash
docker compose exec hoffle npm run admin -- list-users
```

```bash
docker compose exec hoffle npm run admin -- reset-password <username> <new-password>
```

```bash
docker compose exec hoffle npm run admin -- promote <username>
```

```bash
docker compose exec hoffle npm run admin -- create-invite [max_uses] [expiry_hours]
```

`reset-password` also signs that user out everywhere. `create-invite` is handy if you locked yourself out of the web UI.

## Voice: when calls do not connect

By default, voice and video go directly between browsers (peer-to-peer). Your server's upload speed does not matter and nothing extra is needed. This works for most home networks.

It fails when someone is behind a very strict network: some mobile carriers, university or office Wi-Fi, or carrier-grade NAT. The symptom is that they can see people in the voice room but hear nothing. The fix is a **TURN relay**, which Hoffle ships with:

1. Edit `deploy/coturn/turnserver.conf` and change the password on the `user=hoffle:...` line.
2. Forward port `3478` (TCP and UDP) and ports `49152-49200` (UDP) on your router to the Hoffle machine.
3. Add this to `.env`, with your domain or public IP and the password you chose:

   ```
   HUDDLE_ICE_SERVERS=[{"urls":["turn:chat.example.com:3478?transport=udp","turn:chat.example.com:3478?transport=tcp"],"username":"hoffle","credential":"YOUR_PASSWORD"},{"urls":["stun:stun.cloudflare.com:3478"]}]
   ```

4. Start it:

   ```bash
   docker compose --profile turn up -d
   ```

### Big voice rooms: LiveKit

Peer-to-peer voice gets heavy past about 6 to 8 people with video, because everyone sends their stream to everyone else. [LiveKit](https://livekit.io) is a media server that fixes this. Each person sends once, and the server forwards the stream.

1. Make a key and secret:

   ```bash
   openssl rand -hex 32
   ```

2. In `livekit.yaml`, replace the line under `keys:` with `hoffle: <that secret>`.
3. LiveKit needs its own HTTPS address. Point a subdomain such as `livekit.example.com` at your server, and proxy it to port 7880 (in Caddy: `livekit.example.com { reverse_proxy localhost:7880 }`).
4. Forward ports `7881` (TCP) and `7882` (UDP) to the Hoffle machine.
5. Add to `.env`:

   ```
   LIVEKIT_URL=wss://livekit.example.com
   LIVEKIT_API_KEY=hoffle
   LIVEKIT_API_SECRET=<that secret>
   ```

6. Start it:

   ```bash
   docker compose --profile livekit up -d
   ```

If LiveKit is unreachable, Hoffle falls back to peer-to-peer on its own.

## Optional extras

Extras are grouped in *profiles*, so they only start when you ask for them. You can combine profiles:

```bash
docker compose --profile turn --profile livekit up -d
```

When you run `stop`, `down` or `logs` for an extra, pass the same `--profile` flags too.

### Built-in bots

The music bot and the D&D companion start automatically with `docker compose up -d`. Switch them on per server under **Server Settings → Bots & Integrations**. For writing your own bots, see [bots.md](bots.md).

### Discord bridge

Mirrors messages between Discord channels and Hoffle channels, both ways.

1. Create an application at the [Discord Developer Portal](https://discord.com/developers/applications). Add a bot and turn on **Message Content Intent**.
2. Invite that bot to your Discord server with permission to read and send messages.
3. In Hoffle, create a bot token under **Server Settings → Bots & Integrations → Create Bot Integration**.
4. Copy `discord-bridge/.env.example` to `discord-bridge/.env` and fill it in.
5. Start it:

   ```bash
   docker compose --profile bridge up -d
   ```

## Single-container install (Unraid, TrueNAS, Synology)

NAS systems often prefer one container over a compose file. `Dockerfile.all-in-one` bundles Hoffle and the music bot (without the D&D compendium):

```bash
docker build -f Dockerfile.all-in-one -t hoffle-all-in-one .
```

```bash
docker run -d --name hoffle --restart unless-stopped -p 8730:8730 -v "$(pwd)/state:/app/state" hoffle-all-in-one
```

On a NAS, map `/app/state` to a share of your choice and port `8730` to any free port. Settings from [configuration.md](configuration.md) can be passed as container environment variables. The setup code appears in the container log, as described above.

## Troubleshooting

**`docker compose logs hoffle` shows no setup code box.**
Someone has already created an account. If that was you, sign in. If you want to start completely fresh, see [Uninstalling](#uninstalling).

**The page does not load at `http://<ip>:8730`.**
- Check the container is running and healthy: `docker compose ps`. `health: starting` is normal for the first minute.
- A firewall may block the port. On Ubuntu: `sudo ufw allow 8730/tcp`.
- Something else may already use port 8730. Set `HOFFLE_PORT=8731` in `.env` and run `docker compose up -d`.

**"This Hoffle is waiting for its owner's setup code."**
The code is wrong or missing. Print it with `docker exec hoffle cat /app/state/secrets.env` (upper or lower case both work).

**Voice: I can see people but can't hear them, or the mic button does nothing.**
- The page must be on `https://` (see [HTTPS](#putting-hoffle-on-the-internet-https)). Browsers block microphones on plain `http://` except for `localhost`.
- Check the browser has microphone permission for the site.
- If it only fails for some friends, set up the [TURN relay](#voice-when-calls-do-not-connect).

**Music bot says it can't find songs.**
YouTube changes often. Rebuild the music bot to get the newest yt-dlp:

```bash
docker compose build --no-cache music-bot
```

```bash
docker compose up -d
```

**I changed `.env` but nothing happened.**
Run `docker compose up -d` again. Docker only applies new settings when it recreates the container.

**Build fails with "no space left on device".**
Free up Docker space with `docker system prune`, then try again.

**Still stuck?**
Collect the output of `docker compose ps` and `docker compose logs --tail 100 hoffle` and [open an issue](https://github.com/Coxaexs/huddle/issues).

## Uninstalling

Stop and remove the containers:

```bash
docker compose down
```

This keeps your data. To delete everything, including all messages and accounts, also remove the `state/` folder (`sudo rm -rf state`) and then the Hoffle folder itself.
