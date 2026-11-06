import type { ReactNode } from "react";
import { Hoffy } from "./hoffy";
import type { LandingCopy } from "./landing-copy";

/**
 * The small scenes on hoffle.online's feature cards: a movie night, the music
 * bot, a battlemap and a chat. They are drawn with the app's own dark colours
 * rather than shot from it, so they stay sharp at card size, and they use the
 * made-up crew from the demo screenshots, never real people.
 *
 * Each one is hidden from screen readers: the card's words say the same thing.
 * Keep them honest. If a feature leaves the app, it leaves its scene too.
 */

type Scenes = LandingCopy["features"]["scenes"];

const CREW = {
  Kai: "#7fd6c2",
  Mira: "#f6d578",
  Lou: "#b9a6f7",
  Sam: "#a5dc9c",
  Bea: "#f4a77c",
  Jonas: "#f3a6bd",
};

type Name = keyof typeof CREW;

function Avatar({ name, size = 36, speaking = false }: { name: Name; size?: number; speaking?: boolean }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-bold text-[#15121f] ${speaking ? "ring-2 ring-[#3ba55d] ring-offset-2 ring-offset-[#1a1724]" : ""}`}
      style={{ width: size, height: size, background: CREW[name], fontSize: Math.round(size * 0.42) }}
    >
      {name[0]}
    </span>
  );
}

/** An app window that rises out of the bottom of its card. */
function Window({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden className="w-full select-none overflow-hidden rounded-t-xl border border-b-0 border-white/10 bg-[#1a1724] text-[#e8e3f5]">
      {children}
    </div>
  );
}

function TitleBar({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-[13px] font-semibold">{children}</div>;
}

function Speaker() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#9d95bc]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
    </svg>
  );
}

/** A dusk over hills: stands in for whatever film is being shared. */
function Dusk() {
  return (
    <svg viewBox="0 0 480 270" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
      <defs>
        <linearGradient id="lp-dusk-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b1f5c" />
          <stop offset=".5" stopColor="#7a3f8f" />
          <stop offset=".8" stopColor="#ee8a5d" />
          <stop offset="1" stopColor="#f9c66b" />
        </linearGradient>
      </defs>
      <rect width="480" height="270" fill="url(#lp-dusk-sky)" />
      <circle cx="318" cy="150" r="44" fill="#ffe3a3" />
      <g fill="#fff" opacity=".7">
        <circle cx="62" cy="38" r="1.6" />
        <circle cx="140" cy="66" r="1.2" />
        <circle cx="214" cy="30" r="1.4" />
        <circle cx="402" cy="44" r="1.6" />
        <circle cx="448" cy="86" r="1.2" />
      </g>
      <path d="M0 196c60-34 118-40 176-18s118 26 176 4 90-24 128-10v98H0z" fill="#4b2c6e" />
      <path d="M0 226c74-30 150-24 214-6s150 18 266-18v68H0z" fill="#2c1b4f" />
      <path d="M0 252c96-20 196-14 276-4s150 2 204-10v32H0z" fill="#170f2e" />
    </svg>
  );
}

export function CallScene({ s }: { s: Scenes }) {
  const people: { name: Name; speaking?: boolean }[] = [{ name: "Mira", speaking: true }, { name: "Kai" }, { name: "Lou" }, { name: "Sam" }];
  return (
    <Window>
      <TitleBar>
        <Speaker />
        {s.movieNight}
        <span className="ml-auto rounded bg-[#e5484d] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">{s.live}</span>
        <span className="text-xs font-medium text-[#9d95bc]">1080p · 60 fps</span>
      </TitleBar>
      <div className="grid grid-cols-[1fr_auto] gap-3 p-3 pb-4">
        <div className="relative aspect-video overflow-hidden rounded-lg max-sm:aspect-auto">
          <Dusk />
          <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white">{s.sharing}</span>
        </div>
        <div className="flex flex-col justify-around gap-2 px-1">
          {people.map((person) => (
            <Avatar key={person.name} name={person.name} size={40} speaking={person.speaking} />
          ))}
        </div>
      </div>
    </Window>
  );
}

