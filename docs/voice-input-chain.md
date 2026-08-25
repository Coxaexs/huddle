# The voice input chain

Everything you say passes through one AudioWorklet on its way to the room:
gain, a voice-activity gate, and optionally RNNoise denoising. This note records
the decisions that are not obvious from the code.

- `public/mic-worklet.js` — the processor. Gain, gate, limiter, voice detection.
- `public/rnnoise.wasm` — the denoiser (Apache-2.0, see `rnnoise.LICENSE.txt`).
- `app/lib/mic-chain.ts` — builds the chain, owns the saved settings.
- `lib/mic-worklet.test.ts` — renders signals through the processor and asserts
  on what comes out.

## Why the processing is client-side

A Huddle room is a full mesh with no SFU, so there is no server in the audio
path to do this in. Processing the microphone once locally reaches every peer,
the "Clip that!" buffer and the session recorder, all of which read the same
track, and costs nothing per additional person in the room.

## Why RNNoise, and what it does not do

RNNoise is small (112 KB), fast enough to run in an audio thread, and removes
steady noise — fans, keyboards, hum, traffic. It does **not** remove other
people's voices, which is the thing Krisp is known for. That needs a much larger
model.

The 112 KB is the whole dependency. The published build is closure-compiled down
to two imports and exports its own memory, so the 1.9 MB of emscripten glue that
normally ships with it is replaced by about twenty lines in the worklet. The
export names it uses are mangled (`d` … `j`); the mapping came from the glue's
own table and is recorded in a comment there.

Two constraints worth knowing before changing any of this:

- The worklet is a separate agent cluster. A `WebAssembly.Module` posted across
  that boundary is **dropped silently**, with no error on either side — so the
  main thread posts the raw bytes and the worklet compiles them itself.
- Compiling synchronously is forbidden on the main thread at this size but
  allowed in a worklet. It costs one audio glitch, once, when the mode is
  switched on.

## The seam for background-voice removal

`SuppressionMode` includes `"voice"` and the settings dialog shows it disabled.
Nothing implements it yet. When it is built it should be a **server-side** stage
on the GPU box, not an in-browser model: running DeepFilterNet or similar via
`onnxruntime-web` wants `SharedArrayBuffer`, which needs COOP/COEP headers,
which this app does not set and which would break its cross-origin embeds and
the recorder's calls out to `serviceUrl`.

## Why these settings are not in D1

Input settings live in `localStorage`, on the same reasoning as the device
pickers: which microphone is plugged in, and how loud the room is, are
properties of where you are sitting rather than of your account. The
`voice_prefs` table is the other direction — how you hear other people — and
does follow you between devices.
