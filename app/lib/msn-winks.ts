/**
 * Winks, the Messenger 7 way: short cartoons with a sound track, played over
 * the conversation window. Each wink is a little scene script: elements are
 * built with emoji and CSS, moved with the Web Animations API on a timeline,
 * and every sound is synthesized with Web Audio (nothing to download).
 */

type Scene = (stage: Stage) => number; // returns total duration (ms)

export interface WinkInfo {
  id: string;
  name: string;
  emoji: string;
}

export const WINK_LIST: WinkInfo[] = [
  { id: "kiss", name: "Kiss", emoji: "💋" },
  { id: "hearts", name: "Hearts", emoji: "❤️" },
  { id: "laugh", name: "LOL", emoji: "🤣" },
  { id: "cake", name: "Birthday", emoji: "🎂" },
  { id: "storm", name: "Thunderstorm", emoji: "⛈️" },
  { id: "dance", name: "Dance", emoji: "🕺" },
  { id: "fireworks", name: "Fireworks", emoji: "🎆" },
  { id: "knock", name: "Knock Knock", emoji: "🚪" },
  { id: "guitar", name: "Guitar Smash", emoji: "🎸" },
  { id: "flowers", name: "Flowers", emoji: "💐" },
  { id: "ghost", name: "Boo!", emoji: "👻" },
  { id: "sleepy", name: "Sleepy", emoji: "😴" },
];

// ---------------------------------------------------------------- sound

class Sound {
  ctx: AudioContext | null = null;
  out: GainNode | null = null;
  constructor() {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.55;
      this.out.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }
  private t(ms: number) {
    return (this.ctx?.currentTime ?? 0) + ms / 1000;
  }
  tone(ms: number, freq: number, dur: number, type: OscillatorType = "sine", vol = 0.25, slideTo?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const at = this.t(ms);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + dur / 1000);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(vol, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur / 1000);
    osc.connect(gain).connect(this.out);
    osc.start(at);
    osc.stop(at + dur / 1000 + 0.05);
  }
  /** Filtered noise: smacks, whooshes, rain, thunder, crashes. */
  noise(ms: number, dur: number, opts: { type?: BiquadFilterType; freq?: number; to?: number; vol?: number; attack?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * (dur / 1000)));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = opts.type ?? "lowpass";
    const at = this.t(ms);
    filter.frequency.setValueAtTime(opts.freq ?? 1200, at);
    if (opts.to) filter.frequency.exponentialRampToValueAtTime(opts.to, at + dur / 1000);
    const gain = ctx.createGain();
    const vol = opts.vol ?? 0.3;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(vol, at + (opts.attack ?? 10) / 1000);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur / 1000);
    source.connect(filter).connect(gain).connect(this.out);
    source.start(at);
    source.stop(at + dur / 1000 + 0.05);
  }
  /** A body thump: knocks, heartbeats, kick drums. */
  thump(ms: number, freq = 120, vol = 0.5) {
    this.tone(ms, freq, 180, "sine", vol, 40);
    this.noise(ms, 40, { freq: 900, vol: vol * 0.3 });
  }
  melody(ms: number, notes: Array<[number, number]>, type: OscillatorType = "triangle", vol = 0.18) {
    let at = ms;
    for (const [freq, dur] of notes) {
      if (freq) this.tone(at, freq, dur * 0.95, type, vol);
      at += dur;
    }
  }
  close(afterMs: number) {
    window.setTimeout(() => void this.ctx?.close().catch(() => undefined), afterMs);
  }
}

// ---------------------------------------------------------------- stage

class Stage {
  root: HTMLDivElement;
  sound: Sound;
  w: number;
  h: number;
  constructor(root: HTMLDivElement, sound: Sound) {
    this.root = root;
    this.sound = sound;
    this.w = root.clientWidth || window.innerWidth;
    this.h = root.clientHeight || window.innerHeight;
  }
  /** A positioned piece of the scene (emoji, text or a shape). */
  add(content: string, style: Partial<CSSStyleDeclaration> = {}, className = "wk-piece"): HTMLDivElement {
    const el = document.createElement("div");
    el.className = className;
    el.textContent = content;
    Object.assign(el.style, style);
    this.root.appendChild(el);
    return el;
  }
  /** Animates an element starting `delay` ms into the scene. */
  play(el: Element, frames: Keyframe[], duration: number, delay = 0, easing = "ease-out", fill: FillMode = "both") {
    return el.animate(frames, { duration, delay, easing, fill });
  }
  flash(color: string, delay: number, duration = 260, peak = 0.85) {
    const el = this.add("", { inset: "0", background: color, opacity: "0" }, "wk-flash");
    this.play(el, [{ opacity: 0 }, { opacity: peak, offset: 0.15 }, { opacity: 0 }], duration, delay, "linear");
  }
  shake(delay: number, duration = 500, strength = 10) {
    const frames: Keyframe[] = [];
    for (let i = 0; i <= 10; i += 1) {
      const s = strength * (1 - i / 10);
      frames.push({ transform: `translate(${(i % 2 ? 1 : -1) * s}px, ${(i % 3 - 1) * s * 0.6}px)` });
    }
    this.play(this.root, frames, duration, delay, "linear", "none");
  }
  dim(color: string, delay: number, holdUntil: number, peak = 0.7) {
    const el = this.add("", { inset: "0", background: color, opacity: "0" }, "wk-flash");
    this.play(el, [{ opacity: 0 }, { opacity: peak, offset: 0.12 }, { opacity: peak, offset: 0.85 }, { opacity: 0 }], holdUntil - delay, delay, "linear");
  }
  rand(min: number, max: number) {
    return min + Math.random() * (max - min);
  }
}