export function MusicScene({ s }: { s: Scenes }) {
  const listeners: Name[] = ["Kai", "Mira", "Lou", "Sam"];
  return (
    <Window>
      <div className="p-4 pb-5">
        <div className="flex items-center gap-3.5">
          <span className="h-16 w-16 shrink-0 rounded-lg bg-[linear-gradient(135deg,#f6d578,#f4a77c_45%,#6a4ddb)]" />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">Late Train Home</p>
            <p className="truncate text-[13px] text-[#9d95bc]">Paper Moons</p>
          </div>
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-[42%] rounded-full bg-[#8b72f0]" />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-[#9d95bc]">
          <span>1:24</span>
          <span>3:18</span>
        </div>
        <div className="mt-3 flex items-center gap-2.5">
          <span className="flex -space-x-1.5">
            {listeners.map((name) => (
              <span key={name} className="rounded-full ring-2 ring-[#1a1724]">
                <Avatar name={name} size={24} />
              </span>
            ))}
          </span>
          <span className="text-[13px] text-[#c9c3dc]">{s.sameSecond}</span>
        </div>
        <div className="mt-4 space-y-1 text-[14px] leading-snug">
          <p className="text-[#7e7796]">the platform lights are fading out</p>
          <p className="font-semibold">and you are still on the line</p>
        </div>
        <div className="mt-4 rounded-lg bg-white/[.05] px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9d95bc]">{s.upNext}</p>
          <p className="mt-2 flex items-center justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate">Syrup Season</span>
            <Avatar name="Bea" size={22} />
          </p>
          <p className="mt-2 flex items-center justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate">Slow Sunday</span>
            <Avatar name="Jonas" size={22} />
          </p>
        </div>
      </div>
    </Window>
  );
}

/** A dungeon room on a square grid, with fog of war over the part nobody has seen. */
export function GameScene({ s }: { s: Scenes }) {
  const tokens: { name: Name; x: number; y: number }[] = [
    { name: "Kai", x: 105, y: 165 },
    { name: "Mira", x: 165, y: 135 },
    { name: "Lou", x: 165, y: 195 },
  ];
  return (
    <Window>
      <div className="relative">
        <svg viewBox="0 0 480 340" className="block h-auto w-full">
          <defs>
            <pattern id="lp-map-grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <rect width="30" height="30" fill="#2c2739" />
              <path d="M30 0H0v30" fill="none" stroke="#3d3650" strokeWidth="1" />
            </pattern>
            <linearGradient id="lp-map-fog" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#0f0d15" stopOpacity="0" />
              <stop offset=".55" stopColor="#0f0d15" stopOpacity=".92" />
              <stop offset="1" stopColor="#0f0d15" />
            </linearGradient>
          </defs>
          <rect width="480" height="340" fill="#15121f" />
          <rect x="30" y="30" width="240" height="270" fill="url(#lp-map-grid)" stroke="#57506d" strokeWidth="3" />
          <rect x="270" y="135" width="90" height="60" fill="url(#lp-map-grid)" />
          <rect x="360" y="75" width="120" height="180" fill="url(#lp-map-grid)" stroke="#57506d" strokeWidth="3" />
          <rect x="52" y="52" width="46" height="26" rx="3" fill="#57473a" />
          <circle cx="240" cy="60" r="9" fill="#f4a77c" opacity=".85" />
          <circle cx="240" cy="60" r="20" fill="#f4a77c" opacity=".14" />
          {tokens.map((token) => (
            <g key={token.name}>
              <circle cx={token.x} cy={token.y} r="14" fill={CREW[token.name]} stroke="#15121f" strokeWidth="2" />
              <text x={token.x} y={token.y + 5} textAnchor="middle" fontSize="14" fontWeight="700" fill="#15121f">
                {token.name[0]}
              </text>
            </g>
          ))}
          <rect x="250" y="0" width="230" height="340" fill="url(#lp-map-fog)" />
        </svg>
        <div className="absolute bottom-4 right-4 flex items-center gap-2.5 rounded-xl bg-[#231f30]/95 py-2 pl-2 pr-3.5 ring-1 ring-white/10">
          <span className="grid h-11 w-11 place-items-center bg-[#8b72f0] text-[15px] font-bold text-white [clip-path:polygon(50%_0,95%_25%,95%_75%,50%_100%,5%_75%,5%_25%)]">17</span>
          <span className="text-[13px] font-medium">{s.rolled}</span>
        </div>
      </div>
    </Window>
  );
}

/** Heights of a voice message's waveform, in pixels. */
const WAVE = [6, 10, 16, 9, 14, 20, 12, 7, 15, 18, 10, 6, 12, 16, 8, 5, 9, 13, 7, 4];

function Message({ name, children }: { name: Name; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <Avatar name={name} size={34} />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold">{name}</p>
        <div className="mt-0.5 text-[14px] leading-snug text-[#d6d0e6]">{children}</div>
      </div>
    </div>
  );
}

export function ChatScene({ s }: { s: Scenes }) {
  return (
    <Window>
      <TitleBar>
        <span className="text-[#9d95bc]">#</span>
        general
      </TitleBar>
      <div className="relative space-y-4 p-4 pb-5">
        <Message name="Kai">{s.chatKai}</Message>
        <Message name="Mira">
          {s.chatMira}
          <span className="mt-1.5 flex gap-1.5 text-xs">
            <span className="rounded-md bg-[#8b72f0]/25 px-1.5 py-0.5 ring-1 ring-[#8b72f0]/60">🍿 3</span>
            <span className="rounded-md bg-white/[.06] px-1.5 py-0.5">❤️ 2</span>
          </span>
        </Message>
        <Message name="Lou">
          <span className="mt-1 inline-flex items-center gap-2.5 rounded-full bg-white/[.07] py-1.5 pl-2 pr-3.5">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-[#8b72f0] text-[9px] text-white">▶</span>
            <span className="flex h-5 items-center gap-[2px]">
              {WAVE.map((height, i) => (
                <span key={i} className="w-[2px] rounded-full bg-[#c9c3dc]" style={{ height }} />
              ))}
            </span>
            <span className="text-[11px] tabular-nums text-[#9d95bc]">0:07</span>
          </span>
        </Message>
        <div className="absolute bottom-3 right-3 hidden sm:block">
          <Hoffy size={84} motion="none" id="hoffy-sticker" label="" />
        </div>
      </div>
    </Window>
  );
}
