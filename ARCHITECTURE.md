# Hoffle Architecture & System Design

This document maps how Hoffle's pieces fit together, where key responsibilities live, and the runtime constraints you need to know before writing code.

For detailed schemas, protocol types, and step-by-step feature recipes, see [docs/codebase.md](docs/codebase.md).

---

## 1. System Map

```
               Clients: Web / Electron / Tauri / Native (macOS/Win/Linux) / Mobile
                                        │
                    ┌───────────────────┴───────────────────┐
                    │ HTTP (Pages, REST, Assets)            │ WebSocket (/api/realtime, /api/gateway)
                    ▼                                       ▼
       ┌─────────────────────────┐             ┌─────────────────────────┐
       │   worker/index.ts       │             │ Cloudflare Durable Obj. │
       │                         │             │                         │
       │ • Vinext App Router     │             │ • HuddleHub             │
       │ • Discord REST v10      │             │   Presence, rooms, P2P  │
       │ • Discord CDN           │             │   mesh signaling, stage,│
       │ • Live STT & headers    │             │   3D Living Room & Club │
       └────────────┬────────────┘             │ • DiscordGateway        │
                    │                          │   Discord v10 gateway   │
                    ▼                          └────────────┬────────────┘
       ┌─────────────────────────┐                          ▼
       │      Cloudflare D1      │             ┌─────────────────────────┐
       │  SQLite database (state)│             │     External Services   │
       │                         │             │                         │
       │      Cloudflare R2      │             │ • music-bot (yt-dlp)    │
       │  User uploads & media   │             │ • musicwatch (DJ/Watch) │
       └─────────────────────────┘             │ • dnd-bot / party-bot   │
                                               │ • livekit (SFU relay)   │
                                               │ • recorder-service      │
                                               └─────────────────────────┘
```

---

## 2. Core Decisions & Invariants

- **Runtime**: Runs as a Cloudflare Worker isolate (`nodejs_compat`, executed in production directly via `workerd`). Code in [`worker/`](worker/) and [`lib/`](lib/) must not import Node C++ addons or use blocking I/O. Passwords use WebCrypto `PBKDF2-SHA256` ([`lib/auth.ts`](lib/auth.ts)).
- **Framework**: Built with `vinext` (Next.js App Router compiler on Vite). Route handlers live in [`app/api/`](app/api/) (`route.ts`) and run inside the worker bundle.
- **WebSocket Dispatch**: Handled directly in [`worker/index.ts`](worker/index.ts) before Vinext runs. Workers cannot modify headers on `101 Switching Protocols` WebSocket responses; delegating upgrades to Vinext causes header mutation crashes.
- **Database Migrations**: Handled in code via [`lib/schema.ts`](lib/schema.ts) inside `ensureSchema(db)` (`SCHEMA_VERSION = 23`). All SQL statements must be idempotent (`CREATE TABLE IF NOT EXISTS`, column checks via `PRAGMA table_info`).
- **Local Persistence**: In development and Docker, Wrangler/workerd writes SQLite files (`D1`) and uploads (`R2`) to the `./state` directory (`--persist-to state`).
- **Module Naming Rule**: Never give a file in [`app/lib/`](app/lib/) the same relative name as a file in [`lib/`](lib/). In Docker builds at `/app`, `@/lib/<name>` resolves to `/app/lib/<name>`, which would collide with `app/lib/<name>` (enforced by [`test/module-names.test.ts`](test/module-names.test.ts)).

---

## 3. Repository & Directory Layout

