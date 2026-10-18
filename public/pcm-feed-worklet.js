/**
 * Plays raw PCM posted from the main thread: the Windows desktop app's per-app
 * screen-share audio (see app/lib/app-audio.ts). Interleaved stereo float32
 * chunks arrive over the port; this keeps a small cushion of them so uneven
 * delivery does not click, and trims it back when it grows, so the share does
 * not drift behind the picture. It lives in `public/` like `mic-worklet.js`.
 */

const CAPACITY = 48000; // frames, one second
const START = 2400; // 50 ms buffered before playing
const MAX = 9600; // 200 ms: past this, skip back to START

class PcmFeedProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(CAPACITY * 2);
    this.read = 0;
    this.write = 0;
    this.playing = false;
    this.port.onmessage = (event) => {
      const data = event.data;
      if (data === "stop") {
        this.stopped = true;
        return;
      }
      if (!(data instanceof Float32Array)) return;
      for (let i = 0; i + 1 < data.length; i += 2) {
        const at = (this.write % CAPACITY) * 2;
        this.ring[at] = data[i];
        this.ring[at + 1] = data[i + 1];
        this.write++;
      }
      if (this.write - this.read > MAX) this.read = this.write - START;
    };
  }

  process(_inputs, outputs) {
    const [left, right] = outputs[0];
    const queued = this.write - this.read;
    if (!this.playing && queued >= START) this.playing = true;
    for (let i = 0; i < left.length; i++) {
      if (this.playing && this.read < this.write) {
        const at = (this.read % CAPACITY) * 2;
        left[i] = this.ring[at];
        if (right) right[i] = this.ring[at + 1];
        this.read++;
      } else {
        // Ran dry: wait for a cushion again rather than stutter sample by sample.
        this.playing = false;
        left[i] = 0;
        if (right) right[i] = 0;
      }
    }
    return !this.stopped;
  }
}

registerProcessor("pcm-feed", PcmFeedProcessor);
