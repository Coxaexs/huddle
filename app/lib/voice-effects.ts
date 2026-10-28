"use client";

/**
 * Voice effects: a small Web Audio graph spliced between the mic worklet and
 * the destination whose track goes on the wire (see `mic-chain.ts`).
 *
 * Built from native nodes only, so they cost next to nothing and need no extra
 * download. Swapping effects rewires these nodes but keeps the destination, so
 * the outgoing track never changes and peers do not renegotiate mid-call.
 *
 * The noise gate runs before this, in the worklet, so a reverb tail is the
 * only thing an effect can add while you are silent.
 */

export type VoiceEffect = "none" | "singer" | "vampire" | "gramophone";

export const VOICE_EFFECTS: Array<{ id: VoiceEffect; label: string; hint: string }> = [
  { id: "none", label: "None", hint: "Your normal voice" },
  { id: "singer", label: "Singing voice", hint: "Gently pulled in tune, with a little studio polish: for karaoke, or any time" },
  { id: "vampire", label: "Vampire", hint: "Deep, doubled and echoing, as if from a crypt" },
  { id: "gramophone", label: "Gramophone", hint: "An old recording in a wood-panelled lecture hall" },
];

export interface VoiceEffectGraph {
  input: AudioNode;
  output: AudioNode;
  /** The singing voice's key: the notes it pulls you onto (see camelotScale), null for any note. */
  setKey?(scale: number[] | null, offset: number): void;
  dispose(): void;
}

/**
 * A key in Camelot notation ("8A", "11B") as the notes in it: pitch classes,
 * C = 0. A minor key and its relative major (8A, 8B) share their notes, so the
 * number is all that matters. Null for anything else.
 */
export function camelotScale(key?: string | null): number[] | null {
  const match = /^(\d{1,2})\s*([AB])$/i.exec((key || "").trim());
  const number = match ? Number(match[1]) : 0;
  if (number < 1 || number > 12) return null;
  // 8B is C major and each step round the wheel is a fifth (seven semitones).
  const tonic = ((((number - 8) * 7) % 12) + 12) % 12;
  return [0, 2, 4, 5, 7, 9, 11].map((step) => (tonic + step) % 12);
}

/** A decaying noise burst: a cheap, convincing room for a ConvolverNode. */
function impulse(context: BaseAudioContext, seconds: number, decay: number, darkness: number): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const buffer = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      // One-pole low-pass: higher darkness rolls the room's top end off.
      last = last * darkness + white * (1 - darkness);
      data[i] = last * Math.pow(1 - i / length, decay);
    }
  }
  return buffer;
}

/** Gentle tape/valve-style saturation. */
function saturationCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 1024;
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  for (let i = 0; i < samples; i++) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

