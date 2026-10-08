/**
 * Built-in zero-latency soundboard presets synthesized via Web Audio API.
 * These work out-of-the-box without requiring external audio downloads or R2 storage.
 */

export interface SoundPreset {
  id: string;
  name: string;
  emoji: string;
  category: "memes" | "reactions" | "effects";
  description: string;
}

export const SOUNDBOARD_PRESETS: SoundPreset[] = [
  { id: "airhorn", name: "Airhorn", emoji: "📢", category: "memes", description: "Classic stadium triple airhorn blast" },
  { id: "rimshot", name: "Ba-Dum Tss", emoji: "🥁", category: "reactions", description: "Drum rimshot joke punchline" },
  { id: "bruh", name: "Bruh", emoji: "🗿", category: "memes", description: "Deep resonant bruh sound effect" },
  { id: "quack", name: "Quack", emoji: "🦆", category: "reactions", description: "Bouncy rubber duck squeak" },
  { id: "gg", name: "GG Fanfare", emoji: "🎉", category: "reactions", description: "8-bit victory level-up arpeggio" },
  { id: "ding", name: "Bell Ding", emoji: "🛎️", category: "effects", description: "Crystal-clear elevator notification bell" },
  { id: "win_error", name: "Windows Error", emoji: "🛑", category: "memes", description: "Iconic Windows Critical Stop error chord" },
  { id: "win_tada", name: "Windows Ta-Da", emoji: "🎺", category: "reactions", description: "Classic Windows 2000 victory fanfare" },
  { id: "msn_nudge", name: "MSN Nudge", emoji: "📳", category: "reactions", description: "MSN Messenger window shake and rattle" },
  { id: "applause", name: "Applause", emoji: "👏", category: "reactions", description: "Enthusiastic audience clapping" },
  { id: "crickets", name: "Crickets", emoji: "🦗", category: "memes", description: "Awkward silence cricket chirps" },
];

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx || audioCtx.state === "closed") {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === "suspended") {
    void audioCtx.resume();
  }
  return audioCtx;
}

