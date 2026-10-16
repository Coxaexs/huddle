"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Sparkles,
  Heart,
  X,
  MessageSquare,
  Timer,
  Wrench,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Moon,
  Check,
  Copy,
  Coffee,
  GripHorizontal,
} from "lucide-react";
import { showToast } from "./toast";

/**
 * Sound synthesizer using Web Audio API for cozy, zero-asset audio feedback.
 */
function playSynthSound(
  type: "chime" | "bell" | "digital" | "quill" | "synth" | "ember" | "dice" | "timer",
) {
  if (typeof window === "undefined") return;
  try {
    const isMuted = window.localStorage.getItem("huddle-buddy-sound") === "muted";
    if (isMuted) return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    if (type === "chime") {
      // Gentle pastel harp arpeggio (C5 -> E5 -> G5)
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.09, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.32);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.34);
      });
    } else if (type === "bell") {
      // Deep gothic cathedral toll
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(110, now + 0.5);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.6);
    } else if (type === "digital") {
      // Matrix CRT glitch chirp
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1760, now + 0.04);
      osc.frequency.setValueAtTime(440, now + 0.08);
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.18);
    } else if (type === "quill") {
      // Antique parchment chime
      [659.25, 880].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);
        gain.gain.setValueAtTime(0.08, now + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 0.32);
      });
    } else if (type === "timer") {
      // Celebratory completion chime (C5, G5, C6)
      [523.25, 783.99, 1046.5].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.12, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.42);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.45);
      });
    } else if (type === "dice") {
      // Rolling rattle
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(460, now + 0.08);
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.12);
    } else {
      // Warm chime default
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    }
  } catch { }
}

/**
 * Theme-specific companion profiles.
 */
interface CompanionProfile {
  id: string;
  name: string;
  species: string;
  badge: string;
  accent: string;
  secondary: string;
  soundType: "chime" | "bell" | "digital" | "quill" | "synth" | "ember";
  dialogues: string[];
  specialActionName: string;
  specialActionDesc: string;
  specialParticle: string;
}

const COMPANIONS: Record<string, CompanionProfile> = {
  cozy: {
    id: "cozy",
    name: "Blåhaj",
    species: "Plush Comfort Shark",
    badge: "🦈 Comfort Guardian",
    accent: "#5bcffa",
    secondary: "#f5abb9",
    soundType: "chime",
    specialActionName: "Warm Shark Hug",
    specialActionDesc: "Send a wave of cozy pastel hearts & sparkles across your screen",
    specialParticle: "♥",
    dialogues: [
      "You belong in this Huddle.",
      "Hydration check! Tiny sip of water for your shark friend? 💧",
      "Having a rough day? Sending a giant, fluffy shark hug!",
      "Your identity and journey are yours to define and celebrate.",
      "Remember to unclench your jaw and gently drop your shoulders.",
      "Blåhaj believes in you, even when things feel heavy.",
      "Taking a pause is productive too. Breathe in... and out.",
      "Swimming alongside you in this chat, always!",
      "You've got this. Keep being your wonderful self.",
    ],
  },
  vampire: {
    id: "vampire",
    name: "Vlad",
    species: "Nocturnal Chibi Bat",
    badge: "🦇 Crypt Familiar",
    accent: "#ff3355",
    secondary: "#7b1128",
    soundType: "bell",
    specialActionName: "Midnight Bell",
    specialActionDesc: "Toll the gothic cathedral chime and summon a swarm of ruby bat sparks",
    specialParticle: "🦇",
    dialogues: [
      "The velvety shadows welcome you, mortal friend.",
      "A warm cup of chamomile... or vintage O-negative?",
      "Do not fear the dark; it is where our minds ponder deepest.",
      "Midnight tolls. How fare your nocturnal endeavors?",
      "Beware the blinding sun; embrace the screen glow.",
      "Even creatures of the night need their full rest in the crypt.",
      "Sharpen your wits, guard your heart, and enjoy the night.",
      "A bite-sized friend watching over your server tonight.",
    ],
  },
  matrix: {
    id: "matrix",
    name: "Unit-01",
    species: "Console AI Daemon",
    badge: "📟 [ROOT // 0x4F]",
    accent: "#00ff66",
    secondary: "#003b14",
    soundType: "digital",
    specialActionName: "System Glitch",
    specialActionDesc: "Inject a digital phosphor glitch and matrix rain burst",
    specialParticle: "01",
    dialogues: [
      "Wake up, user... the Huddle has you.",
      "There is no spoon. Only CSS custom properties.",
      "Take the red pill for focus; take the blue pill for memes.",
      "Firewall status: impenetrable. Emotional bandwidth: nominal.",
      "I can only show you the door. You are the one who must send the message.",
      "Searching cyberspace... confirmed: you are among good companions.",
      "Baud rate 9600. Decrypting good vibes for this session.",
      "Ping 0ms to friendship protocol.",
    ],
  },
  "dark-academia": {
    id: "dark-academia",
    name: "Archimedes",
    species: "The Scholar Owl",
    badge: "📜 Keeper of the Archive",
    accent: "#c9a45c",
    secondary: "#33281a",
    soundType: "quill",
    specialActionName: "Scholarly Maxim",
    specialActionDesc: "Flourish ancient golden dust and recite a philosophical gem",
    specialParticle: "✦",
    dialogues: [
      "Carpe noctem — seize the quiet night, gentle scholar.",
      "Have you annotated your thoughts and reflections today?",
      "Between the covers of a good book lies an entire universe.",
      "A warm cup of Earl Grey is the ultimate remedy for melancholy.",
      "Per aspera ad astra: through hardship to the stars.",
      "Even Homer and Shakespeare rested their quills by candlelight.",
      "Wisdom is knowing when to study, and when to listen to friends.",
      "The library is warm, the clock is ticking, and you are doing well.",
    ],
  },
  cyberpunk: {
    id: "cyberpunk",
    name: "Byte",
    species: "Neon Street Kitsune",
    badge: "⚡ Night City Runner",
    accent: "#fcee0a",
    secondary: "#00f0ff",
    soundType: "digital",
    specialActionName: "Overclock Surge",
    specialActionDesc: "Release high-voltage neon lightning sparks and synth resonance",
    specialParticle: "⚡",
    dialogues: [
      "Jacked into the Net. Ready to rock this server, choom!",
      "High tech, high empathy. That's how we run this space.",
      "Overclocking is good, but don't melt your cyberware. Hydrate!",
      "Neon lights, synthwave beats, and top-tier banter.",
      "Fire up your chrome, we've got memes to deploy.",
      "Stay chrome, never fold, and drink some electrolytes.",
    ],
  },
  amber: {
    id: "amber",
    name: "Ember",
    species: "Hearth Sprite",
    badge: "🔥 Fireplace Fox",
    accent: "#e0a56a",
    secondary: "#55402b",
    soundType: "chime",
    specialActionName: "Campfire Glow",
    specialActionDesc: "Kindle warm floating embers and soothing hearth crackles",
    specialParticle: "🔥",
    dialogues: [
      "Pull up a chair by the hearth. You are safe and warm here.",
      "Listen to the crackle of the wood. All is well tonight.",
      "A warm cup in your hands and good friends in your ears.",
      "Take a moment to bask in this quiet warmth.",
    ],
  },
  midnight: {
    id: "midnight",
    name: "Luna",
    species: "Celestial Silk Moth",
    badge: "🌙 Astral Wayfarer",
    accent: "#60a5fa",
    secondary: "#1e293b",
    soundType: "chime",
    specialActionName: "Starlight Dust",
    specialActionDesc: "Scatter shimmering celestial constellations and moon dust",
    specialParticle: "⋆",
    dialogues: [
      "The cosmos is vast and quiet, yet you found your circle here.",
      "Let the starlight quiet your mind from the day's noise.",
      "Count the constellations, not your worries.",
      "Soft luminescence for late-night wanderers.",
    ],
  },
  msn: {
    id: "msn",
    name: "Clippy",
    species: "Helpful Paperclip",
    badge: "📎 Clippy!",
    accent: "#1c5ec6",
    secondary: "#fef9c3",
    soundType: "chime",
    specialActionName: "Offer Helpful Advice!",
    specialActionDesc: "Clippy pops up with eager assistance & a classic nostalgic chime",
    specialParticle: "📎",
    dialogues: [
      "It looks like you're writing a message! Would you like help with that? 📎",
      "It looks like you're rolling dice. Let me calculate the optimal trajectory! 🎲",
      "Don't forget your away message: (¯`·._.·[ Away from keyboard ]·._.·´¯)!",
      "*tap tap on glass* Hey! Just checking in to see if you need any assistance!",
      "It looks like you've been focused for a while. Remember to stretch & hydrate! 💧",
      "Personal status: (8) Listening to: Evanescence - Bring Me To Life (8)",
      "It looks like you're having an awesome time on Huddle! 📎✨",
    ],
  },
  "msn-dark": {
    id: "msn-dark",
    name: "Clippy",
    species: "Helpful Paperclip",
    badge: "📎 Clippy!",
    accent: "#4c9dff",
    secondary: "#1e293b",
    soundType: "chime",
    specialActionName: "Offer Helpful Advice!",
    specialActionDesc: "Clippy pops up with eager assistance & a classic nostalgic chime",
    specialParticle: "📎",
    dialogues: [
      "It looks like you're writing a message! Would you like help with that? 📎",
      "It looks like you're rolling dice. Let me calculate the optimal trajectory! 🎲",
      "Don't forget your away message: (¯`·._.·[ Away from keyboard ]·._.·´¯)!",
      "*tap tap on glass* Hey! Just checking in to see if you need any assistance!",
      "It looks like you've been focused for a while. Remember to stretch & hydrate! 💧",
      "Personal status: (8) Listening to: Evanescence - Bring Me To Life (8)",
      "It looks like you're having an awesome time on Huddle! 📎✨",
    ],
  },
};

