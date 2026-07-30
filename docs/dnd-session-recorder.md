# D&D Session Recorder

## Architecture

```text
room clients
  ├─ setup / consent / director UI
  ├─ authenticated recording API
  │    ├─ D1: sessions, consent, timeline, outputs, diagnostics
  │    └─ HuddleHub: reconnectable public room state
  └─ visible/audible recording and pause indicators

host recorder service (loopback)
  ├─ authenticated control + heartbeat
  ├─ headless Chromium recorder participant
  │    ├─ existing WebRTC mesh
  │    ├─ accepted participants only
  │    └─ dedicated 16:9 production canvas
  ├─ atomic two-second .part chunks
  └─ FFmpeg → original WebM + H.264/AAC MP4 + metadata
```

The Worker never renders or transcodes video. It stores small coordination,
permission, consent, audit, timeline and output-metadata records. The recorder
service stores all media on local/configurable storage.

The recorder page is not the Huddle shell. It has no channels, messages, DMs,
composer, settings, private sheets or GM data. It receives only public recording
state and accepted room streams. Chromium sends the recorder bearer token as an
extra HTTP header; the token is never placed in its URL or page payload.

## Phase plan

### Phase 1 — foundation (implemented)

- `RECORD_SESSIONS` role permission and server-side checks
- D1 recording, participant, consent, event, output and diagnostics tables
- setup, explicit consent, state machine, reconnect snapshots and audit timeline
- `/record setup|start|pause|resume|marker|scene|stop|status`
- persistent room banner, start/stop tones and compact Director Panel
- clearly labelled recorder participant
- dedicated basic party canvas and mixed accepted-participant audio
- pause that stops `MediaRecorder` writes without leaving voice
- recoverable chunks, local outputs, FFmpeg MP4 finalization and recovery scan
- recorder heartbeat, disk/size status, errors and completed output metadata

### Phase 2 — D&D presentation (implemented)

- campaign/character presentation editor and portrait/art uploads
- debounced/smoothed automatic speaker focus and manual lock
- read-only production battlemap and split renderers driven by map state/events
- explicitly approved character, sheet, spell, ability and item reveals
- authoritative seeded, lazy-loaded Three.js dice overlays
- d4/d6/d8/d10/d12/d20, percentile pairs, multiple dice, keep-high/low,
  natural 20/1, advantage/disadvantage and critical-damage presentation

### Phase 3 — production tools (implemented)

- discrete accepted-participant audio stems with independent paused writes
- editable manual and automatic direction timeline
- chapter text, highlight JSON and thumbnail generation
- optional host-configured WebVTT transcription executable
- tavern, parchment, minimal, arcane and noir themes with scene fades
- configurable local retention and recoverable trash-based deletion

## Database and protocol

`lib/schema.ts` adds public-only `dnd_campaigns` and `campaign_characters`, plus
`recording_sessions`, `recording_participants`, `recording_events`,
`recording_outputs`, and `recorder_diagnostics`. Media bytes and host paths do
not enter D1.

`lib/protocol.ts` defines the public path-free `RecordingState` and typed
`recording-state`, `recording-consent`, `recording-scene`,
`recording-marker`, and `recording-heartbeat` events. The hub persists one
active snapshot per channel so browser refreshes and Durable Object hibernation
restore the indicator and controls.

All user mutations go through the authenticated Recording API because the hub
does not have D1 role context. The internal hub recording endpoint is invoked
only by Worker code. Recorder callbacks require the independent
`RECORDER_SERVICE_TOKEN`.

## State machine

```text
awaiting-consent ──start (all required accepted)──> countdown
countdown ──recorder ready──> recording
recording ──pause / withdrawal──> paused
paused ──resume (all required accepted)──> countdown
recording|paused ──stop──> finalizing ──recorder callback──> completed
any host failure ──> failed
awaiting-consent ──stop──> cancelled
```

Participant withdrawal while recording is fail-closed: metadata changes to
paused, the host receives pause, and resume is rejected until required consent
is accepted again. A new joiner is never added to the accepted user allowlist,
so their audio and portrait are absent until a later explicitly consented
session.

## Security and privacy

- Membership and control permissions are resolved from D1, never trusted from
  UI state.
- A participant can submit consent only for their own user ID.
- Session setup can select only human participants currently in that room.
- Start/resume rejects pending, declined or withdrawn required consent.
- The production audio mixer and canvas both use the accepted-user allowlist.
- The recorder is a visible `D&D Session Recorder` participant.
- Browser-visible recording state contains no tokens, filesystem paths or
  hidden character data.
- Recorder control binds to loopback and uses constant-time bearer comparison.
- Filenames and session IDs are bounded; each recording stays below its own
  storage directory.
- `.part` files are renamed only after a complete write/finalization.
- Direct messages and unrelated channels are not available to the production
  page.

## Risks and assumptions

- Headless Chromium audio capture depends on working WebRTC, fake microphone
  support and the host's TURN configuration.
- `CHROMIUM_EXECUTABLE` and FFmpeg with `libx264`/AAC must exist on the host.
- MediaRecorder WebM chunks form one ordered stream; the service keeps every
  chunk and concatenates them in sequence before finalization.
- A full disk can prevent the final chunk or MP4; heartbeats expose free space
  and the original chunks remain recoverable.
- Three.js is lazy-loaded only in the isolated production client after the
  first dice event, so ordinary Huddle use does not pay its runtime cost.
- Optional transcription requires a host executable accepting input WebM and
  output WebVTT paths; it is disabled when not configured.

## Verification and test plan

1. Type-check/build the Worker and React app with Node 22.
2. Run `npm run check` in `recorder-service`.
3. Permission tests: ordinary member setup/control returns 403; owner/admin/
   allowed role succeeds.
4. Consent tests: pending/declined start returns 409; users cannot consent for
   another account; withdrawal pauses.
5. Transition tests: reject double start, pause while paused, resume while
   recording, and duplicate stop.
6. Reconnect tests: refresh GM and participant tabs and hibernate/recreate the
   Durable Object; state and indicator return.
7. Privacy test: join during recording and verify no canvas tile/audio source is
   connected; selected accepted users remain after WebRTC reconnect.
8. Media test: record, pause for 15 seconds, resume, stop; verify the media
   duration excludes the pause and both WebM and MP4 play.
9. Recovery test: kill the service after multiple chunks, restart it and verify
   recovery output/diagnostics.
10. Failure tests: missing track, full disk, missing Chromium, FFmpeg failure and
    recorder disconnect produce visible health/error state without losing
    chunks.
11. Regression test voice, camera, screen sharing, battlemap, music and
    “Clip that!” unchanged.

## Phase 1 acceptance criteria

- Only server owner/admin/`RECORD_SESSIONS` members can direct recording.
- No bytes are written until all required consent is accepted.
- Recording is never invisible and recorder presence is explicit.
- Pause writes no audio/video while voice remains connected.
- Refresh/reconnect restores the active state.
- Stop produces an atomic original, YouTube-ready MP4 and metadata summary.
- A crash leaves recoverable chunks.
- Existing communication and activity behavior builds without regression.