export function playPresetSound(presetId: string, volume = 0.7): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const master = ctx.createGain();
  master.gain.setValueAtTime(Math.max(0, Math.min(1, volume)), ctx.currentTime);
  master.connect(ctx.destination);

  const t = ctx.currentTime;

  switch (presetId) {
    case "airhorn": {
      // 3 short blasts followed by 1 longer sustained blast
      const blasts = [
        { start: 0, duration: 0.12 },
        { start: 0.15, duration: 0.12 },
        { start: 0.3, duration: 0.12 },
        { start: 0.45, duration: 0.45 },
      ];
      const freqs = [466.16, 554.37, 622.25]; // Bb4, Db5, Eb5 chord

      blasts.forEach(({ start, duration }) => {
        freqs.forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sawtooth";
          osc.frequency.setValueAtTime(freq, t + start);
          // Slight downward pitch drop per blast
          osc.frequency.exponentialRampToValueAtTime(freq * 0.96, t + start + duration);

          gain.gain.setValueAtTime(0, t + start);
          gain.gain.linearRampToValueAtTime(0.18, t + start + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t + start + duration);

          osc.connect(gain);
          gain.connect(master);
          osc.start(t + start);
          osc.stop(t + start + duration);
        });
      });
      break;
    }

    case "rimshot": {
      // 1. Kick/snare "Ba"
      const snareOsc1 = ctx.createOscillator();
      const snareGain1 = ctx.createGain();
      snareOsc1.type = "triangle";
      snareOsc1.frequency.setValueAtTime(160, t);
      snareOsc1.frequency.exponentialRampToValueAtTime(60, t + 0.08);
      snareGain1.gain.setValueAtTime(0.5, t);
      snareGain1.gain.exponentialRampToValueAtTime(0.01, t + 0.08);
      snareOsc1.connect(snareGain1);
      snareGain1.connect(master);
      snareOsc1.start(t);
      snareOsc1.stop(t + 0.08);

      // 2. Tom "Dum"
      const tomOsc = ctx.createOscillator();
      const tomGain = ctx.createGain();
      tomOsc.type = "sine";
      tomOsc.frequency.setValueAtTime(120, t + 0.12);
      tomOsc.frequency.exponentialRampToValueAtTime(50, t + 0.22);
      tomGain.gain.setValueAtTime(0.4, t + 0.12);
      tomGain.gain.exponentialRampToValueAtTime(0.01, t + 0.22);
      tomOsc.connect(tomGain);
      tomGain.connect(master);
      tomOsc.start(t + 0.12);
      tomOsc.stop(t + 0.22);

      // 3. Cymbal "Tsss"
      const bufferSize = ctx.sampleRate * 0.5;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.setValueAtTime(4500, t + 0.24);

      const cymbalGain = ctx.createGain();
      cymbalGain.gain.setValueAtTime(0.6, t + 0.24);
      cymbalGain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

      noise.connect(filter);
      filter.connect(cymbalGain);
      cymbalGain.connect(master);
      noise.start(t + 0.24);
      noise.stop(t + 0.75);
      break;
    }

    case "bruh": {
      // Formant synthesized "Bruh" vocal simulation
      const osc = ctx.createOscillator();
      const bpf1 = ctx.createBiquadFilter();
      const bpf2 = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(75, t + 0.45);

      bpf1.type = "bandpass";
      bpf1.frequency.setValueAtTime(500, t);
      bpf1.frequency.linearRampToValueAtTime(400, t + 0.45);
      bpf1.Q.setValueAtTime(4, t);

      bpf2.type = "bandpass";
      bpf2.frequency.setValueAtTime(1100, t);
      bpf2.frequency.linearRampToValueAtTime(800, t + 0.45);
      bpf2.Q.setValueAtTime(4, t);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.6, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.45);

      osc.connect(bpf1);
      osc.connect(bpf2);
      bpf1.connect(gain);
      bpf2.connect(gain);
      gain.connect(master);

      osc.start(t);
      osc.stop(t + 0.45);
      break;
    }

    case "quack": {
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.linearRampToValueAtTime(260, t + 0.18);
      osc.frequency.linearRampToValueAtTime(290, t + 0.28);

      filter.type = "bandpass";
      filter.frequency.setValueAtTime(900, t);
      filter.frequency.exponentialRampToValueAtTime(1600, t + 0.12);
      filter.frequency.exponentialRampToValueAtTime(700, t + 0.28);
      filter.Q.setValueAtTime(6, t);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.5, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.01, t + 0.32);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(master);

      osc.start(t);
      osc.stop(t + 0.32);
      break;
    }

    case "gg": {
      // 8-bit upbeat victory fanfare arpeggio (C5 -> E5 -> G5 -> C6)
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(freq, t + idx * 0.1);

        gain.gain.setValueAtTime(0, t + idx * 0.1);
        gain.gain.linearRampToValueAtTime(0.25, t + idx * 0.1 + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.1 + (idx === 3 ? 0.4 : 0.09));

        osc.connect(gain);
        gain.connect(master);
        osc.start(t + idx * 0.1);
        osc.stop(t + idx * 0.1 + (idx === 3 ? 0.4 : 0.1));
      });
      break;
    }

    case "ding": {
      // Clear elevator / service bell chime
      const osc = ctx.createOscillator();
      const oscHarmonic = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(1200, t);

      oscHarmonic.type = "sine";
      oscHarmonic.frequency.setValueAtTime(2400, t);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.4, t + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);

      osc.connect(gain);
      oscHarmonic.connect(gain);
      gain.connect(master);

      osc.start(t);
      oscHarmonic.start(t);
      osc.stop(t + 0.95);
      oscHarmonic.stop(t + 0.95);
      break;
    }

    case "applause": {
      // Filtered noise with periodic impulse bursts
      const duration = 1.2;
      const bufferSize = Math.floor(ctx.sampleRate * duration);
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        // Modulated noise bursts to emulate hand claps
        const burstMod = 0.5 + 0.5 * Math.sin(i / 800) * Math.sin(i / 1300);
        output[i] = (Math.random() * 2 - 1) * burstMod;
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(1200, t);
      filter.Q.setValueAtTime(1.2, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.45, t + 0.2);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(master);

      noise.start(t);
      noise.stop(t + duration);
      break;
    }

    case "crickets": {
      // 3 chirps
      const chirps = [0, 0.25, 0.5];
      chirps.forEach((start) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(4500, t + start);

        gain.gain.setValueAtTime(0, t + start);
        gain.gain.linearRampToValueAtTime(0.2, t + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + start + 0.12);

        osc.connect(gain);
        gain.connect(master);
        osc.start(t + start);
        osc.stop(t + start + 0.13);
      });
      break;
    }

    case "win_error": {
      // Sub-bass impact thud
      const thudOsc = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thudOsc.type = "sine";
      thudOsc.frequency.setValueAtTime(125, t);
      thudOsc.frequency.exponentialRampToValueAtTime(45, t + 0.22);
      thudGain.gain.setValueAtTime(0.7, t);
      thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      thudOsc.connect(thudGain);
      thudGain.connect(master);
      thudOsc.start(t);
      thudOsc.stop(t + 0.23);

      // Discordant diminished orchestral chord
      const chordFreqs = [130.81, 185.0, 220.0, 261.63, 311.13];
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(880, t);
      filter.Q.setValueAtTime(2.8, t);
      filter.connect(master);

      chordFreqs.forEach((freq) => {
        const saw = ctx.createOscillator();
        const sawGain = ctx.createGain();
        saw.type = "sawtooth";
        saw.frequency.setValueAtTime(freq, t);
        sawGain.gain.setValueAtTime(0.001, t);
        sawGain.gain.linearRampToValueAtTime(0.24, t + 0.004);
        sawGain.gain.exponentialRampToValueAtTime(0.015, t + 0.28);
        sawGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.58);
        saw.connect(sawGain);
        sawGain.connect(filter);
        saw.start(t);
        saw.stop(t + 0.6);
      });
      break;
    }

    case "win_tada": {
      // Fanfare: G4 -> C5 -> E5 -> triumphant C-major chord
      const steps = [
        { freq: 392.0, at: t, dur: 0.08 },
        { freq: 523.25, at: t + 0.08, dur: 0.08 },
        { freq: 659.25, at: t + 0.16, dur: 0.11 },
      ];
      steps.forEach(({ freq, at, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, at);
        gain.gain.setValueAtTime(0.001, at);
        gain.gain.linearRampToValueAtTime(0.35, at + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.001, at + dur);
        osc.connect(gain);
        gain.connect(master);
        osc.start(at);
        osc.stop(at + dur + 0.02);
      });

      const chordStart = t + 0.26;
      const chordFreqs = [261.63, 392.0, 523.25, 659.25, 783.99];
      const brassFilter = ctx.createBiquadFilter();
      brassFilter.type = "lowpass";
      brassFilter.frequency.setValueAtTime(1400, chordStart);
      brassFilter.Q.setValueAtTime(2.0, chordStart);
      brassFilter.connect(master);

      chordFreqs.forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, chordStart);
        gain.gain.setValueAtTime(0.001, chordStart);
        gain.gain.linearRampToValueAtTime(0.18, chordStart + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, chordStart + 0.85);
        osc.connect(gain);
        gain.connect(brassFilter);
        osc.start(chordStart);
        osc.stop(chordStart + 0.86);
      });
      break;
    }

    case "msn_nudge": {
      // Sub-bass desk impact
      const thud = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thud.type = "sine";
      thud.frequency.setValueAtTime(92, t);
      thud.frequency.exponentialRampToValueAtTime(38, t + 0.22);
      thudGain.gain.setValueAtTime(0.65, t);
      thudGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      thud.connect(thudGain);
      thudGain.connect(master);
      thud.start(t);
      thud.stop(t + 0.23);

      // Shaking flutter 18Hz
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const bpf = ctx.createBiquadFilter();
      const flutterGain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();

      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(130, t);
      osc2.type = "square";
      osc2.frequency.setValueAtTime(260, t);
      bpf.type = "bandpass";
      bpf.frequency.setValueAtTime(220, t);
      bpf.Q.setValueAtTime(2.2, t);

      lfo.frequency.setValueAtTime(19, t);
      lfoGain.gain.setValueAtTime(0.25, t);

      flutterGain.gain.setValueAtTime(0.001, t);
      flutterGain.gain.linearRampToValueAtTime(0.45, t + 0.015);
      flutterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.52);

      lfo.connect(lfoGain);
      lfoGain.connect(flutterGain.gain);

      osc1.connect(bpf);
      osc2.connect(bpf);
      bpf.connect(flutterGain);
      flutterGain.connect(master);

      osc1.start(t);
      osc2.start(t);
      lfo.start(t);
      osc1.stop(t + 0.52);
      osc2.stop(t + 0.52);
      lfo.stop(t + 0.52);
      break;
    }
  }
}