/**
 * SVGs for each companion character.
 */
function BlahajSvg() {
  return (
    <svg
      viewBox="0 0 72 56"
      className="companion-svg blahaj-svg"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Tail Fin */}
      <path d="M12 28 C6 22 2 14 6 12 C10 10 14 18 18 24 Z" fill="#38bdf8" />
      <path d="M12 28 C6 34 2 42 6 44 C10 46 14 38 18 32 Z" fill="#38bdf8" />
      {/* Dorsal Fin */}
      <path d="M34 18 C33 7 38 4 43 5 C46 6 47 12 45 18 Z" fill="#0284c7" />
      {/* Main Shark Body */}
      <path
        d="M14 28 C16 16 32 12 52 16 C63 18 68 24 68 28 C68 32 63 38 52 40 C32 44 16 40 14 28 Z"
        fill="#5bcffa"
      />
      {/* White Plush Belly */}
      <path
        d="M22 30 C30 31 46 32 58 29 C64 31 66 33 65 34 C62 38 52 40 40 40 C28 40 20 37 18 33 C18 31 20 30 22 30 Z"
        fill="#f8fafc"
      />
      {/* Pectoral Fin (flipper) */}
      <path
        className="flipper-fin"
        d="M42 32 C45 37 51 44 48 46 C45 48 40 42 38 35 Z"
        fill="#38bdf8"
      />
      {/* Cute Gills */}
      <path
        d="M48 24 C48.5 25.5 48.5 27 48 28.5"
        stroke="#0284c7"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M51 24 C51.5 25.5 51.5 27 51 28.5"
        stroke="#0284c7"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Blushing Cheek */}
      <ellipse cx="58" cy="30" rx="3.5" ry="2" fill="#f472b6" opacity="0.7" />
      {/* Kawaii Eye */}
      <circle cx="58" cy="23" r="3" fill="#0f172a" />
      <circle cx="59.2" cy="22" r="1.1" fill="#ffffff" />
      <circle cx="57" cy="24" r="0.6" fill="#ffffff" />
      {/* Trans Flag Pride Heart Badge */}
      <g transform="translate(29, 23) scale(0.65)">
        <path
          d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
          fill="#5bcffa"
        />
        <path
          d="M12 18.5l-1.2-1.1C5.8 13.2 3.2 10.8 3.2 8c0-2 1.6-3.6 3.6-3.6 1.4 0 2.7.7 3.5 1.7l1.7 2 1.7-2c.8-1 2.1-1.7 3.5-1.7 2 0 3.6 1.6 3.6 3.6 0 2.8-2.6 5.2-7.6 9.4L12 18.5z"
          fill="#f5abb9"
        />
        <path
          d="M12 15l-.8-.7C7.5 10.8 5.5 9 5.5 7c0-1.4 1.1-2.5 2.5-2.5.9 0 1.8.5 2.3 1.2l1.7 2 1.7-2c.5-.7 1.4-1.2 2.3-1.2 1.4 0 2.5 1.1 2.5 2.5 0 2-2 3.8-5.7 7.3L12 15z"
          fill="#ffffff"
        />
      </g>
      {/* Soft Smile */}
      <path
        d="M62 27 C61 28.5 59.5 28.5 59 28"
        stroke="#0f172a"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BatSvg() {
  return (
    <svg
      viewBox="0 0 72 56"
      className="companion-svg bat-svg"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Left Wing */}
      <path
        className="bat-wing left"
        d="M26 28 C18 20 8 16 3 20 C2 28 8 36 14 38 C18 36 21 34 24 32 Z"
        fill="#1e1022"
        stroke="#c8102e"
        strokeWidth="1.2"
      />
      <path
        d="M10 24 C14 26 18 30 22 34"
        stroke="#881337"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Right Wing */}
      <path
        className="bat-wing right"
        d="M46 28 C54 20 64 16 69 20 C70 28 64 36 58 38 C54 36 51 34 48 32 Z"
        fill="#1e1022"
        stroke="#c8102e"
        strokeWidth="1.2"
      />
      <path
        d="M62 24 C58 26 54 30 50 34"
        stroke="#881337"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Bat Ears */}
      <path
        d="M30 18 C28 8 23 6 22 10 C21 14 26 20 28 22 Z"
        fill="#2d1633"
        stroke="#c8102e"
        strokeWidth="0.8"
      />
      <path
        d="M26 16 C25 11 23 9 23 11 C23 13 25 16 26 17 Z"
        fill="#e11d48"
        opacity="0.6"
      />
      <path
        d="M42 18 C44 8 49 6 50 10 C51 14 46 20 44 22 Z"
        fill="#2d1633"
        stroke="#c8102e"
        strokeWidth="0.8"
      />
      <path
        d="M46 16 C47 11 49 9 49 11 C49 13 47 16 46 17 Z"
        fill="#e11d48"
        opacity="0.6"
      />
      {/* Bat Body */}
      <ellipse
        cx="36"
        cy="30"
        rx="14"
        ry="16"
        fill="#180b1a"
        stroke="#4a1525"
        strokeWidth="1.5"
      />
      {/* Fuzzy Chest */}
      <path d="M32 28 C34 33 38 33 40 28 C40 34 36 37 32 35 Z" fill="#381524" />
      {/* Ruby Glowing Eyes */}
      <ellipse cx="31" cy="25" rx="3.2" ry="3.8" fill="#e11d48" />
      <circle cx="31" cy="25" r="2.2" fill="#881337" />
      <circle cx="32" cy="24" r="1.1" fill="#ffffff" />
      <ellipse cx="41" cy="25" rx="3.2" ry="3.8" fill="#e11d48" />
      <circle cx="41" cy="25" r="2.2" fill="#881337" />
      <circle cx="42" cy="24" r="1.1" fill="#ffffff" />
      {/* Cute Vampire Smile & Tiny Fangs */}
      <path
        d="M34 33 C35.5 35 36.5 35 38 33"
        stroke="#f43f5e"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <polygon points="34.5,33 35.5,36 36,33" fill="#ffffff" />
      <polygon points="36,33 36.5,36 37.5,33" fill="#ffffff" />
      {/* Tiny Velvet Bow Tie */}
      <polygon points="34,39 38,39 36,41" fill="#c8102e" />
      <polygon points="33,40 39,40 36,39" fill="#c8102e" />
    </svg>
  );
}