export function buildVoiceEffect(context: AudioContext, effect: VoiceEffect): VoiceEffectGraph {
  const input = context.createGain();
  const output = context.createGain();
  const nodes: AudioNode[] = [input, output];
  const sources: AudioScheduledSourceNode[] = [];
  let setKey: VoiceEffectGraph["setKey"];
  const track = <T extends AudioNode>(node: T): T => {
    nodes.push(node);
    return node;
  };

  if (effect === "singer") {
    // A soft pitch correction first (public/tune-worklet.js, loaded with the
    // mic worklet). Where it could not load, the polish alone still helps.
    let head: AudioNode = input;
    try {
      const tune = track(new AudioWorkletNode(context, "pitch-tune", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: "explicit",
      }));
      input.connect(tune);
      head = tune;
      setKey = (scale, offset) => tune.port.postMessage({ scale, offset });
    } catch {
      // No tuner, then.
    }

    // The polish a vocal gets before it sits on a track: the rumble out, a
    // little less boxiness, steady dynamics, presence and air.
    const rumble = track(context.createBiquadFilter());
    rumble.type = "highpass";
    rumble.frequency.value = 90;
    rumble.Q.value = 0.7;
    const box = track(context.createBiquadFilter());
    box.type = "peaking";
    box.frequency.value = 300;
    box.Q.value = 1;
    box.gain.value = -2;
    const squeeze = track(context.createDynamicsCompressor());
    squeeze.threshold.value = -26;
    squeeze.knee.value = 12;
    squeeze.ratio.value = 3;
    squeeze.attack.value = 0.006;
    squeeze.release.value = 0.2;
    const presence = track(context.createBiquadFilter());
    presence.type = "peaking";
    presence.frequency.value = 3200;
    presence.Q.value = 0.9;
    presence.gain.value = 3;
    const air = track(context.createBiquadFilter());
    air.type = "highshelf";
    air.frequency.value = 10000;
    air.gain.value = 2.5;
    head.connect(rumble).connect(box).connect(squeeze).connect(presence).connect(air);

    // A bright plate, a moment behind the voice so the words stay clear.
    const predelay = track(context.createDelay(0.1));
    predelay.delayTime.value = 0.025;
    const plate = track(context.createConvolver());
    plate.buffer = impulse(context, 1.8, 3.2, 0.3);
    const wet = track(context.createGain());
    wet.gain.value = 0.16;
    air.connect(predelay).connect(plate).connect(wet).connect(output);
    air.connect(output);
    // The compressor's squeeze, made back up.
    output.gain.value = 1.25;
  } else if (effect === "vampire") {
    // Weight in the chest, the sibilance pulled back.
    const low = track(context.createBiquadFilter());
    low.type = "lowshelf";
    low.frequency.value = 220;
    low.gain.value = 7;
    const air = track(context.createBiquadFilter());
    air.type = "highshelf";
    air.frequency.value = 4500;
    air.gain.value = -7;
    input.connect(low).connect(air);

    // A second, slowly drifting copy a few ms behind: the voice no longer
    // sounds like one throat.
    const ghost = track(context.createDelay(0.1));
    ghost.delayTime.value = 0.024;
    const lfo = track(context.createOscillator());
    lfo.frequency.value = 0.35;
    const depth = track(context.createGain());
    depth.gain.value = 0.006;
    lfo.connect(depth).connect(ghost.delayTime);
    lfo.start();
    sources.push(lfo);
    const ghostLevel = track(context.createGain());
    ghostLevel.gain.value = 0.55;
    air.connect(ghost).connect(ghostLevel);

    // A long, dark stone room.
    const crypt = track(context.createConvolver());
    crypt.buffer = impulse(context, 2.8, 2.4, 0.6);
    const wet = track(context.createGain());
    wet.gain.value = 0.32;
    air.connect(crypt).connect(wet);

    const dry = track(context.createGain());
    dry.gain.value = 0.85;
    air.connect(dry);
    dry.connect(output);
    ghostLevel.connect(output);
    wet.connect(output);
    // The doubled voice and the room add up; bring it back to normal loudness.
    output.gain.value = 0.6;
  } else if (effect === "gramophone") {
    // The narrow band of an old recording.
    const highpass = track(context.createBiquadFilter());
    highpass.type = "highpass";
    highpass.frequency.value = 320;
    highpass.Q.value = 0.8;
    const lowpass = track(context.createBiquadFilter());
    lowpass.type = "lowpass";
    lowpass.frequency.value = 3600;
    lowpass.Q.value = 0.9;
    // The horn's honk.
    const horn = track(context.createBiquadFilter());
    horn.type = "peaking";
    horn.frequency.value = 1400;
    horn.Q.value = 1.2;
    horn.gain.value = 5;
    const warmth = track(context.createWaveShaper());
    warmth.curve = saturationCurve(2.2);
    warmth.oversample = "2x";
    input.connect(highpass).connect(horn).connect(warmth).connect(lowpass);

    // A small wood-panelled hall: short and warm.
    const hall = track(context.createConvolver());
    hall.buffer = impulse(context, 1.1, 3, 0.45);
    const wet = track(context.createGain());
    wet.gain.value = 0.2;
    lowpass.connect(hall).connect(wet).connect(output);

    const dry = track(context.createGain());
    dry.gain.value = 0.9;
    lowpass.connect(dry).connect(output);
    // Saturation and the horn peak lift the level; match a plain voice.
    output.gain.value = 0.7;
  } else {
    input.connect(output);
  }

  return {
    input,
    output,
    setKey,
    dispose() {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // Already stopped.
        }
      }
      for (const node of nodes) {
        try {
          node.disconnect();
        } catch {
          // Already disconnected.
        }
      }
    },
  };
}
