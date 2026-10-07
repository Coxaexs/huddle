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
- [Music bot](#music-bot)
- [Single-container install (Unraid, TrueNAS, Synology)](#single-container-install-unraid-truenas-synology)
- [Troubleshooting](#troubleshooting)
- [Uninstalling](#uninstalling)

## What you need

- A computer that stays on: a home server, an old laptop, a Raspberry Pi 4/5 (64-bit OS), or a cheap VPS. 2 GB of RAM is comfortable, 1 GB works.
- About 3 GB of free disk space for the images, plus room for uploads.
- Linux, macOS or Windows. Linux is the most common choice for a server.
- About 15 minutes. Most of it is waiting for the first build.

Every command below goes in a terminal: **Terminal** on macOS and Linux, **PowerShell** on Windows. Type or paste one command at a time and wait for it to finish before the next.

## 1. Install Docker

Hoffle runs in Docker, so you install nothing else by hand.

- **Linux**: run the official install script, then log out and back in so you can use `docker` without `sudo`:

  ```bash
  curl -fsSL https://get.docker.com | sh
  ```

  ```bash
  sudo usermod -aG docker $USER
  ```

  Then log out and back in (or reboot). Until you do, every `docker` command fails with *permission denied while trying to connect to the Docker daemon socket*.

- **macOS / Windows**: install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and start it. Leave it running: when Docker Desktop is closed, Hoffle stops too. On Windows, also install [Git for Windows](https://git-scm.com/download/win) for the next step.

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

No `git`? Download the ZIP from the GitHub page (green **Code** button → **Download ZIP**), unzip it, and open a terminal in that folder. You won't be able to update with `git pull` later, so prefer `git` if you can.

Every command from here on is run inside this `hoffle` folder. If you open a new terminal later, `cd` into it first.

## 3. Start it

```bash
docker compose up -d
```

The first start builds Hoffle on your machine, which takes 3 to 10 minutes depending on the computer (longer on a Raspberry Pi). Later starts take seconds. It is finished when you get your prompt back and every line ends in *Started* or *Running*.

Check that it is up:

```bash
docker compose ps
```

The `hoffle` line should say `Up`. For the first minute it says `(health: starting)`; that is normal. Then look at the log:

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

If the page asks you to sign in instead of offering **Claim this Hoffle**, someone already created the first account. On a fresh install that was most likely you; see [Troubleshooting](#troubleshooting) to start over.

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

Before you start, check the domain really points at you. This should print your public IP (the one [ifconfig.me](https://ifconfig.me) shows):

```bash
nslookup chat.example.com
```

The easiest reverse proxy is [Caddy](https://caddyserver.com/docs/install). It gets and renews certificates by itself. Install it on the same machine as Hoffle, then replace everything in `/etc/caddy/Caddyfile` with this (use your own domain):

```
chat.example.com {
    reverse_proxy localhost:8730
}
```

If you also run the [music bot](#music-bot), use this instead, so its dashboard and Watch Together rooms open from the same address:

```
chat.example.com {
    handle_path /musicbot/* {
        reverse_proxy localhost:8722
    }
    handle /watch/* {
        reverse_proxy localhost:8722
    }
    reverse_proxy localhost:8730
}
```

Then reload Caddy:

```bash
sudo systemctl reload caddy
```

Open `https://chat.example.com` and you are done. WebSockets (live chat and voice signalling) work through Caddy with no extra configuration.

If the page does not load, `sudo journalctl -u caddy --since "10 minutes ago"` says why. Almost always it is one of: the domain does not point at this machine yet (DNS changes can take an hour), ports 80/443 are not forwarded, or a firewall blocks them (`sudo ufw allow 80,443/tcp` on Ubuntu).

If you already use nginx, start from [`deploy/nginx.example.conf`](../deploy/nginx.example.conf). Remember the WebSocket upgrade headers for `/api/realtime` and set `client_max_body_size` high enough for uploads. Nginx Proxy Manager, Traefik and Cloudflare Tunnel also work. Point them at port 8730 and enable WebSocket support.

> **Can't forward ports?** (For example because your ISP uses CGNAT.) Use [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) or [Tailscale Funnel](https://tailscale.com/kb/1223/funnel). Both give you an HTTPS address without opening ports.

## Changing settings

Hoffle works without any configuration. To change something:

```bash
cp .env.example .env
```

Edit `.env` in any text editor (`nano .env` on a server: save with Ctrl+O, Enter, quit with Ctrl+X). Remove the `#` in front of a line to use it. Every option is explained in the file, and there is a full list in [configuration.md](configuration.md). Then apply it:

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

If you use extras, pass the same `--profile` flags as when you started them, for example `docker compose --profile musicbot up -d --build`. Otherwise those containers keep running their old version.

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

### Full backups without stopping Hoffle

`scripts/backup.sh` snapshots everything (database, uploads and voice/hub state) while Hoffle keeps running. It copies each database with SQLite's own backup command, so the copy is never half-written. It needs `sqlite3` on the host (`sudo apt install sqlite3`).

```bash
sudo scripts/backup.sh state backups
```

This writes `backups/hoffle-<time>.tar.gz` and keeps the newest 14 (set `KEEP=30` to change that, or `KEEP=0` to keep them all). To run it every night, add it to root's crontab:

```bash
(sudo crontab -l 2>/dev/null; echo "0 4 * * * cd $PWD && scripts/backup.sh state backups") | sudo crontab -
```

To restore one, stop Hoffle first. The restore checks every database before touching anything, and moves the current `state/` aside instead of deleting it:

```bash
docker compose stop hoffle
```

```bash
sudo scripts/restore.sh backups/hoffle-<time>.tar.gz state
```

```bash
docker compose start hoffle
```

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

It fails when someone is behind a very strict network: some mobile carriers, university or office Wi-Fi, or carrier-grade NAT. They can see the room and hear the people they can reach directly, but not the ones they cannot — so the usual report is **"some of my friends can't hear each other, but I can hear all of them"**, or a one-to-one call that never connects. Those pairs are the ones that need a relay. The fix is a **TURN relay**, which Hoffle ships with:

1. Edit `deploy/coturn/turnserver.conf` and change the password on the `user=hoffle:...` line.
2. Set `external-ip` in that file to this machine's `<public ip>/<private ip>`:

   ```
   external-ip=203.0.113.10/192.168.1.198
   ```

   This is the address coturn hands to every peer as the relay candidate. Get
   it wrong — or leave a private address, or an address your ISP has since
   reassigned — and calls still negotiate and then carry no audio, which is
   invisible until someone on a strict network cannot hear anyone.
3. Forward these ports on your router to the Hoffle machine:

   | Port | Protocol | Why |
   | ---- | -------- | --- |
   | `3478` | TCP and UDP | the relay's control port |
   | `5349` | TCP | the same over TLS, for networks that only allow HTTPS-like traffic |
   | `49152-49200` | UDP | the relay's media ports, as `min-port`/`max-port` in the config |

   Forwards must be permanent rules, not UPnP leases: router firmware drops
   UPnP mappings on reboot, and the failure that follows looks exactly like a
   broken app.
4. Add this to `.env`, with your domain or public IP and the password you chose:

   ```
   HUDDLE_ICE_SERVERS=[{"urls":["turn:chat.example.com:3478?transport=udp","turn:chat.example.com:3478?transport=tcp"],"username":"hoffle","credential":"YOUR_PASSWORD"},{"urls":["stun:chat.example.com:3478"]}]
   ```

5. Start it:

   ```bash
   docker compose --profile turn up -d
   ```

6. Check it, from inside your network:

   ```bash
   docker compose exec hoffle sh -c 'npm run check:turn -- --ice-servers "$HUDDLE_ICE_SERVERS"'
   ```

   Every entry should say OK and print the same address it resolved the name to.
   The interesting failure is the one where it prints a relay address that is
   private, or a public address that is not the one it reached: that is
   `external-ip`, and no peer will ever connect through that relay.

   Ask a friend on a different network to run the same command if you want to
   be certain the ports really are open from outside; anything that passes from
   your own LAN but fails from theirs is a router or ISP problem, not Hoffle.

### The relay stops working after a while

Two things rot quietly on a home connection, and both produce "some people
cannot hear each other" rather than an error:

- **The public address changes.** Most ISPs hand out a new one eventually, and
  `external-ip` is a fixed line in a config file. Either move the relay to a
  host with a static address (a small VPS is plenty), or keep the line in sync
  with the script Hoffle ships for it:

  ```bash
  sudo install -m 755 deploy/coturn/sync-external-ip.sh /usr/local/sbin/
  sudo install -m 644 deploy/coturn/sync-external-ip.service deploy/coturn/sync-external-ip.timer /etc/systemd/system/
  sudo systemctl enable --now sync-external-ip.timer
  ```

  It resolves the name clients actually connect to, rewrites `external-ip`, and
  restarts coturn — but only when the address really changed, so a working relay
  is never interrupted for nothing. Check what it would do without touching
  anything:

  ```bash
  /usr/local/sbin/sync-external-ip.sh turn.example.com --dry-run
  ```

- **The port forwards disappear.** Many routers only keep UPnP or "temporary"
  forwards, and a firmware update can clear hand-written ones. Re-check with
  the check command above from outside the network.

### Big voice rooms: LiveKit

Peer-to-peer voice gets heavy past about 6 to 8 people with video, because everyone sends their stream to everyone else. [LiveKit](https://livekit.io) is a media server that fixes this. Each person sends once, and the server forwards the stream. chat.hoffle.online runs this way. With LiveKit, Hoffle also:

- sends screen shares in two sizes, so a viewer on a slow connection gets the small one without slowing down everyone else;
- skips encoding sizes nobody is watching;
- sends the mic with redundant packets, so a lost packet is rebuilt instead of heard as a gap.

Your server's **upload** speed becomes the limit: roughly 4 Mbps per viewer of a 1080p30 share and 2 Mbps per viewer at 720p. A home connection with 40 Mbps upload handles about ten 1080p viewers.

LiveKit starts with `docker compose up -d`, and Hoffle generates its key pair on first start (in `state/secrets.env`, mirrored into `state/livekit.yaml`). To switch browsers over to it:

1. LiveKit needs its own HTTPS address. Point a subdomain such as `livekit.example.com` at your server, and proxy it to port 7880 (in Caddy: `livekit.example.com { reverse_proxy localhost:7880 }`).
2. Forward ports `7881` (TCP) and `7882` (UDP) to the Hoffle machine.
3. Add to `.env`, then run `docker compose up -d`:

   ```
   LIVEKIT_URL=wss://livekit.example.com
   ```

   To use your own key pair instead of the generated one, also set `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.

4. Check it: `docker compose logs livekit` should show it starting without errors, and `https://livekit.example.com` should answer `OK` in the browser.

Until `LIVEKIT_URL` is set, voice stays peer-to-peer. If LiveKit is unreachable, Hoffle falls back to peer-to-peer on its own, so a mistake here never takes voice down.

LiveKit looks up your public IP once, when it starts. If your ISP gives you a new address, voice through LiveKit stops working until you restart it: `docker compose restart livekit`.

## Optional extras

Extras are grouped in *profiles*, so they only start when you ask for them. You can combine profiles:

```bash
docker compose --profile turn up -d
```

When you run `stop`, `down` or `logs` for an extra, pass the same `--profile` flags too.

### Built-in bots

The basic music player and the D&D companion start automatically with `docker compose up -d`. Switch them on per server under **Server Settings → Bots & Integrations**. For the full music bot, see [Music bot](#music-bot). For writing your own bots, see [bots.md](bots.md).

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

## Music bot

The full music bot is a separate open-source project, [musicwatchtogether](https://github.com/Coxaexs/musicwatchtogether). It is the bot chat.hoffle.online uses, and it adds to the basic player:

- a web dashboard for the queue, playlists and history
- a two-deck DJ booth (`/dj` in a voice room)
- synced lyrics
- Watch Together and Reels rooms
- optionally the same bot in your Discord server, with one shared queue

It runs as one more container. Docker builds it straight from its GitHub repository, so you download nothing extra.

1. Make sure Hoffle itself has started at least once (steps 1 to 3 above). The bot reads the passwords it needs from Hoffle's `state/secrets.env`, which Hoffle creates on its first start. You do not have to copy any passwords yourself.
2. Start it:

   ```bash
   docker compose --profile musicbot up -d
   ```

   The first build takes a few minutes.
3. Check it:

   ```bash
   docker compose --profile musicbot logs musicwatch
   ```

   You should see the dashboard start on port 8722 and *running for Hoffle only*. In Hoffle, the Music + Watch bot in the sidebar shows as online.
4. For the dashboard and Watch Together links to open in the browser, Hoffle has to be on HTTPS with the second Caddyfile from [Putting Hoffle on the internet](#putting-hoffle-on-the-internet-https), and `.env` needs your address:

   ```
   MUSICWATCH_PUBLIC_URL=https://chat.example.com
   ```

   Then run `docker compose --profile musicbot up -d` again. Music in voice rooms works without this step; only the links need it.

**Also in Discord (optional).** Create a bot at the [Discord Developer Portal](https://discord.com/developers/applications), invite it to your server with the *Connect* and *Speak* permissions, and add its token to `.env`:

```
DISCORD_TOKEN=your-discord-bot-token
```

Run `docker compose --profile musicbot up -d` again. For Spotify links, also set `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` from the [Spotify developer dashboard](https://developer.spotify.com/dashboard).

The bot keeps its playlists, settings and history in `state/musicwatch/`, so the normal [backups](#backups) cover it. To update it to the newest version of the bot:

```bash
docker compose --profile musicbot build --no-cache musicwatch
```

```bash
docker compose --profile musicbot up -d
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

**`permission denied while trying to connect to the Docker daemon socket`.**
You added yourself to the `docker` group but have not logged out and back in yet. Do that, or put `sudo` in front of the command for now.

**`exec /app/scripts/entrypoint.sh: no such file or directory` (Windows).**
Git converted the scripts to Windows line endings. Fix it from the `hoffle` folder, then rebuild:

```bash
git config core.autocrlf false
```

```bash
git rm --cached -r . -q
```

```bash
git reset --hard
```

```bash
docker compose up -d --build
```

**`Bind for 0.0.0.0:8730 failed: port is already allocated`.**
Something else uses port 8730. Set `HOFFLE_PORT=8731` in `.env` and run `docker compose up -d`.

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
YouTube changes often. Rebuild the music containers to get the newest yt-dlp (leave out `musicwatch` if you don't use the full music bot):

```bash
docker compose --profile musicbot build --no-cache music-bot musicwatch
```

```bash
docker compose --profile musicbot up -d
```

**The Music + Watch bot shows as offline.**
Check `docker compose --profile musicbot ps`. If `musicwatch` keeps restarting, its log (`docker compose --profile musicbot logs musicwatch`) says why; *Could not read BOT_TOKEN* means Hoffle has not started yet, so run `docker compose up -d` first.

**I changed `.env` but nothing happened.**
Run `docker compose up -d` again. Docker only applies new settings when it recreates the container.

**Build fails with "no space left on device".**
Free up Docker space with `docker system prune`, then try again.

**Still stuck?**
Collect the output of `docker compose ps` and `docker compose logs --tail 100 hoffle` and [open an issue](https://github.com/Coxaexs/huddle/issues).

## Uninstalling

Stop and remove the containers (with the same `--profile` flags you use, if any):

```bash
docker compose down
```

This keeps your data. To delete everything, including all messages and accounts, also remove the `state/` folder (`sudo rm -rf state`) and then the Hoffle folder itself.