function MatrixSvg() {
  return (
    <svg
      viewBox="0 0 72 56"
      className="companion-svg matrix-svg"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* CRT Outer Glow / Chassis */}
      <rect
        x="18"
        y="14"
        width="36"
        height="34"
        rx="8"
        fill="#001405"
        stroke="#00ff66"
        strokeWidth="1.8"
      />
      {/* Wireframe Rabbit Ears */}
      <path
        className="matrix-ear"
        d="M26 14 L24 3 L29 5 L30 14"
        stroke="#00ff66"
        strokeWidth="1.5"
        fill="#00240a"
      />
      <path
        className="matrix-ear"
        d="M46 14 L48 3 L43 5 L42 14"
        stroke="#00ff66"
        strokeWidth="1.5"
        fill="#00240a"
      />
      {/* Screen scanlines */}
      <line x1="20" y1="20" x2="52" y2="20" stroke="#00ff66" strokeWidth="0.5" opacity="0.3" />
      <line x1="20" y1="26" x2="52" y2="26" stroke="#00ff66" strokeWidth="0.5" opacity="0.3" />
      <line x1="20" y1="32" x2="52" y2="32" stroke="#00ff66" strokeWidth="0.5" opacity="0.3" />
      <line x1="20" y1="38" x2="52" y2="38" stroke="#00ff66" strokeWidth="0.5" opacity="0.3" />
      {/* Terminal Digital Eyes [ • ◡ • ] */}
      <rect x="25" y="24" width="6" height="6" rx="1.5" fill="#00ff66" />
      <rect x="41" y="24" width="6" height="6" rx="1.5" fill="#00ff66" />
      <path
        d="M33 34 C35 36 37 36 39 34"
        stroke="#00ff66"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {/* CLI Prompt string */}
      <text
        x="22"
        y="43"
        fill="#00ff66"
        fontSize="6.5"
        fontFamily="monospace"
        opacity="0.9"
      >
        &gt;_run
      </text>
      {/* Ear Node Sparks */}
      <circle cx="24" cy="3" r="1.5" fill="#d8ffe4" />
      <circle cx="48" cy="3" r="1.5" fill="#d8ffe4" />
    </svg>
  );
}