const px = (n: number) => `${Math.round(n)}px`;
const big = (stage: Stage, ratio = 0.34) => Math.min(stage.w, stage.h) * ratio;

// ---------------------------------------------------------------- scenes

const SCENES: Record<string, Scene> = {
  kiss(s) {
    const size = big(s, 0.3);
    const lips = s.add("💋", { fontSize: px(size), left: "50%", top: "50%" });
    // Swoops in from the left on an arc, then plants a big kiss on the glass.
    s.play(
      lips,
      [
        { transform: `translate(calc(-50% - ${px(s.w * 0.7)}), calc(-50% + ${px(s.h * 0.3)})) scale(.3) rotate(-35deg)` },
        { transform: `translate(calc(-50% - ${px(s.w * 0.25)}), calc(-50% - ${px(s.h * 0.12)})) scale(.6) rotate(-10deg)`, offset: 0.45 },
        { transform: "translate(-50%, -50%) scale(1.25) rotate(4deg)", offset: 0.82 },
        { transform: "translate(-50%, -50%) scale(1) rotate(0)" },
      ],
      900,
      0,
      "cubic-bezier(.3,.7,.4,1)",
    );
    s.sound.noise(0, 850, { type: "bandpass", freq: 400, to: 2400, vol: 0.18, attack: 400 });
    // SMACK
    s.play(lips, [{ transform: "translate(-50%, -50%) scale(1)" }, { transform: "translate(-50%, -50%) scale(1.45, .8)" }, { transform: "translate(-50%, -50%) scale(1)" }], 260, 1050, "ease-in-out", "none");
    s.flash("#ff7ab6", 1100, 320, 0.45);
    s.sound.noise(1100, 90, { type: "bandpass", freq: 1800, vol: 0.55 });
    s.sound.tone(1110, 900, 120, "sine", 0.12, 1500);
    const mark = s.add("💋", { fontSize: px(size * 0.9), left: "50%", top: "50%", opacity: "0", filter: "saturate(1.4)" });
    s.play(mark, [{ opacity: 0, transform: "translate(-50%,-50%) scale(1.3)" }, { opacity: 0.9, transform: "translate(-50%,-50%) scale(1)" }], 200, 1150);
    const word = s.add("Mwah!", { left: "50%", top: `calc(50% + ${px(size * 0.7)})`, fontSize: px(size * 0.32), color: "#ff3d8b" }, "wk-word");
    s.play(word, [{ opacity: 0, transform: "translate(-50%, 20px) scale(.6)" }, { opacity: 1, transform: "translate(-50%, 0) scale(1)" }], 350, 1200, "cubic-bezier(.2,1.6,.4,1)");
    // Hearts float away.
    for (let i = 0; i < 14; i += 1) {
      const heart = s.add(["💕", "💗", "💖", "❤️"][i % 4], { fontSize: px(s.rand(18, 40)), left: "50%", top: "50%" });
      const dx = s.rand(-0.45, 0.45) * s.w;
      const dy = s.rand(-0.55, -0.2) * s.h;
      s.play(heart, [{ opacity: 0, transform: "translate(-50%,-50%) scale(.2)" }, { opacity: 1, offset: 0.2 }, { opacity: 0, transform: `translate(calc(-50% + ${px(dx)}), calc(-50% + ${px(dy)})) scale(1.1) rotate(${s.rand(-40, 40)}deg)` }], 1600, 1250 + i * 60);
    }
    s.sound.melody(1300, [[1319, 90], [1568, 90], [2093, 260]], "sine", 0.1);
    s.play(lips, [{ opacity: 1 }, { opacity: 0 }], 500, 3200, "linear");
    s.play(mark, [{ opacity: 0.9 }, { opacity: 0 }], 500, 3200, "linear");
    s.play(word, [{ opacity: 1 }, { opacity: 0 }], 400, 3200, "linear");
    return 3800;
  },

  hearts(s) {
    const size = big(s, 0.32);
    s.dim("radial-gradient(circle, rgba(255,120,170,.35), rgba(120,0,60,.35))", 0, 3800, 1);
    const heart = s.add("❤️", { fontSize: px(size), left: "50%", top: "50%" });
    s.play(heart, [{ transform: "translate(-50%,-50%) scale(0)" }, { transform: "translate(-50%,-50%) scale(1)" }], 450, 0, "cubic-bezier(.2,1.5,.4,1)");
    // Two heartbeats, each with a thump-thump.
    for (const at of [700, 1500]) {
      s.play(heart, [{ transform: "translate(-50%,-50%) scale(1)" }, { transform: "translate(-50%,-50%) scale(1.25)", offset: 0.15 }, { transform: "translate(-50%,-50%) scale(1.05)", offset: 0.35 }, { transform: "translate(-50%,-50%) scale(1.2)", offset: 0.5 }, { transform: "translate(-50%,-50%) scale(1)" }], 600, at, "ease-in-out", "none");
      s.sound.thump(at, 70, 0.6);
      s.sound.thump(at + 190, 60, 0.45);
    }
    // Then it bursts into a shower of little hearts.
    s.play(heart, [{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 }, { transform: "translate(-50%,-50%) scale(1.6)", opacity: 0 }], 300, 2300, "ease-in");
    s.sound.melody(2300, [[1047, 80], [1319, 80], [1568, 80], [2093, 300]], "triangle", 0.14);
    for (let i = 0; i < 26; i += 1) {
      const angle = (i / 26) * Math.PI * 2;
      const dist = s.rand(0.25, 0.5) * Math.min(s.w, s.h);
      const bit = s.add(["💖", "💗", "💕", "💓"][i % 4], { fontSize: px(s.rand(16, 36)), left: "50%", top: "50%" });
      s.play(bit, [{ opacity: 0, transform: "translate(-50%,-50%) scale(.3)" }, { opacity: 1, offset: 0.15 }, { opacity: 0, transform: `translate(calc(-50% + ${px(Math.cos(angle) * dist)}), calc(-50% + ${px(Math.sin(angle) * dist - 60)})) scale(1) rotate(${s.rand(-60, 60)}deg)` }], 1300, 2320, "cubic-bezier(.1,.8,.3,1)");
    }
    return 3800;
  },

  laugh(s) {
    const size = big(s, 0.3);
    const face = s.add("🤣", { fontSize: px(size), left: "50%", top: "46%" });
    // Rolls in from the right, spinning, then bounces with laughter.
    s.play(face, [{ transform: `translate(calc(-50% + ${px(s.w * 0.6)}), -50%) rotate(720deg)` }, { transform: "translate(-50%, -50%) rotate(0)" }], 900, 0, "cubic-bezier(.2,.8,.3,1)");
    s.sound.noise(0, 800, { type: "lowpass", freq: 300, to: 900, vol: 0.12, attack: 200 });
    s.play(face, [{ transform: "translate(-50%,-50%) rotate(0)" }, { transform: "translate(-50%,-62%) rotate(-10deg)" }, { transform: "translate(-50%,-50%) rotate(8deg)" }, { transform: "translate(-50%,-58%) rotate(-6deg)" }, { transform: "translate(-50%,-50%) rotate(0)" }], 520, 950, "ease-in-out", "none");
    s.play(face, [{ transform: "translate(-50%,-50%) rotate(0)" }, { transform: "translate(-50%,-62%) rotate(-10deg)" }, { transform: "translate(-50%,-50%) rotate(8deg)" }, { transform: "translate(-50%,-58%) rotate(-6deg)" }, { transform: "translate(-50%,-50%) rotate(0)" }], 520, 1500, "ease-in-out", "none");
    // HA HA HA, each syllable popping with a falling "ha".
    const has = ["HA", "HA", "HA", "HA!"];
    has.forEach((text, i) => {
      const at = 1000 + i * 260;
      const word = s.add(text, { left: `${22 + i * 19}%`, top: `calc(46% + ${px(size * 0.75)})`, fontSize: px(size * 0.3), color: ["#ff4d4d", "#ffa21f", "#2fb14a", "#1c7bd8"][i] }, "wk-word");
      s.play(word, [{ opacity: 0, transform: "translate(-50%, 30px) scale(.3) rotate(-20deg)" }, { opacity: 1, transform: "translate(-50%, 0) scale(1.15) rotate(8deg)", offset: 0.6 }, { opacity: 1, transform: "translate(-50%, 0) scale(1) rotate(0)" }], 300, at, "ease-out");
      s.play(word, [{ opacity: 1 }, { opacity: 0, transform: "translate(-50%, -40px)" }], 500, 3100, "ease-in");
      s.sound.tone(at, 520 - i * 50, 150, "square", 0.08, 380 - i * 40);
      s.sound.tone(at + 60, 780 - i * 60, 90, "triangle", 0.06);
    });
    for (let i = 0; i < 8; i += 1) {
      const tear = s.add("💧", { fontSize: px(s.rand(14, 24)), left: "50%", top: "40%" });
      const side = i % 2 ? 1 : -1;
      s.play(tear, [{ opacity: 0, transform: "translate(-50%,0)" }, { opacity: 1, offset: 0.1 }, { opacity: 0, transform: `translate(calc(-50% + ${px(side * s.rand(80, 200))}), ${px(s.rand(60, 160))})` }], 800, 1000 + i * 180, "cubic-bezier(.3,0,.8,.6)");
    }
    s.play(face, [{ opacity: 1 }, { opacity: 0, transform: "translate(-50%,-50%) scale(.6)" }], 500, 3100, "ease-in");
    return 3700;
  },

  cake(s) {
    const size = big(s, 0.3);
    const cake = s.add("🎂", { fontSize: px(size), left: "50%", top: "56%" });
    s.play(cake, [{ transform: `translate(-50%, ${px(s.h)})` }, { transform: "translate(-50%, -50%)" }], 700, 0, "cubic-bezier(.2,1.2,.4,1)");
    // Candle flames flicker above it.
    for (let i = 0; i < 3; i += 1) {
      const flame = s.add("🔥", { fontSize: px(size * 0.14), left: `calc(50% + ${px((i - 1) * size * 0.2)})`, top: `calc(56% - ${px(size * 0.62)})` });
      s.play(flame, [{ opacity: 0 }, { opacity: 1 }], 200, 800 + i * 120);
      s.play(flame, [{ transform: "translate(-50%,-50%) scale(1) rotate(-6deg)" }, { transform: "translate(-50%,-50%) scale(1.15,.9) rotate(6deg)" }], 180, 800, "ease-in-out", "none").effect?.updateTiming({ iterations: 14, direction: "alternate" });
      s.play(flame, [{ opacity: 1 }, { opacity: 0 }], 300, 3300);
    }
    const text = s.add("Happy Birthday!", { left: "50%", top: `calc(56% - ${px(size * 0.95)})`, fontSize: px(size * 0.24), color: "#ff4fa3" }, "wk-word wk-rainbow");
    s.play(text, [{ opacity: 0, transform: "translate(-50%, -30px) scale(.5)" }, { opacity: 1, transform: "translate(-50%, 0) scale(1)" }], 500, 900, "cubic-bezier(.2,1.5,.4,1)");
    // The first line of the song.
    const G = 392, A = 440, C5 = 523, B = 494;
    s.sound.melody(900, [[G, 190], [G, 90], [A, 280], [G, 280], [C5, 280], [B, 520]], "triangle", 0.17);
    // Confetti rain.
    const colors = ["#ff4d6d", "#ffd23f", "#3ec1d3", "#6a4cff", "#2fbf71", "#ff8a1f"];
    for (let i = 0; i < 60; i += 1) {
      const bit = s.add("", { left: `${s.rand(0, 100)}%`, top: "-20px", width: px(s.rand(6, 11)), height: px(s.rand(10, 16)), background: colors[i % colors.length], borderRadius: "2px" }, "wk-piece wk-shape");
      s.play(bit, [{ transform: `translateY(0) rotate(0)` }, { transform: `translate(${px(s.rand(-80, 80))}, ${px(s.h + 40)}) rotate(${s.rand(360, 900)}deg)` }], s.rand(1600, 2600), 700 + s.rand(0, 1200), "linear");
    }
    s.sound.noise(750, 180, { type: "highpass", freq: 3000, vol: 0.2 });
    s.play(cake, [{ opacity: 1 }, { opacity: 0 }], 400, 3400);
    s.play(text, [{ opacity: 1 }, { opacity: 0 }], 400, 3400);
    return 4000;
  },

  storm(s) {
    s.dim("linear-gradient(#0b1020, #1d2640)", 0, 4300, 0.85);
    const size = big(s, 0.26);
    const clouds = [0, 1, 2].map((i) =>
      s.add(i === 1 ? "⛈️" : "☁️", { fontSize: px(size * (i === 1 ? 1 : 0.8)), left: `${30 + i * 20}%`, top: "22%" }),
    );
    clouds.forEach((cloud, i) => {
      s.play(cloud, [{ transform: `translate(calc(-50% + ${px((i - 1) * s.w * 0.6)}), -50%)`, opacity: 0 }, { transform: "translate(-50%, -50%)", opacity: 1 }], 900, i * 120, "ease-out");
      s.play(cloud, [{ opacity: 1 }, { opacity: 0 }], 500, 3700);
    });
    s.sound.noise(0, 1200, { type: "lowpass", freq: 300, vol: 0.15, attack: 500 });
    // Rain.
    for (let i = 0; i < 70; i += 1) {
      const drop = s.add("", { left: `${s.rand(0, 100)}%`, top: "18%", width: "2px", height: px(s.rand(14, 26)), background: "rgba(170,200,255,.8)" }, "wk-piece wk-shape");
      s.play(drop, [{ transform: "translate(0,0)", opacity: 0 }, { opacity: 1, offset: 0.1 }, { transform: `translate(-30px, ${px(s.h * 0.85)})`, opacity: 0.6 }], s.rand(500, 800), 900 + s.rand(0, 2600), "linear");
    }
    s.sound.noise(900, 3200, { type: "highpass", freq: 2500, vol: 0.08, attack: 400 });
    // Two lightning strikes, each flash followed by rolling thunder.
    for (const at of [1300, 2500]) {
      const bolt = s.add("⚡", { fontSize: px(size * 1.1), left: `${s.rand(35, 65)}%`, top: "52%" });
      s.play(bolt, [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 0.3, offset: 0.3 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], 450, at, "linear");
      s.flash("#dfe8ff", at, 300, 0.9);
      s.shake(at + 150, 700, 6);
      s.sound.noise(at, 120, { type: "highpass", freq: 1500, vol: 0.4 });
      s.sound.noise(at + 120, 1800, { type: "lowpass", freq: 200, to: 60, vol: 0.7, attack: 80 });
    }
    return 4400;
  },

  dance(s) {
    s.dim("radial-gradient(circle at 50% 30%, rgba(40,10,80,.7), rgba(5,0,20,.85))", 0, 4200, 1);
    const size = big(s, 0.3);
    const ball = s.add("🪩", { fontSize: px(size * 0.5), left: "50%", top: "0" });
    s.play(ball, [{ transform: "translate(-50%, -120%)" }, { transform: "translate(-50%, 10%)" }], 700, 0, "cubic-bezier(.3,1.4,.5,1)");
    s.play(ball, [{ rotate: "0deg" }, { rotate: "360deg" }], 1600, 700, "linear", "none").effect?.updateTiming({ iterations: 2 });
    // Sweeping coloured spotlights.
    ["#ff3df2", "#3dd9ff", "#ffe53d"].forEach((color, i) => {
      const beam = s.add("", { left: "50%", top: "8%", width: px(s.w * 0.22), height: px(s.h * 1.1), background: `linear-gradient(${color}88, transparent)`, transformOrigin: "50% 0", clipPath: "polygon(45% 0, 55% 0, 100% 100%, 0 100%)", mixBlendMode: "screen" }, "wk-piece wk-shape");
      s.play(beam, [{ opacity: 0, transform: `translateX(-50%) rotate(${-40 + i * 10}deg)` }, { opacity: 1, offset: 0.1 }, { transform: `translateX(-50%) rotate(${40 - i * 10}deg)`, offset: 0.55 }, { opacity: 1, transform: `translateX(-50%) rotate(${-30 + i * 15}deg)`, offset: 0.9 }, { opacity: 0 }], 3600, 400, "ease-in-out");
    });
    const dancer = s.add("🕺", { fontSize: px(size), left: "50%", top: "58%" });
    s.play(dancer, [{ opacity: 0, transform: "translate(-50%,-50%) scale(.5)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)" }], 400, 500);
    // On the beat: kick, bass and a bounce.
    const beat = 300;
    const bass = [110, 110, 147, 131, 110, 110, 165, 147, 110, 131];
    for (let i = 0; i < 10; i += 1) {
      const at = 800 + i * beat;
      s.sound.thump(at, 110, 0.55);
      s.sound.tone(at, bass[i], beat * 0.8, "sawtooth", 0.06);
      if (i % 2) s.sound.noise(at, 60, { type: "highpass", freq: 6000, vol: 0.15 });
      s.play(dancer, [{ transform: `translate(-50%,-50%) rotate(${i % 2 ? 12 : -12}deg) scaleX(${i % 4 < 2 ? 1 : -1})` }, { transform: `translate(-50%,-62%) rotate(0) scaleX(${i % 4 < 2 ? 1 : -1})` }, { transform: `translate(-50%,-50%) rotate(${i % 2 ? -12 : 12}deg) scaleX(${i % 4 < 2 ? 1 : -1})` }], beat, at, "ease-in-out", "none");
    }
    for (let i = 0; i < 6; i += 1) {
      const note = s.add(["🎵", "🎶"][i % 2], { fontSize: px(s.rand(24, 40)), left: `${s.rand(15, 85)}%`, top: "75%" });
      s.play(note, [{ opacity: 0, transform: "translateY(0)" }, { opacity: 1, offset: 0.2 }, { opacity: 0, transform: `translate(${px(s.rand(-40, 40))}, ${px(-s.h * 0.4)})` }], 1600, 1000 + i * 400);
    }
    s.play(dancer, [{ opacity: 1 }, { opacity: 0 }], 400, 3800);
    s.play(ball, [{ opacity: 1 }, { opacity: 0 }], 400, 3800);
    return 4300;
  },

  fireworks(s) {
    s.dim("linear-gradient(#050818, #121a3a)", 0, 4400, 0.85);
    const colors = ["#ff4d6d", "#ffd23f", "#3ec1ff", "#7bff6a", "#ff7af5", "#ffffff"];
    const bursts = [
      { x: 0.3, y: 0.32, at: 700 },
      { x: 0.68, y: 0.26, at: 1350 },
      { x: 0.5, y: 0.42, at: 2000 },
      { x: 0.22, y: 0.5, at: 2550 },
      { x: 0.78, y: 0.46, at: 2800 },
    ];
    bursts.forEach(({ x, y, at }, n) => {
      const launch = at - 600;
      const rocket = s.add("", { left: `${x * 100}%`, top: "100%", width: "4px", height: "18px", background: "linear-gradient(#fff, rgba(255,200,120,0))", borderRadius: "2px" }, "wk-piece wk-shape");
      s.play(rocket, [{ transform: "translate(-50%, 0)", opacity: 1 }, { transform: `translate(-50%, ${px(-(1 - y) * s.h)})`, opacity: 1, offset: 0.95 }, { opacity: 0 }], 600, launch, "cubic-bezier(.2,.6,.4,1)");
      s.sound.tone(launch, 900, 600, "sine", 0.05, 2400);
      s.sound.noise(launch, 600, { type: "bandpass", freq: 3000, vol: 0.05 });
      const color = colors[n % colors.length];
      const sparks = 22;
      for (let i = 0; i < sparks; i += 1) {
        const angle = (i / sparks) * Math.PI * 2;
        const dist = s.rand(0.14, 0.22) * Math.min(s.w, s.h) * 1.4;
        const spark = s.add("", { left: `${x * 100}%`, top: `${y * 100}%`, width: "6px", height: "6px", borderRadius: "50%", background: i % 5 ? color : "#fff", boxShadow: `0 0 8px ${color}` }, "wk-piece wk-shape");
        s.play(spark, [{ transform: "translate(-50%,-50%) scale(1)", opacity: 1 }, { transform: `translate(calc(-50% + ${px(Math.cos(angle) * dist)}), calc(-50% + ${px(Math.sin(angle) * dist + 30)})) scale(.4)`, opacity: 0 }], 1100, at, "cubic-bezier(.1,.7,.3,1)");
      }
      s.flash(`radial-gradient(circle at ${x * 100}% ${y * 100}%, ${color}66, transparent 45%)`, at, 400, 1);
      s.sound.noise(at, 500, { type: "lowpass", freq: 1800, to: 300, vol: 0.5 });
      s.sound.noise(at + 250, 700, { type: "highpass", freq: 5000, vol: 0.08, attack: 50 });
    });
    return 4500;
  },

  knock(s) {
    const size = big(s, 0.42);
    const door = s.add("", { left: "50%", top: "52%", width: px(size * 0.62), height: px(size), background: "linear-gradient(90deg, #7a4a22, #a8672f 50%, #7a4a22)", border: "6px solid #4a2a10", borderRadius: "8px 8px 2px 2px", transformOrigin: "0 50%", boxShadow: "0 12px 30px rgba(0,0,0,.5)" }, "wk-piece wk-shape wk-door");
    const knob = s.add("", { left: `calc(50% + ${px(size * 0.2)})`, top: "54%", width: px(size * 0.07), height: px(size * 0.07), borderRadius: "50%", background: "radial-gradient(circle at 35% 35%, #fff4b0, #c99a1f)" }, "wk-piece wk-shape");
    s.play(door, [{ opacity: 0, transform: "translate(-50%,-50%) scale(.8)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)" }], 400, 0);
    s.play(knob, [{ opacity: 0 }, { opacity: 1 }], 400, 0);
    // Knock, knock, knock.
    [700, 1050, 1400].forEach((at, i) => {
      s.play(door, [{ transform: "translate(-50%,-50%) scale(1)" }, { transform: "translate(-50%,-50%) scale(1.03) rotate(.8deg)" }, { transform: "translate(-50%,-50%) scale(1)" }], 160, at, "ease-out", "none");
      s.sound.thump(at, 160, 0.8);
      s.sound.noise(at, 70, { type: "bandpass", freq: 700, vol: 0.5 });
      const word = s.add("KNOCK", { left: `${30 + i * 20}%`, top: `calc(52% - ${px(size * 0.7)})`, fontSize: px(size * 0.14), color: "#fff", textShadow: "2px 2px 0 #4a2a10" }, "wk-word");
      s.play(word, [{ opacity: 0, transform: "translate(-50%,10px) scale(.5) rotate(-8deg)" }, { opacity: 1, transform: "translate(-50%,0) scale(1.1) rotate(4deg)", offset: 0.5 }, { opacity: 0, transform: "translate(-50%,-20px) scale(1)" }], 700, at);
    });
    // The door creaks open…
    s.play(door, [{ transform: "translate(-50%,-50%) perspective(600px) rotateY(0)" }, { transform: "translate(-50%,-50%) perspective(600px) rotateY(-75deg)" }], 900, 2000, "ease-in-out");
    s.play(knob, [{ opacity: 1 }, { opacity: 0 }], 300, 2000);
    s.sound.tone(2000, 220, 900, "sawtooth", 0.05, 330);
    s.sound.tone(2100, 290, 700, "sawtooth", 0.03, 240);
    // …and someone waves hello.
    const hello = s.add("👋", { fontSize: px(size * 0.45), left: "50%", top: "50%" });
    s.play(hello, [{ opacity: 0, transform: "translate(-50%,-50%) scale(.4)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)" }], 350, 2600, "cubic-bezier(.2,1.6,.4,1)");
    s.play(hello, [{ rotate: "-15deg" }, { rotate: "20deg" }], 200, 2900, "ease-in-out", "none").effect?.updateTiming({ iterations: 5, direction: "alternate" });
    const hi = s.add("Hello!", { left: "50%", top: `calc(52% + ${px(size * 0.62)})`, fontSize: px(size * 0.18), color: "#ffd23f", textShadow: "2px 2px 0 #7a4a22" }, "wk-word");
    s.play(hi, [{ opacity: 0, transform: "translate(-50%,20px)" }, { opacity: 1, transform: "translate(-50%,0)" }], 350, 2700, "cubic-bezier(.2,1.6,.4,1)");
    s.sound.melody(2700, [[784, 120], [1047, 260]], "triangle", 0.15);
    for (const el of [door, hello, hi]) s.play(el, [{ opacity: 1 }, { opacity: 0 }], 400, 3700);
    return 4200;
  },

  guitar(s) {
    const size = big(s, 0.38);
    const guitar = s.add("🎸", { fontSize: px(size), left: "50%", top: "45%", transformOrigin: "80% 20%" });
    s.play(guitar, [{ opacity: 0, transform: "translate(-50%,-50%) rotate(-10deg) scale(.6)" }, { opacity: 1, transform: "translate(-50%,-50%) rotate(0) scale(1)" }], 400, 0);
    // A power chord, then the wind-up…
    s.sound.tone(300, 82, 900, "sawtooth", 0.14);
    s.sound.tone(300, 123, 900, "sawtooth", 0.11);
    s.sound.tone(300, 165, 900, "square", 0.06);
    s.play(guitar, [{ transform: "translate(-50%,-50%) rotate(0)" }, { transform: "translate(-40%,-65%) rotate(-55deg)" }], 600, 900, "cubic-bezier(.3,0,.3,1)");
    s.sound.noise(900, 600, { type: "bandpass", freq: 300, to: 1200, vol: 0.12, attack: 400 });
    // …and SMASH.
    s.play(guitar, [{ transform: "translate(-40%,-65%) rotate(-55deg)" }, { transform: "translate(-50%,-30%) rotate(70deg)" }], 180, 1500, "cubic-bezier(.6,0,1,1)");
    s.play(guitar, [{ opacity: 1 }, { opacity: 0 }], 100, 1680, "linear");
    s.flash("#fff3c4", 1680, 250, 0.8);
    s.shake(1680, 700, 16);
    s.sound.noise(1680, 900, { type: "lowpass", freq: 5000, to: 400, vol: 0.9 });
    s.sound.tone(1680, 60, 500, "sine", 0.6, 30);
    s.sound.tone(1700, 330, 600, "sawtooth", 0.05, 90);
    const boom = s.add("💥", { fontSize: px(size * 1.2), left: "50%", top: "62%" });
    s.play(boom, [{ opacity: 0, transform: "translate(-50%,-50%) scale(.2)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1.1)", offset: 0.4 }, { opacity: 0, transform: "translate(-50%,-50%) scale(1.4)" }], 900, 1680);
    const pieces = ["🎸", "🪵", "🪵", "✨", "🎵", "🪵", "🔩", "✨"];
    pieces.forEach((piece, i) => {
      const el = s.add(piece, { fontSize: px(s.rand(22, 44)), left: "50%", top: "62%" });
      const dx = s.rand(-0.45, 0.45) * s.w;
      s.play(el, [{ opacity: 1, transform: "translate(-50%,-50%) rotate(0)" }, { opacity: 1, transform: `translate(calc(-50% + ${px(dx * 0.6)}), calc(-50% - ${px(s.rand(100, 220))})) rotate(${s.rand(-300, 300)}deg)`, offset: 0.4 }, { opacity: 0, transform: `translate(calc(-50% + ${px(dx)}), calc(-50% + ${px(s.h * 0.4)})) rotate(${s.rand(-600, 600)}deg)` }], 1500, 1700 + i * 20, "cubic-bezier(.2,.6,.6,1)");
    });
    const rock = s.add("ROCK ON!", { left: "50%", top: "30%", fontSize: px(size * 0.2), color: "#ff3b3b", textShadow: "3px 3px 0 #000" }, "wk-word");
    s.play(rock, [{ opacity: 0, transform: "translate(-50%,0) scale(2)" }, { opacity: 1, transform: "translate(-50%,0) scale(1)" }], 300, 2100, "ease-out");
    s.play(rock, [{ opacity: 1 }, { opacity: 0 }], 400, 3400);
    return 3900;
  },

  flowers(s) {
    const size = big(s, 0.32);
    s.dim("radial-gradient(circle, rgba(255,240,250,.35), rgba(255,200,230,.2))", 0, 4200, 1);
    const bouquet = s.add("💐", { fontSize: px(size), left: "50%", top: "58%" });
    s.play(bouquet, [{ transform: `translate(-50%, ${px(s.h * 0.6)}) rotate(-15deg)` }, { transform: "translate(-50%,-50%) rotate(4deg)", offset: 0.75 }, { transform: "translate(-50%,-50%) rotate(0)" }], 900, 0, "cubic-bezier(.2,.9,.3,1)");
    s.play(bouquet, [{ rotate: "-4deg" }, { rotate: "4deg" }], 700, 900, "ease-in-out", "none").effect?.updateTiming({ iterations: 4, direction: "alternate" });
    const words = s.add("For you!", { left: "50%", top: `calc(58% - ${px(size * 0.85)})`, fontSize: px(size * 0.24), color: "#e0428a" }, "wk-word wk-script");
    s.play(words, [{ opacity: 0, transform: "translate(-50%,10px)" }, { opacity: 1, transform: "translate(-50%,0)" }], 600, 900);
    // A soft music-box melody while petals drift down.
    const E = 659, G = 784, A = 880, C6 = 1047, D6 = 1175;
    s.sound.melody(700, [[C6, 240], [G, 240], [E, 240], [G, 240], [A, 360], [G, 240], [D6, 480], [C6, 700]], "sine", 0.12);
    s.sound.melody(700, [[C6 * 2, 240], [0, 720], [A * 2, 360], [0, 720], [C6 * 2, 700]], "sine", 0.03);
    for (let i = 0; i < 34; i += 1) {
      const petal = s.add(["🌸", "🌺", "🌷", "💮"][i % 4], { fontSize: px(s.rand(16, 30)), left: `${s.rand(0, 100)}%`, top: "-40px" });
      const sway = s.rand(40, 120);
      s.play(petal, [{ transform: "translate(0,0) rotate(0)", opacity: 0 }, { opacity: 1, offset: 0.1 }, { transform: `translate(${px(sway)}, ${px(s.h * 0.35)}) rotate(120deg)`, offset: 0.4 }, { transform: `translate(${px(-sway)}, ${px(s.h * 0.7)}) rotate(240deg)`, offset: 0.75 }, { transform: `translate(${px(sway / 2)}, ${px(s.h + 40)}) rotate(360deg)`, opacity: 0.8 }], s.rand(2600, 3400), s.rand(300, 1400), "linear");
    }
    s.play(bouquet, [{ opacity: 1 }, { opacity: 0 }], 400, 3800);
    s.play(words, [{ opacity: 1 }, { opacity: 0 }], 400, 3800);
    return 4400;
  },

  ghost(s) {
    s.dim("radial-gradient(circle, rgba(20,10,40,.7), rgba(0,0,0,.92))", 0, 4000, 1);
    const size = big(s, 0.36);
    const ghost = s.add("👻", { fontSize: px(size), left: "50%", top: "50%" });
    // Drifts in, wobbling and fading like a spectre…
    s.play(ghost, [{ opacity: 0, transform: `translate(calc(-50% - ${px(s.w * 0.35)}), -50%) scale(.6)` }, { opacity: 0.5, transform: `translate(calc(-50% - ${px(s.w * 0.12)}), -58%) scale(.75)`, offset: 0.5 }, { opacity: 0.7, transform: "translate(-50%,-50%) scale(.8)" }], 1400, 0, "ease-in-out");
    // Woooo: a sliding, vibrato "oo".
    const ctx = s.sound;
    ctx.tone(0, 330, 1300, "sine", 0.12, 260);
    ctx.tone(150, 335, 1150, "sine", 0.08, 250);
    for (let i = 0; i < 4; i += 1) {
      const bat = s.add("🦇", { fontSize: px(s.rand(20, 34)), left: "0", top: `${s.rand(15, 70)}%` });
      s.play(bat, [{ transform: "translate(-40px, 0)" }, { transform: `translate(${px(s.w * 0.5)}, ${px(s.rand(-60, 60))})`, offset: 0.5 }, { transform: `translate(${px(s.w + 60)}, ${px(s.rand(-60, 60))})` }], 1600, s.rand(0, 1400), "ease-in-out");
      s.sound.tone(s.rand(0, 1400), 3200, 60, "square", 0.02, 2600);
    }
    // …then lunges at the screen: BOO!
    s.play(ghost, [{ opacity: 0.7, transform: "translate(-50%,-50%) scale(.8)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(2.4)" }], 260, 1700, "cubic-bezier(.6,0,1,1)");
    s.flash("#ffffff", 1900, 220, 0.8);
    s.shake(1900, 600, 14);
    s.sound.noise(1900, 500, { type: "bandpass", freq: 900, to: 400, vol: 0.7, attack: 5 });
    s.sound.tone(1900, 180, 500, "sawtooth", 0.2, 90);
    const boo = s.add("BOO!", { left: "50%", top: "50%", fontSize: px(Math.min(size * 0.5, s.w * 0.16)), color: "#fff", textShadow: "0 0 20px #a0f, 4px 4px 0 #000" }, "wk-word");
    s.play(boo, [{ opacity: 0, transform: "translate(-50%,-50%) scale(1.8)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)" }], 250, 1950, "ease-out");
    s.play(ghost, [{ opacity: 1 }, { opacity: 0 }], 300, 2250);
    s.play(boo, [{ opacity: 1 }, { opacity: 0, transform: "translate(-50%,-50%) scale(.8)" }], 500, 3300);
    return 3900;
  },

  sleepy(s) {
    s.dim("linear-gradient(#0d1b3d, #273a6b)", 0, 4400, 0.8);
    const size = big(s, 0.3);
    const moon = s.add("🌙", { fontSize: px(size * 0.5), left: "78%", top: "18%" });
    s.play(moon, [{ opacity: 0, transform: "translate(-50%,-30%)" }, { opacity: 1, transform: "translate(-50%,-50%)" }], 800, 0);
    for (let i = 0; i < 14; i += 1) {
      const star = s.add("✦", { left: `${s.rand(5, 95)}%`, top: `${s.rand(5, 45)}%`, fontSize: px(s.rand(8, 16)), color: "#fff6c2" }, "wk-piece");
      s.play(star, [{ opacity: 0 }, { opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }, { opacity: 0 }], 3600, s.rand(0, 500), "linear");
    }
    const face = s.add("😴", { fontSize: px(size), left: "46%", top: "56%" });
    s.play(face, [{ opacity: 0, transform: "translate(-50%,-50%) scale(.7)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)" }], 600, 200);
    // Breathing in and out, with a snore on each breath out.
    for (const at of [800, 2200]) {
      s.play(face, [{ transform: "translate(-50%,-50%) scale(1)" }, { transform: "translate(-50%,-50%) scale(1.08)", offset: 0.5 }, { transform: "translate(-50%,-50%) scale(1)" }], 1300, at, "ease-in-out", "none");
      s.sound.noise(at, 700, { type: "lowpass", freq: 180, to: 420, vol: 0.4, attack: 500 });
      s.sound.tone(at + 700, 90, 500, "sawtooth", 0.05, 70);
    }
    // Z z z drifting up.
    ["Z", "z", "Z", "z", "Z"].forEach((letter, i) => {
      const z = s.add(letter, { left: `calc(46% + ${px(size * 0.35)})`, top: `calc(56% - ${px(size * 0.35)})`, fontSize: px(size * (0.2 + (i % 2) * 0.08)), color: "#bcd4ff" }, "wk-word");
      s.play(z, [{ opacity: 0, transform: "translate(0,0) rotate(-10deg)" }, { opacity: 1, offset: 0.2 }, { opacity: 0, transform: `translate(${px(40 + i * 12)}, ${px(-s.h * 0.35)}) rotate(15deg)` }], 1800, 600 + i * 450, "ease-out");
    });
    // A lullaby (Brahms), very softly.
    const E = 659, G = 784, D6 = 1175, C6 = 1047;
    s.sound.melody(600, [[E, 250], [E, 250], [G, 700], [E, 250], [E, 250], [G, 700], [E, 250], [G, 250], [C6, 500], [D6, 500]], "sine", 0.07);
    for (const el of [face, moon]) s.play(el, [{ opacity: 1 }, { opacity: 0 }], 500, 3900);
    return 4500;
  },
};

