# Hoffle

Hoffle is a self-hosted chat app for friend groups and communities, like your own private Discord. Your server, your data, no subscriptions.

- **Text channels and DMs** with replies, reactions, edits, polls, stickers, custom emoji and link previews
- **Voice and video rooms** with screen sharing, spatial audio and noise suppression
- **Music bot** that plays synced music into voice rooms
- **Tabletop tools**: battlemaps, 3D dice and a D&D 5e companion
- **Runs real Discord bots**: discord.js and discord.py bots work unchanged
- **Discord bridge** to mirror channels between Discord and Hoffle

## Quick start

You need [Docker](https://docs.docker.com/get-docker/). Then:

```bash
git clone https://github.com/Coxaexs/huddle.git hoffle
cd hoffle
docker compose up -d
```

The first start takes a few minutes while it builds. Then get your setup code:

```bash
docker compose logs hoffle
```

Open **http://localhost:8730**, create your account, and enter the setup code from the log. The first account becomes the owner. Invite friends from **Server Settings → Invite People**.

That's it. No config files needed.

> **New to self-hosting?** The [self-hosting guide](docs/self-hosting.md) walks through every step: installing Docker, opening Hoffle to your friends over HTTPS, backups, updates and fixing common problems.

## Next steps

| I want to…                                       | Read |
| ------------------------------------------------ | ---- |
| Let friends outside my home network join          | [Putting Hoffle on the internet](docs/self-hosting.md#putting-hoffle-on-the-internet-https) |
| Change the port, add GIF search, push notifications | [Configuration reference](docs/configuration.md) |
| Fix voice for friends who can't hear anyone       | [Voice troubleshooting](docs/self-hosting.md#voice-when-calls-do-not-connect) |
| Back up or update my server                       | [Backups](docs/self-hosting.md#backups) · [Updating](docs/self-hosting.md#updating) |
| Reset a password or promote an admin              | [Admin commands](docs/self-hosting.md#admin-commands) |
| Run Hoffle on Unraid, TrueNAS or Synology         | [Single-container install](docs/self-hosting.md#single-container-install-unraid-truenas-synology) |
| Run my Discord bot, or write a new one            | [Bots](docs/bots.md) |
| Bridge a Discord server                           | [Discord bridge](docs/self-hosting.md#discord-bridge) |

## Everyday commands

Run these from the `hoffle` folder:

| Command                                   | What it does |
| ----------------------------------------- | ------------ |
| `docker compose up -d`                    | Start Hoffle (or apply changed settings) |
| `docker compose down`                     | Stop Hoffle. Your data is kept. |
| `docker compose logs -f hoffle`           | Watch the logs (Ctrl+C to exit) |
| `docker compose ps`                       | Check everything is running |
| `git pull && docker compose up -d --build` | Update to the latest version |

Everything Hoffle stores (messages, accounts, uploads) is in the `state/` folder. Back up that folder and you have backed up Hoffle.

## How it fits together

```
 browser ──► hoffle (port 8730) ──► music-bot   (yt-dlp, internal)
                │                └► dnd-bot     (5e SRD, internal)
                └── state/  database, uploads, secrets

 optional:  livekit (big voice rooms) · coturn (TURN relay) · discord-bridge
```

The `hoffle` container runs the web app and realtime server: a Cloudflare Worker running locally in Wrangler, with SQLite for data and the disk for uploads. The bot containers are only reachable from inside Docker. Voice is peer-to-peer by default, so it needs no extra servers until your rooms get large.

More detail: [audio architecture](docs/audio-architecture.md) · [spatial audio](docs/spatial-audio.md) · [voice input chain](docs/voice-input-chain.md).

## Development

Requires Node.js 22.

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev        # dev server on http://localhost:3001
npm test           # unit tests
npm run build && npm run serve   # production build on :8730
```

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