function OwlSvg() {
  return (
    <svg
      viewBox="0 0 72 56"
      className="companion-svg owl-svg"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Ear Tuft Feathers */}
      <polygon
        points="26,16 23,6 30,12"
        fill="#3f2e20"
        stroke="#c9a45c"
        strokeWidth="0.8"
      />
      <polygon
        points="46,16 49,6 42,12"
        fill="#3f2e20"
        stroke="#c9a45c"
        strokeWidth="0.8"
      />
      {/* Owl Body */}
      <ellipse
        cx="36"
        cy="32"
        rx="15"
        ry="18"
        fill="#2d1f14"
        stroke="#5c4028"
        strokeWidth="1.2"
      />
      {/* Cream Speckled Chest */}
      <ellipse cx="36" cy="37" rx="9" ry="11" fill="#ebdfc4" />
      <path
        d="M33 33 C34 35 38 35 39 33"
        stroke="#8c7355"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M33 38 C34 40 38 40 39 38"
        stroke="#8c7355"
        strokeWidth="1"
        strokeLinecap="round"
      />
      <path
        d="M34 43 C35 44 37 44 38 43"
        stroke="#8c7355"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Wings */}
      <path
        d="M22 28 C20 36 22 44 26 46 C24 40 23 34 25 28 Z"
        fill="#4a3728"
      />
      <path
        d="M50 28 C52 36 50 44 46 46 C48 40 49 34 47 28 Z"
        fill="#4a3728"
      />
      {/* Golden Wire-rim Spectacles */}
      <circle
        cx="30"
        cy="24"
        r="6.2"
        fill="#1b120c"
        stroke="#c9a45c"
        strokeWidth="1.6"
      />
      <circle
        cx="42"
        cy="24"
        r="6.2"
        fill="#1b120c"
        stroke="#c9a45c"
        strokeWidth="1.6"
      />
      <line x1="36.2" y1="24" x2="35.8" y2="24" stroke="#c9a45c" strokeWidth="1.6" />
      {/* Inquisitive Amber Eyes */}
      <circle cx="30" cy="24" r="4.2" fill="#eab308" />
      <circle cx="30" cy="24" r="2.2" fill="#1e130a" />
      <circle cx="31" cy="23" r="1.1" fill="#ffffff" />
      <circle cx="42" cy="24" r="4.2" fill="#eab308" />
      <circle cx="42" cy="24" r="2.2" fill="#1e130a" />
      <circle cx="43" cy="23" r="1.1" fill="#ffffff" />
      {/* Golden Little Beak */}
      <polygon points="34.5,27 37.5,27 36,31" fill="#c9a45c" />
      {/* Tiny Feather Quill */}
      <path
        d="M49 40 C52 32 55 26 58 24 C57 28 55 35 52 42 Z"
        fill="#c9a45c"
      />
    </svg>
  );
}

function CyberpunkSvg() {
  return (
    <svg
      viewBox="0 0 72 56"
      className="companion-svg cyberpunk-svg"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <polygon
        points="26,18 20,4 30,12"
        fill="#0c0c13"
        stroke="#fcee0a"
        strokeWidth="1.4"
      />
      <polygon
        points="46,18 52,4 42,12"
        fill="#0c0c13"
        stroke="#00f0ff"
        strokeWidth="1.4"
      />
      <line x1="20" y1="4" x2="20" y2="1" stroke="#fcee0a" strokeWidth="1.5" />
      <line x1="52" y1="4" x2="52" y2="1" stroke="#00f0ff" strokeWidth="1.5" />
      <polygon
        points="20,24 36,15 52,24 48,44 36,49 24,44"
        fill="#0e1017"
        stroke="#334155"
        strokeWidth="1.5"
      />
      <polygon
        points="22,23 36,17 50,23 48,31 36,34 24,31"
        fill="#051923"
        stroke="#00f0ff"
        strokeWidth="1.8"
      />
      <path
        d="M28 27 L31 25 L34 27"
        stroke="#fcee0a"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M38 27 L41 25 L44 27"
        stroke="#00f0ff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points="34,40 38,40 36,43" fill="#ff2a6d" />
    </svg>
  );
}

function AmberSvg() {
  return (
    <svg
      viewBox="0 0 72 56"
      className="companion-svg amber-svg"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <ellipse
        cx="36"
        cy="32"
        rx="17"
        ry="14"
        fill="#854d0e"
        stroke="#e0a56a"
        strokeWidth="1.5"
      />
      <path
        d="M46 36 C55 36 62 28 58 18 C52 14 46 22 44 28 Z"
        fill="#e0a56a"
      />
      <path
        d="M52 24 C56 22 58 18 56 16 C53 15 50 18 49 22 Z"
        fill="#fef08a"
      />
      <polygon points="23,22 20,12 28,18" fill="#a16207" />
      <polygon points="31,20 33,10 37,17" fill="#a16207" />
      <path
        d="M24 28 C26 30 28 30 30 28"
        stroke="#fef3c7"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <ellipse cx="23" cy="32" rx="2" ry="1.2" fill="#ea580c" opacity="0.6" />
    </svg>
  );
}

function MidnightSvg() {
  return (
    <svg
      viewBox="0 0 72 56"
      className="companion-svg midnight-svg"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M36 28 C24 16 12 18 8 26 C6 34 16 42 28 36 Z"
        fill="#1e293b"
        stroke="#3b82f6"
        strokeWidth="1.4"
      />
      <path
        d="M36 28 C48 16 60 18 64 26 C66 34 56 42 44 36 Z"
        fill="#1e293b"
        stroke="#3b82f6"
        strokeWidth="1.4"
      />
      <circle cx="18" cy="27" r="1.5" fill="#93c5fd" />
      <circle cx="54" cy="27" r="1.5" fill="#93c5fd" />
      <ellipse
        cx="36"
        cy="30"
        rx="9"
        ry="12"
        fill="#0f172a"
        stroke="#60a5fa"
        strokeWidth="1.2"
      />
      <path d="M34 14 A 4 4 0 0 0 38 18 A 3 3 0 0 1 35 15 Z" fill="#93c5fd" />
      <circle cx="33" cy="28" r="1.8" fill="#93c5fd" />
      <circle cx="39" cy="28" r="1.8" fill="#93c5fd" />
    </svg>
  );
}