// ---------------------------------------------------------------- player

let current: { overlay: HTMLDivElement; sound: Sound } | null = null;

function stopCurrent() {
  if (!current) return;
  current.overlay.remove();
  current.sound.close(0);
  current = null;
}

/**
 * Plays a wink over the conversation window (or the whole screen when there
 * isn't one). A click skips it. `muted` plays it silently.
 */
export function playWinkScene(id: string, { muted = false }: { muted?: boolean } = {}) {
  const scene = SCENES[id];
  if (!scene) return;
  stopCurrent();
  const host = document.querySelector<HTMLElement>(".chat-panel .messages") ?? null;
  const rect = host?.getBoundingClientRect();
  const overlay = document.createElement("div");
  overlay.className = "wk-overlay";
  overlay.setAttribute("aria-hidden", "true");
  if (rect && rect.width > 240 && rect.height > 200) {
    Object.assign(overlay.style, {
      left: px(rect.left),
      top: px(rect.top),
      width: px(rect.width),
      height: px(rect.height),
    });
  } else {
    Object.assign(overlay.style, { left: "0", top: "0", width: "100vw", height: "100dvh" });
  }
  document.body.appendChild(overlay);
  const sound = new Sound();
  if (muted && sound.out) sound.out.gain.value = 0;
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const stage = new Stage(overlay, sound);
  let duration = 3000;
  if (reduced) {
    const info = WINK_LIST.find((w) => w.id === id);
    const el = stage.add(info?.emoji ?? "✨", { fontSize: px(big(stage)), left: "50%", top: "50%", transform: "translate(-50%,-50%)" });
    stage.play(el, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], duration, 0, "linear");
  } else {
    duration = scene(stage);
  }
  current = { overlay, sound };
  const mine = current;
  overlay.addEventListener("click", () => {
    if (current === mine) stopCurrent();
  });
  window.setTimeout(() => {
    if (current === mine) stopCurrent();
  }, duration + 200);
}