| Path | Purpose |
| :--- | :--- |
| [`worker/`](worker/) | Cloudflare Worker entry point (`index.ts`), WebSocket upgrade router, Discord REST/CDN dispatch, and security header pipeline. |
| [`lib/`](lib/) | Shared backend & domain modules: auth, passkeys, permissions, SQLite schema (`schema.ts`), Durable Object hub (`hub.ts`), wire protocol (`protocol.ts`), automod, feeds, webhooks, rate-limiting, i18n (`en` & `tr`), and game reducers. |
| [`lib/discord/`](lib/discord/) | Full Discord v10 API implementation: Gateway WebSocket (`gateway.ts`), REST router (`rest.ts`), Slash Command interactions (`interactions.ts`), CDN (`cdn.ts`), and Snowflake generator (`snowflake.ts`). |
| [`app/api/`](app/api/) | Next.js App Router HTTP API endpoints: core routes (`auth`, `channels`, `messages`, `servers`, `roles`, `dms`, `voice`, `uploads`, `v1`, `admin`) and feature routes (`app/api/(features)/` for `music`, `watch`, `battlemap`, `feeds`, `webhooks`, `events`, `polls`, `games`, `tts`, `stt`, `unfurl`). |
| [`app/components/`](app/components/) | React UI components: modular chat shell (`app/components/chat/shell/`), voice stage (`app/components/voice-stage/`), user & server settings (`app/components/settings/`, `app/components/server-settings/`), pin-able widgets (`app/components/widgets/`), 3D Living Room & Club (`living-room.tsx`, `club-scene.ts`, `tabletop-scene.ts`), battlemap, 3D dice overlay, and retro skins (`msn-chrome.tsx`, `retro-chrome.tsx`). |
| [`app/hooks/`](app/hooks/) | Client state hooks: 9-part chat shell pipeline (`app/hooks/chat-shell/`), `useHub` (WebSocket), `useVoice` (WebRTC mesh & LiveKit SFU), `useLivingRoom` (3D venue sync), and `usePlayer` (music sync). |
| [`app/lib/`](app/lib/) | Browser-specific modules: AudioWorklet microphone DSP (`mic-chain.ts`, `voice-effects.ts`), 3D HRTF spatial audio (`spatial-audio.ts`), club lighting choreographer (`club-lights.ts`), and client TTS/STT helpers. |
| [`public/`](public/) | Static assets, AudioWorklet processors (`mic-worklet.js`, `screen-echo-worklet.js`, `tune-worklet.js`), compiled `rnnoise.wasm`, Hoffy & Gang sticker packs (`public/stickers/`), and theme screenshots. |
| [`desktop/`](desktop/) | Full-featured Electron desktop client (Windows, macOS, Linux) with native per-app audio capture and auto-updater. |
| [`desktop-tauri/`](desktop-tauri/) | **Hoffle Lite**: lightweight Rust + Tauri v2 desktop wrapper. |
| [`desktop-native-macos/`](desktop-native-macos/) | **Hoffle Native (macOS)**: 100% native Cocoa / AppKit / WebKit Apple Silicon client (~500 KB bundle). |
| [`desktop-native-windows/`](desktop-native-windows/) | **Hoffle Native (Windows)**: native C++17 / Win32 / WebView2 client with WASAPI app-audio capture. |
| [`desktop-native-linux/`](desktop-native-linux/) | **Hoffle Native (Linux)**: native C++17 / GTK3 / WebKit2GTK client with AppIndicator tray and global hotkeys. |
| [`native-qt/`](native-qt/) | Experimental C++17 / Qt6 native client. |
| [`mobile/`](mobile/) | Capacitor Android & iOS mobile app with foreground voice service, CallKit, floating call bubble, and FCM push notifications. |
| [`services/`](services/) | Companion Docker services: `music-bot` (`yt-dlp`), `dnd-bot` (5e SRD), `musicwatch` (DJ booth & Watch Together), and `party-bot` (minigames). |
| [`discord-bridge/`](discord-bridge/) | Bi-directional channel message & attachment bridge between Discord and Hoffle. |
| [`recorder-service/`](recorder-service/) | Consent-gated multi-track Opus/MP4 session recorder daemon for D&D campaigns. |
| [`deploy/`](deploy/) | Production Nginx configs, Coturn STUN/TURN setup, systemd `workerd` units, healthcheck timers, and Unraid template. |
| [`scripts/`](scripts/) | Operational and build scripts: zero-downtime `deploy.sh`, `workerd-config.sh`, `admin.mjs`, `check-turn.mjs`, and DJ song structure analysis tools (`scripts/dj-analysis/`). |
| [`docs/`](docs/) | User-facing documentation (published to `hoffle.online/docs`) and engineering design notes. |
| [`test/`](test/) | Vitest test suites (180+ test files across `test/` and `lib/*.test.ts`), `jsdom` component tests, `axe-core` accessibility checks, and D1 SQLite integration tests. |

---

## 4. Key Subsystems

### Real-Time Hub (`lib/hub.ts`)
- Manages transient state: online presence, active voice room participants, stage room speaking permissions, 3D Living Room / Club state, and the shared music playback clock.
- Uses `setWebSocketAutoResponse` for client ping/pong keepalives to prevent waking the isolate during idle periods.
- Runs periodic Durable Object alarms for scheduled messages, reminders, status expirations, and RSS/Atom/YouTube/Bluesky/GitHub feed polling (`lib/feeds.ts`).

### Voice, Singing & DSP Pipeline (`app/lib/mic-chain.ts` & `public/mic-worklet.js`)
- Runs in AudioWorklet threads: 80 Hz rumble cut, compiled Wasm RNNoise neural noise suppression, voice focus gate, automatic gain control, echo cancellation (`public/screen-echo-worklet.js`), and real-time vocal pitch-tuning (`public/tune-worklet.js`, `app/lib/voice-effects.ts`).
- P2P WebRTC mesh for small calls (with dynamic uplink bitrate budgeting in `app/lib/voice-bitrate.ts`); auto-switches to LiveKit SFU for large rooms.
- Spatial 3D audio positions speakers in a circle or in the 3D Living Room using Web Audio `HRTF` panner nodes (`app/lib/spatial-audio.ts`).

### 3D Living Room, Club & Tabletop (`app/components/living-room.tsx`)
- Interactive Three.js 3D venues shared in real time by everyone in a voice channel: Cozy Living Room, Dark Academia Library, Starship Lounge, Cinema Booth, Tabletop Battlemap/Dice room, and the Beat-Synced Nightclub (`club-scene.ts`, `club-lights.ts`, `club-skins.ts`).

### Discord Bot Compatibility (`lib/discord/`)
- Emulates Discord Gateway v10 and REST v10 so unmodified `discord.js` and `discord.py` bots (including slash commands, embeds, buttons, select menus, modals, and threads) connect directly.

---

## 5. Development Cheat Sheet

```bash
# Start local dev server (port 3001)
npm run dev

# Run full CI checks (TypeScript compiler + Vitest test suite)
npm run verify

# Build and run local worker with persistent SQLite (port 8730)
npm run build && npm run serve

# Zero-downtime staging build & swap on a live production server
npm run deploy

# Admin CLI (reset passwords, promote admins, create invites)
npm run admin
```

For detailed guides on adding API routes, modifying the database schema, creating WebSocket events, or adding slash commands, see [docs/codebase.md](docs/codebase.md).