function ClippySvg() {
  return (
    <svg
      viewBox="0 0 72 56"
      className="companion-svg clippy-svg msn-svg"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="clippyMetal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="35%" stopColor="#cbd5e1" />
          <stop offset="70%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>
      </defs>

      {/* Pastel yellow memo paper behind Clippy */}
      <path
        d="M18 10 L48 8 L54 44 L20 46 Z"
        fill="#fef08a"
        stroke="#fde047"
        strokeWidth="1.2"
        rx="2"
        opacity="0.85"
      />
      {/* Paper horizontal lines */}
      <line x1="24" y1="18" x2="44" y2="17" stroke="#cbd5e1" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
      <line x1="24" y1="25" x2="46" y2="24" stroke="#cbd5e1" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
      <line x1="24" y1="32" x2="42" y2="31" stroke="#cbd5e1" strokeWidth="1" strokeLinecap="round" opacity="0.7" />

      {/* The Paperclip Wire */}
      <path
        d="M28 40 L28 16 C28 9.5 44 9.5 44 16 L44 41 C44 47.5 22 47.5 22 41 L22 23 C22 18 36 18 36 23 L36 37"
        stroke="url(#clippyMetal)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Wire highlight shimmer */}
      <path
        d="M28 40 L28 16 C28 9.5 44 9.5 44 16 L44 41 C44 47.5 22 47.5 22 41 L22 23 C22 18 36 18 36 23 L36 37"
        stroke="#ffffff"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />

      {/* Clippy's iconic big expressive eyes */}
      <ellipse cx="28" cy="22" rx="5.5" ry="7" fill="#ffffff" stroke="#0f172a" strokeWidth="1.2" />
      <ellipse cx="40" cy="22" rx="5.5" ry="7" fill="#ffffff" stroke="#0f172a" strokeWidth="1.2" />

      {/* Eager pupils looking up and forward */}
      <circle cx="27" cy="21.5" r="2.5" fill="#0f172a" />
      <circle cx="28" cy="20.5" r="0.8" fill="#ffffff" />
      <circle cx="39" cy="21.5" r="2.5" fill="#0f172a" />
      <circle cx="40" cy="20.5" r="0.8" fill="#ffffff" />

      {/* Iconic raised curved eyebrows */}
      <path
        d="M22 13 C24 10 30 11 32 14"
        stroke="#0f172a"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M36 14 C38 11 44 10 46 13"
        stroke="#0f172a"
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* Retro MSN butterfly accent pinned onto paper */}
      <path d="M46 38 C44 35 46 32 49 34 C50 36 48 38 46 38 Z" fill="#70c042" />
      <path d="M52 38 C54 35 52 32 49 34 C48 36 50 38 52 38 Z" fill="#ff7043" />
    </svg>
  );
}

function CompanionAvatar({ themeId }: { themeId: string }) {
  if (themeId === "vampire") return <BatSvg />;
  if (themeId === "matrix") return <MatrixSvg />;
  if (themeId === "dark-academia") return <OwlSvg />;
  if (themeId === "cyberpunk") return <CyberpunkSvg />;
  if (themeId === "amber") return <AmberSvg />;
  if (themeId === "midnight") return <MidnightSvg />;
  if (themeId.startsWith("msn")) return <ClippySvg />;
  return <BlahajSvg />;
}

/**
 * Main Companion Component.
 */
export interface BlahajBuddyProps {
  onRollCommand?: (command: string) => void;
}

