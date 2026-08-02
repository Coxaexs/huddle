# Moving Huddle voice from a WebRTC mesh to a LiveKit SFU

Huddle's voice has always been a **WebRTC mesh**: every browser connects directly
to every other browser, and the hub Durable Object only relays the handshake
(SDP/ICE). That works brilliantly on a clean network and unlike an SFU costs no
server bandwidth. The reason it is being replaced:

- Everyone in the group is behind **carrier-grade NAT** (typical for Turkish
  ISPs), so "direct" connections never establish — all media ends up relayed
  through the self-hosted `coturn` TURN at `xray.deeppixel.online`.
- A mesh under full TURN relay is the worst of both worlds: **O(N²)** relayed
  bandwidth crossing the home uplink (the very "uses too much server" you see),
  **and** unstable, because each *pair* is its own connection — when one pair
  blips, only that one person goes silent until an 8–16 s watchdog rebuilds it.
  That is exactly the "sometimes I can't hear them" symptom.

An SFU (Selective Forwarding Unit) fixes both:

- Every client keeps **exactly one** WebRTC connection — to the SFU. No per-pair
  failures, so "can't hear that one person" disappears.
- With **simulcast + Dynacast** the SFU only forwards each participant's audio
  while they are actually talking and downscales video for quiet members, so it
  uses **less** bandwidth than the fully-relayed mesh, at O(N) instead of O(N²).

## What's in this branch (the foundation — all non-breaking)

Everything here is **additive**: none of it activates until the LiveKit server is
deployed and `LIVEKIT_URL` is set. Until then voice behaves exactly as today (mesh).

| Piece | File | Notes |
|---|---|---|
| CI (typecheck + build) | `.github/workflows/ci.yml` | runs on every push/PR |
| Deploy (merge `main` → server) | `.github/workflows/deploy.yml` | `git pull` + build + `systemctl restart huddle` |
| SFU server container | `deploy/livekit/docker-compose.yml` | LiveKit beside coturn |
| SFU config | `deploy/livekit/livekit.yaml` | ports, keys, optional coturn reuse |
| SFU secrets template | `deploy/livekit/.env.example` | |
| SFU bindings | `lib/storage.ts` | `LIVEKIT_URL/API_KEY/API_SECRET` |
| Token helper | `lib/livekit.ts` | signs a short-lived JWT |
| Token endpoint | `app/api/voice/livekit-token/route.ts` | returns `{configured:false}` until SFU is up |

## Deploying the SFU (server side)

1. Copy `deploy/livekit/` to the box (e.g. `~/livekit/`).
2. Set `livekit.yaml` `keys` and `.env` `LIVEKIT_API_SECRET` to one long random
   value (e.g. `openssl rand -hex 16`).
3. `docker compose up -d`.
4. Router: forward **TCP 7880**, **TCP 7882**, and **UDP 7883–7891** to the box
   (mirror the existing coturn relay forwarding).
5. nginx: terminate TLS and proxy `wss://xray.deeppixel.online/livekit` →
   `http://127.0.0.1:7880` (must stay off Cloudflare, like coturn).
6. In `~/huddle/.dev.vars` add `LIVEKIT_URL=wss://xray.deeppixel.online/livekit`,
   plus `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. Rebuild (`npm run build`)
   so `.dev.vars` is republished, then `systemctl restart huddle`.

## Client steps (the remaining, bigger piece)

`app/hooks/use-voice.ts` (the mesh) and its two consumers
(`app/chat-shell.tsx`, `app/recorder/[sessionId]/production-studio.tsx`) must
learn to use `livekit-client` behind the same flag:

1. On join, fetch `/api/voice/livekit-token?room=<channelId>`.
   `configured:false` → keep the mesh path; `configured:true` → SFU.
2. SFU path: `new Room()` → `room.connect(url, token)`; map
   `TrackEvent.TrackSubscribed` into `remoteStreams`; use LiveKit's
   `ParticipantEvent.IsSpeaking` instead of the in-hook `watchLevel` analysers.
3. Keep the whole `useVoice` return contract (`muted/deafened/speaking/…`) so
   `voice-stage.tsx` and the recorder stay unchanged.
4. Server-mute → LiveKit track subscription permission instead of local tracks.

Because the mesh must keep working until the SFU is live, the swap is done as a
flag-gated second path rather than a one-shot replacement.
