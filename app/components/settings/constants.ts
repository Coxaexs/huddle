"use client";



export const BANNER_PRESETS = [
  { id: "synthwave", name: "Synthwave Sunset", css: "linear-gradient(135deg, #ff007f, #7928ca, #ff0080)" },
  { id: "nebula", name: "Cosmic Nebula", css: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" },
  { id: "cyberpunk", name: "Cyber Matrix", css: "linear-gradient(135deg, #001100, #003b00, #00ff66)" },
  { id: "aurora", name: "Northern Aurora", css: "linear-gradient(135deg, #0575e6, #00f260)" },
  { id: "sakura", name: "Sakura Blossom", css: "linear-gradient(135deg, #fbc2eb, #a6c1ee)" },
  { id: "midnight", name: "Midnight Velvet", css: "linear-gradient(135deg, #180b2c, #3a1c71, #d76d77)" },
  { id: "ocean", name: "Deep Ocean", css: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)" },
  { id: "carbon", name: "Dark Carbon", css: "linear-gradient(135deg, #141517, #23272a, #111214)" },
];
export const AVATAR_FRAMES = [
  { id: "none", name: "Clean", desc: "Classic avatar" },
  { id: "neon", name: "💫 Neon Pulse", desc: "Vibrant cyan glowing aura" },
  { id: "rainbow", name: "🌈 Rainbow Halo", desc: "Rotating prismatic ring" },
  { id: "cyber", name: "⚡ Cyber Glitch", desc: "Terminal glitch matrix frame" },
  { id: "gold", name: "👑 Royal Gold", desc: "Shimmering luxury gold ring" },
  { id: "sakura", name: "🌸 Sakura Blossom", desc: "Soft pastel floral halo" },
  { id: "diamond", name: "💎 Diamond Cut", desc: "Angular cyber diamond border" },
];
export const COLOR_SWATCHES = [
  "#5865F2", // Discord Blurple
  "#57F287", // Green
  "#FEE75C", // Yellow
  "#EB459E", // Fuchsia
  "#ED4245", // Red
  "#9d8cf5", // Lavender
  "#38bdf8", // Sky Blue
  "#06b6d4", // Cyan
  "#10b981", // Emerald
  "#f97316", // Orange
  "#ec4899", // Pink
  "#a855f7", // Purple
  "#6366f1", // Indigo
  "#e11d48", // Crimson
  "#14b8a6", // Teal
  "#e2e8f0", // Silver White
];
export const STATUS_EMOJIS = [
  "💬", "🎮", "🎧", "💻", "☕", "✨", "🌙", "🔥", "🚀", "🐱", "🎨", "🎵", "💤", "🍕", "🌸", "⚡"
];
export const PROFILE_CSS_SNIPPETS = [
  {
    name: "✨ Glow Aura",
    snippet: "\n.profile-card {\n  box-shadow: 0 0 25px rgba(168, 85, 247, 0.45) !important;\n  border: 1px solid rgba(168, 85, 247, 0.5) !important;\n}\n",
  },
  {
    name: "🌈 Gradient Name",
    snippet: "\n.profile-display-name {\n  background: linear-gradient(90deg, #ff007f, #00f2fe) !important;\n  -webkit-background-clip: text !important;\n  -webkit-text-fill-color: transparent !important;\n}\n",
  },
  {
    name: "📺 CRT Scanlines",
    snippet: "\n.profile-card::after {\n  content: '' !important;\n  position: absolute !important;\n  inset: 0 !important;\n  background: repeating-linear-gradient(0deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 2px) !important;\n  pointer-events: none !important;\n}\n",
  },
  {
    name: "🧊 Glass Card",
    snippet: "\n.profile-card {\n  background: rgba(18, 19, 26, 0.7) !important;\n  backdrop-filter: blur(16px) !important;\n  border: 1px solid rgba(255, 255, 255, 0.12) !important;\n}\n",
  },
  {
    name: "💫 Float Motion",
    snippet: "\n@keyframes floatAnim {\n  0%, 100% { transform: translateY(0); }\n  50% { transform: translateY(-6px); }\n}\n.profile-card-avatar-wrap {\n  animation: floatAnim 3.5s ease-in-out infinite !important;\n}\n",
  },
];