export function BlahajBuddy({ onRollCommand }: BlahajBuddyProps = {}) {
  const [, startTransition] = useTransition();

  // Active theme tracking
  const [themeId, setThemeId] = useState<string>("cozy");
  const [isThemeEnabled, setIsThemeEnabled] = useState<boolean>(() => {
    if (typeof document !== "undefined" && document.documentElement.dataset.blahaj) {
      return document.documentElement.dataset.blahaj === "on";
    }
    if (typeof window !== "undefined") {
      try {
        return window.localStorage.getItem("huddle-blahaj") === "on";
      } catch {
        return false;
      }
    }
    return false;
  });

  // Position state (persisted to localStorage)
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hasLoadedPos, setHasLoadedPos] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Companion UI state
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"talk" | "timer" | "tools">("talk");
  const [messageIndex, setMessageIndex] = useState<number>(0);
  const [boops, setBoops] = useState<number>(0);
  const [isBooping, setIsBooping] = useState<boolean>(false);
  const [soundMuted, setSoundMuted] = useState<boolean>(false);
  const [sleepDockVisible, setSleepDockVisible] = useState<boolean>(false);

  // Wellness / Focus Timer state
  const [timerSeconds, setTimerSeconds] = useState<number>(25 * 60);
  const [timerTotal, setTimerTotal] = useState<number>(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [timerAlert, setTimerAlert] = useState<string>("");

  // Tools state (Dice, Coin, Scratchpad)
  const [diceResult, setDiceResult] = useState<number | null>(null);
  const [diceType, setDiceType] = useState<string>("d20");
  const [isRolling, setIsRolling] = useState<boolean>(false);
  const [customNotation, setCustomNotation] = useState<string>("");
  const [coinResult, setCoinResult] = useState<string | null>(null);
  const [isFlipping, setIsFlipping] = useState<boolean>(false);
  const [scratchpad, setScratchpad] = useState<string>("");
  const [copiedMemo, setCopiedMemo] = useState<boolean>(false);

  // Drag tracking refs
  const dragRef = useRef<{
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    hasMoved: boolean;
  } | null>(null);

  const companion = COMPANIONS[themeId] || COMPANIONS.cozy;

  // 1. Theme and Enabled state observer
  useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      const activeId = root.dataset.customThemeId || "cozy";
      setThemeId(activeId);
      const isBlahajOn = root.dataset.blahaj
        ? root.dataset.blahaj === "on"
        : (typeof window !== "undefined" && window.localStorage.getItem("huddle-blahaj") === "on");
      setIsThemeEnabled(isBlahajOn);
    };

    read();
    const observer = new MutationObserver(read);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-custom-theme-id", "data-blahaj"],
    });

    const onStorageOrEvent = (e: Event) => {
      if (e.type === "huddle-blahaj-change") {
        const custom = e as CustomEvent<string>;
        setIsThemeEnabled(custom.detail === "on");
      }
    };
    const handleDiceRolled = (e: Event) => {
      const custom = e as CustomEvent<{
        expression?: string;
        total?: number;
      }>;
      if (custom.detail && typeof custom.detail.total === "number") {
        setDiceResult(custom.detail.total);
        if (custom.detail.expression) {
          setDiceType(custom.detail.expression);
        }
        setIsRolling(false);
        if (custom.detail.total === 20) {
          playSynthSound("chime");
        }
      }
    };
    window.addEventListener("huddle-blahaj-change", onStorageOrEvent);
    window.addEventListener("huddle-dice-rolled", handleDiceRolled);

    return () => {
      observer.disconnect();
      window.removeEventListener("huddle-blahaj-change", onStorageOrEvent);
      window.removeEventListener("huddle-dice-rolled", handleDiceRolled);
    };
  }, []);

  // 2. Load stored settings on mount
  useEffect(() => {
    try {
      const savedMute = window.localStorage.getItem("huddle-buddy-sound") === "muted";
      setSoundMuted(savedMute);

      const savedBoops = Number(window.localStorage.getItem("huddle-buddy-boops") || 0);
      setBoops(savedBoops);

      const savedMemo = window.localStorage.getItem("huddle-buddy-memo") || "";
      setScratchpad(savedMemo);

      const savedPos = window.localStorage.getItem("huddle-buddy-pos");
      if (savedPos) {
        const parsed = JSON.parse(savedPos);
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          const clampedX = Math.max(12, Math.min(window.innerWidth - 88, parsed.x));
          const clampedY = Math.max(12, Math.min(window.innerHeight - 88, parsed.y));
          setPos({ x: clampedX, y: clampedY });
          setHasLoadedPos(true);
          return;
        }
      }
    } catch { }

    // Default position: bottom-right corner
    const defaultX = Math.max(16, window.innerWidth - 98);
    const defaultY = Math.max(16, window.innerHeight - 92);
    setPos({ x: defaultX, y: defaultY });
    setHasLoadedPos(true);
  }, []);

  // 3. Keep position inside viewport on resize
  useEffect(() => {
    const handleResize = () => {
      setPos((prev) => {
        const maxX = Math.max(12, window.innerWidth - 88);
        const maxY = Math.max(12, window.innerHeight - 88);
        return {
          x: Math.min(maxX, Math.max(12, prev.x)),
          y: Math.min(maxY, Math.max(12, prev.y)),
        };
      });
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // 4. Timer interval
  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = window.setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          setIsTimerRunning(false);
          setTimerAlert("Ding! Time is up! Great focus. Remember to stretch & drink water!");
          playSynthSound("timer");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isTimerRunning]);

  // 5. Sound toggle
  const toggleSound = () => {
    const next = !soundMuted;
    setSoundMuted(next);
    try {
      window.localStorage.setItem("huddle-buddy-sound", next ? "muted" : "on");
    } catch { }
  };

  // 6. Boop action
  const handleBoop = () => {
    setIsBooping(true);
    setBoops((c) => {
      const next = c + 1;
      try {
        window.localStorage.setItem("huddle-buddy-boops", String(next));
      } catch { }
      return next;
    });
    setMessageIndex((idx) => (idx + 1) % companion.dialogues.length);
    playSynthSound(companion.soundType);

    window.setTimeout(() => {
      setIsBooping(false);
    }, 600);
  };

  // 7. Special Theme Action
  const handleSpecialAction = () => {
    handleBoop();
    showToast(`✨ ${companion.name}: ${companion.specialActionName} activated!`);
  };

  // 8. Put to sleep / Close companion from the widget
  const handlePutToSleep = () => {
    setIsOpen(false);
    startTransition(() => {
      document.documentElement.dataset.blahaj = "off";
      try {
        window.localStorage.setItem("huddle-blahaj", "off");
      } catch { }
      window.dispatchEvent(
        new CustomEvent("huddle-blahaj-change", { detail: "off" }),
      );
      setIsThemeEnabled(false);
      setSleepDockVisible(true);
      showToast(
        `${companion.name} went to sleep 💤. Wake them anytime or toggle in Settings.`,
      );
    });
  };

  // 9. Wake up from sleep dock
  const handleWakeUp = () => {
    startTransition(() => {
      document.documentElement.dataset.blahaj = "on";
      try {
        window.localStorage.setItem("huddle-blahaj", "on");
      } catch { }
      window.dispatchEvent(
        new CustomEvent("huddle-blahaj-change", { detail: "on" }),
      );
      setIsThemeEnabled(true);
      setSleepDockVisible(false);
      showToast(`${companion.name} is awake and happy to see you!`);
      playSynthSound(companion.soundType);
    });
  };

  // 10. Timer presets
  const setTimerPreset = (minutes: number) => {
    setIsTimerRunning(false);
    setTimerSeconds(minutes * 60);
    setTimerTotal(minutes * 60);
    setTimerAlert("");
  };

  // 11. Dice roll - triggers real /roll slash command and 3D tumbling dice
  const executeRoll = (notation: string) => {
    const cleaned = notation.trim();
    if (!cleaned) return;
    setIsRolling(true);
    setDiceType(cleaned.startsWith("1d") ? cleaned.replace("1d", "d") : cleaned);
    setDiceResult(null);
    playSynthSound("dice");

    const command = cleaned.startsWith("/") ? cleaned : `/roll ${cleaned}`;
    if (onRollCommand) {
      onRollCommand(command);
    } else if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("huddle-run-command", { detail: command }),
      );
    }

    // Safety fallback: if offline, no channel or in test environment, simulate outcome after 1.8s
    const fallbackTimer = window.setTimeout(() => {
      setIsRolling((currentlyRolling) => {
        if (!currentlyRolling) return false;
        const match = cleaned.match(/^(\d*)d(\d+)/i);
        const count = match ? Math.min(10, Math.max(1, Number(match[1]) || 1)) : 1;
        const sides = match ? Math.max(2, Number(match[2]) || 20) : 20;
        let sum = 0;
        for (let i = 0; i < count; i++) {
          sum += Math.floor(Math.random() * sides) + 1;
        }
        setDiceResult(sum);
        return false;
      });
    }, 1800);

    return () => window.clearTimeout(fallbackTimer);
  };

  const rollDice = (sides: number) => {
    executeRoll(`1d${sides}`);
  };

  // 12. Coin flip
  const flipCoin = () => {
    setIsFlipping(true);
    playSynthSound("dice");
    const cmd = "/flip";
    if (onRollCommand) {
      onRollCommand(cmd);
    } else if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("huddle-run-command", { detail: cmd }),
      );
    }
    window.setTimeout(() => {
      const res = Math.random() > 0.5 ? "Heads 🪙" : "Tails 🪙";
      setCoinResult(res);
      setIsFlipping(false);
    }, 350);
  };

  // 13. Drag pointer handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: pos.x,
      initialY: pos.y,
      hasMoved: false,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (!dragRef.current.hasMoved && Math.hypot(dx, dy) > 5) {
      dragRef.current.hasMoved = true;
      setIsDragging(true);
    }
    if (dragRef.current.hasMoved) {
      const maxX = Math.max(12, window.innerWidth - 88);
      const maxY = Math.max(12, window.innerHeight - 88);
      const nextX = Math.min(maxX, Math.max(12, dragRef.current.initialX + dx));
      const nextY = Math.min(maxY, Math.max(12, dragRef.current.initialY + dy));
      setPos({ x: nextX, y: nextY });
    }
  };

  const wasDraggedRef = useRef<boolean>(false);

  const handleBuddyClick = () => {
    if (wasDraggedRef.current) {
      wasDraggedRef.current = false;
      return;
    }
    setIsOpen((open) => {
      const next = !open;
      if (next) {
        playSynthSound(companion.soundType);
      }
      return next;
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch { }

    const moved = dragRef.current.hasMoved;
    dragRef.current = null;
    setIsDragging(false);

    if (moved) {
      wasDraggedRef.current = true;
      try {
        window.localStorage.setItem("huddle-buddy-pos", JSON.stringify(pos));
      } catch { }
    }
  };

  // Affection ranking
  const getRank = () => {
    if (boops >= 50) return "👑 Legendary Familiar";
    if (boops >= 30) return "💖 Inseparable Soul";
    if (boops >= 15) return "⭐ Best Companion";
    if (boops >= 5) return "🌸 Good Friend";
    return "🌱 Acquired Friend";
  };

  // Timer format MM:SS
  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  // Compute smart popover position so it never overflows offscreen
  const isRightSide = pos.x > (typeof window !== "undefined" ? window.innerWidth / 2 : 400);
  const isBottomSide = pos.y > (typeof window !== "undefined" ? window.innerHeight / 2 : 400);

  // If companion is disabled or hidden, show discreet wake pill if available
  if (!isThemeEnabled) {
    if (sleepDockVisible) {
      return (
        <aside className="companion-sleep-dock" aria-live="polite">
          <button
            type="button"
            className="companion-wake-btn"
            onClick={handleWakeUp}
            title={`Wake up ${companion.name}`}
            aria-label={`Wake up ${companion.name}`}
          >
            <Moon size={13} className="text-purple-300 animate-pulse" />
            <span>Wake {companion.name}</span>
          </button>
          <button
            type="button"
            className="companion-wake-dismiss"
            onClick={() => setSleepDockVisible(false)}
            aria-label="Dismiss wake button"
            title="Dismiss"
          >
            ×
          </button>
        </aside>
      );
    }
    return null;
  }

  return (
    <aside
      className={`blahaj-buddy companion-shell theme-${companion.id}${isOpen ? " open" : ""
        }${isDragging ? " dragging" : ""}`}
      style={{
        left: hasLoadedPos ? `${pos.x}px` : "auto",
        top: hasLoadedPos ? `${pos.y}px` : "auto",
        right: hasLoadedPos ? "auto" : "18px",
        bottom: hasLoadedPos ? "auto" : "14px",
      }}
      aria-live="polite"
    >
      {/* Interactive Companion Popover Card */}
      {isOpen && (
        <div
          className={`companion-popover align-${isRightSide ? "left" : "right"} align-v-${isBottomSide ? "top" : "bottom"
            }`}
          role="dialog"
          aria-label={`${companion.name} desktop companion`}
        >
          {/* Card Header */}
          <header className="companion-popover-head">
            <div className="companion-head-info">
              <span className="companion-badge-pill">{companion.badge}</span>
              <strong className="companion-name">{companion.name}</strong>
            </div>

            <div className="companion-head-actions">
              <span className="drag-hint" title="Drag the buddy to move anywhere on screen">
                <GripHorizontal size={13} />
              </span>
              <button
                type="button"
                className="head-icon-btn"
                onClick={toggleSound}
                title={soundMuted ? "Unmute sounds" : "Mute sounds"}
                aria-label={soundMuted ? "Unmute sounds" : "Mute sounds"}
              >
                {soundMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
              </button>
              <button
                type="button"
                className="head-icon-btn sleep-btn"
                onClick={handlePutToSleep}
                title="Put companion to sleep (closes widget)"
                aria-label="Put companion to sleep"
              >
                <Moon size={13} />
              </button>
              <button
                type="button"
                className="head-icon-btn close-btn"
                onClick={() => setIsOpen(false)}
                title="Close dialog"
                aria-label="Close dialog"
              >
                <X size={13} />
              </button>
            </div>
          </header>

          {/* Navigation Tabs */}
          <nav className="companion-tabs" aria-label="Companion modes">
            <button
              type="button"
              className={`companion-tab-btn${activeTab === "talk" ? " active" : ""}`}
              onClick={() => setActiveTab("talk")}
            >
              <MessageSquare size={12} />
              <span>Talk</span>
            </button>
            <button
              type="button"
              className={`companion-tab-btn${activeTab === "timer" ? " active" : ""}`}
              onClick={() => setActiveTab("timer")}
            >
              <Timer size={12} />
              <span>Focus</span>
            </button>
            <button
              type="button"
              className={`companion-tab-btn${activeTab === "tools" ? " active" : ""}`}
              onClick={() => setActiveTab("tools")}
            >
              <Wrench size={12} />
              <span>Tools</span>
            </button>
          </nav>

          {/* Tab 1: Talk & Companionship */}
          {activeTab === "talk" && (
            <div className="companion-tab-body talk-tab">
              <div className="companion-dialogue-box">
                <p className="dialogue-text">
                  &ldquo;{companion.dialogues[messageIndex % companion.dialogues.length]}&rdquo;
                </p>
                <div className="dialogue-meta">
                  <span className="affection-rank">{getRank()}</span>
                  <span className="boop-count">
                    {boops} {boops === 1 ? "boop" : "boops"}
                  </span>
                </div>
              </div>

              <div className="companion-talk-actions">
                <button
                  type="button"
                  className="companion-btn primary"
                  onClick={handleBoop}
                >
                  <Heart size={13} className="heart-icon animate-pulse" />
                  <span>Boop {companion.name}</span>
                </button>
                <button
                  type="button"
                  className="companion-btn secondary"
                  onClick={() => {
                    setMessageIndex((i) => (i + 1) % companion.dialogues.length);
                    playSynthSound(companion.soundType);
                  }}
                >
                  <Sparkles size={13} />
                  <span>New Thought</span>
                </button>
              </div>

              <button
                type="button"
                className="companion-special-btn"
                onClick={handleSpecialAction}
                title={companion.specialActionDesc}
              >
                <span className="special-icon">{companion.specialParticle}</span>
                <span className="special-title">{companion.specialActionName}</span>
              </button>
            </div>
          )}

          {/* Tab 2: Focus & Wellness Timer */}
          {activeTab === "timer" && (
            <div className="companion-tab-body timer-tab">
              <div className="timer-display-card">
                <div className="timer-digits">{formatTimer(timerSeconds)}</div>
                <div className="timer-progress-track">
                  <div
                    className="timer-progress-fill"
                    style={{
                      width: `${timerTotal > 0
                        ? Math.min(100, ((timerTotal - timerSeconds) / timerTotal) * 100)
                        : 0
                        }%`,
                    }}
                  />
                </div>
                {timerAlert && <p className="timer-alert-msg">{timerAlert}</p>}
              </div>

              <div className="timer-presets">
                <button
                  type="button"
                  className="preset-chip"
                  onClick={() => setTimerPreset(5)}
                >
                  5m Rest
                </button>
                <button
                  type="button"
                  className="preset-chip"
                  onClick={() => setTimerPreset(15)}
                >
                  15m Sprint
                </button>
                <button
                  type="button"
                  className="preset-chip active"
                  onClick={() => setTimerPreset(25)}
                >
                  25m Pomodoro
                </button>
              </div>

              <div className="timer-controls">
                <button
                  type="button"
                  className={`companion-btn ${isTimerRunning ? "pause" : "primary"}`}
                  onClick={() => {
                    setIsTimerRunning((r) => !r);
                    setTimerAlert("");
                    playSynthSound("chime");
                  }}
                >
                  {isTimerRunning ? <Pause size={13} /> : <Play size={13} />}
                  <span>{isTimerRunning ? "Pause" : "Start"}</span>
                </button>
                <button
                  type="button"
                  className="companion-btn secondary"
                  onClick={() => {
                    setIsTimerRunning(false);
                    setTimerSeconds(timerTotal);
                    setTimerAlert("");
                  }}
                >
                  <RotateCcw size={13} />
                  <span>Reset</span>
                </button>
              </div>

              <div className="wellness-check-row">
                <Coffee size={13} className="text-amber-400" />
                <span>Hydration &amp; posture check: sip some water &amp; roll shoulders</span>
              </div>
            </div>
          )}

          {/* Tab 3: Handy Desk Tools */}
          {activeTab === "tools" && (
            <div className="companion-tab-body tools-tab">
              {/* Dice & Coin Row */}
              <div className="tools-card dice-card">
                <div className="tools-card-head">
                  <span className="tools-title">Dice &amp; Decision</span>
                  {isRolling ? (
                    <span className="dice-badge rolling">
                      🎲 Rolling 3D dice...
                    </span>
                  ) : diceResult !== null ? (
                    <span
                      className={`dice-badge${diceResult === 20 ? " crit-high" : ""}${diceResult === 1 ? " crit-low" : ""
                        }`}
                    >
                      {diceType}: <strong>{diceResult}</strong>
                      {diceResult === 20 ? " ✨ Nat 20!" : ""}
                      {diceResult === 1 ? " 💀 Nat 1" : ""}
                    </span>
                  ) : null}
                  {coinResult && <span className="coin-badge">{coinResult}</span>}
                </div>

                <div className="tools-btn-grid">
                  <button
                    type="button"
                    className="tool-btn"
                    disabled={isRolling}
                    onClick={() => rollDice(20)}
                    aria-label="Roll d20"
                  >
                    🎲 Roll d20
                  </button>
                  <button
                    type="button"
                    className="tool-btn"
                    disabled={isRolling}
                    onClick={() => rollDice(6)}
                    aria-label="Roll d6"
                  >
                    🎲 Roll d6
                  </button>
                  <button
                    type="button"
                    className="tool-btn"
                    disabled={isRolling}
                    onClick={() => rollDice(100)}
                    aria-label="Roll d100"
                  >
                    🎲 Roll d100
                  </button>
                  <button
                    type="button"
                    className="tool-btn"
                    disabled={isFlipping}
                    onClick={flipCoin}
                    aria-label="Flip Coin"
                  >
                    🪙 Flip Coin
                  </button>
                </div>

                {/* Custom /roll notation input */}
                <form
                  className="companion-custom-roll"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (customNotation.trim()) {
                      executeRoll(customNotation.trim());
                    }
                  }}
                >
                  <input
                    type="text"
                    className="companion-roll-input"
                    value={customNotation}
                    onChange={(e) => setCustomNotation(e.target.value)}
                    placeholder="e.g. 2d6+3 or d20 adv"
                    aria-label="Custom dice expression"
                    disabled={isRolling}
                  />
                  <button
                    type="submit"
                    className="companion-roll-submit"
                    disabled={isRolling || !customNotation.trim()}
                    aria-label="Submit custom roll"
                  >
                    Roll
                  </button>
                </form>
              </div>

              {/* Sticky Memo / Scratchpad */}
              <div className="tools-card memo-card">
                <div className="tools-card-head">
                  <span className="tools-title">Quick Scratchpad</span>
                  <div className="memo-actions">
                    <button
                      type="button"
                      className="memo-tool-btn"
                      onClick={() => {
                        if (scratchpad) {
                          void navigator.clipboard.writeText(scratchpad);
                          setCopiedMemo(true);
                          window.setTimeout(() => setCopiedMemo(false), 1400);
                        }
                      }}
                      title="Copy memo to clipboard"
                    >
                      {copiedMemo ? <Check size={11} /> : <Copy size={11} />}
                      <span>{copiedMemo ? "Copied" : "Copy"}</span>
                    </button>
                    {scratchpad && (
                      <button
                        type="button"
                        className="memo-tool-btn"
                        onClick={() => {
                          setScratchpad("");
                          try {
                            window.localStorage.removeItem("huddle-buddy-memo");
                          } catch { }
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  className="companion-memo-input"
                  rows={3}
                  value={scratchpad}
                  onChange={(e) => {
                    const text = e.target.value;
                    setScratchpad(text);
                    try {
                      window.localStorage.setItem("huddle-buddy-memo", text);
                    } catch { }
                  }}
                  placeholder="Jot room codes, notes, or links..."
                  spellCheck={false}
                />
              </div>
            </div>
          )}

          {/* Card Footer: Close Companion option */}
          <footer className="companion-popover-foot">
            <button
              type="button"
              className="companion-sleep-link"
              onClick={handlePutToSleep}
              title="Hide this desktop buddy widget"
            >
              <span>💤 Put {companion.name} to sleep</span>
            </button>
          </footer>
        </div>
      )}

      {/* The Draggable Companion Avatar Button */}
      <button
        type="button"
        className={`blahaj-boop companion-avatar-btn${isBooping ? " booping" : ""}`}
        onClick={handleBuddyClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        aria-label={`Boop ${companion.name} or drag to reposition`}
        title={`Click to open ${companion.name} · Drag to move anywhere`}
      >
        <span className="blahaj-spark one" aria-hidden="true">
          <Sparkles size={14} />
        </span>
        <span className="blahaj-spark two" aria-hidden="true">
          <Heart size={14} />
        </span>
        <span className="companion-icon-wrap" aria-hidden="true">
          <CompanionAvatar themeId={themeId} />
        </span>
      </button>
    </aside>
  );
}
