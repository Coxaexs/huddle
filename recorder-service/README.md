# Huddle recorder service

This host-side service is the only process that captures or transcodes media.
The Worker coordinates consent, permissions, state and metadata; it never runs
Chromium or FFmpeg.

## Requirements

- Node.js 22
- Chromium/Chrome with a path supplied as `CHROMIUM_EXECUTABLE`
- FFmpeg with H.264 (`libx264`) and AAC encoders
- A local Huddle URL reachable without the public reverse proxy

Copy `.env.example` values into the environment used by the service. Use the
same long random `RECORDER_SERVICE_TOKEN` in Huddle's `.dev.vars`. Also set:

```text
RECORDER_SERVICE_URL=http://127.0.0.1:8742
RECORDER_SERVICE_TOKEN=<same secret>
```

Then install and run:

```sh
cd recorder-service
npm install
npm start
```

The service binds to loopback by default. Keep it behind the host firewall.
Chromium receives the bearer token as an extra request header, never in a URL,
page payload, or browser-visible configuration. The dedicated recorder page
joins as `D&D Session Recorder` and renders only a production canvas.

Each session has its own directory. Two-second chunks are written atomically as
`.part` files. Pause uses `MediaRecorder.pause()`, so no media is written while
the room remains connected. Stop concatenates the ordered stream chunks,
atomically closes the original WebM, transcodes a temporary MP4 with FFmpeg,
then renames it only after success. Startup scans unfinished sessions and tries
to recover their chunks.

When separate tracks are enabled, each accepted participant gets an independent
paused/resumed Opus stream and finalized AAC `.m4a`. Finalization also writes
`chapters.txt`, `highlights.json`, `thumbnail.jpg`, the editable event/dice
manifest, and optional `subtitles.vtt`.

Set `TRANSCRIPTION_EXECUTABLE` only when a local transcription adapter is
installed. It is invoked without a shell and receives exactly:

```text
<session.webm> <subtitles.vtt.part>
```

Completed sessions move to the recorder's `.trash` directory when their
configured retention expires or an authorized director deletes them. No
browser receives the storage path.
