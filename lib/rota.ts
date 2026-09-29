/**
 * Rota: connect two countries by naming the ones in between. Players take
 * turns naming a country; whoever's guess first links the start to the end
 * through bordering countries wins. Played alone, it's you against the
 * guess limit. Names can be typed in English or Turkish. Each guess is graded by how far off the
 * shortest route it strays, so you can tell when you're getting warm.
 */
import { ROTA_COUNTRIES, ROTA_TR } from "./rota-data";

export interface RotaGuess {
  name: string;
  by: 0 | 1;
  /** Extra steps compared with the shortest route through this country. */
  off: number;
}

export interface RotaState {
  start: string;
  end: string;
  /** Countries strictly between start and end on a shortest route. */
  shortest: number;
  guesses: RotaGuess[];
  /** Filled in once the game ends: a shortest route, start to end. */
  route?: string[];
}

/** Draw when the pair has made this many guesses without connecting. */
export function rotaGuessLimit(shortest: number): number {
  return shortest * 2 + 8;
}

const ALIASES: Record<string, string> = {
  usa: "United States",
  us: "United States",
  america: "United States",
  uk: "United Kingdom",
  britain: "United Kingdom",
  "great britain": "United Kingdom",
  england: "United Kingdom",
  drc: "DR Congo",
  "democratic republic of the congo": "DR Congo",
  "congo kinshasa": "DR Congo",
  "congo brazzaville": "Congo",
  "republic of the congo": "Congo",
  "cote d'ivoire": "Ivory Coast",
  "czech republic": "Czechia",
  holland: "Netherlands",
  "the netherlands": "Netherlands",
  burma: "Myanmar",
  swaziland: "Eswatini",
  macedonia: "North Macedonia",
  uae: "United Arab Emirates",
  "east timor": "Timor-Leste",
  turkiye: "Turkey",
  "south korea": "South Korea",
  korea: "South Korea",
  "north korea": "North Korea",
  car: "Central African Republic",
  abd: "United States",
  amerika: "United States",
  ingiltere: "United Kingdom",
  "guney kibris": "Cyprus",
  "kongo demokratik cumhuriyeti": "DR Congo",
  "cek cumhuriyeti": "Czechia",
  bosnia: "Bosnia and Herzegovina",
  png: "Papua New Guinea",
};

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ı/g, "i")
    .replace(/[.’]/g, (c) => (c === "’" ? "'" : ""))
    .replace(/\s+/g, " ")
    .trim();
}

const BY_FOLDED = new Map<string, string>();
for (const name of Object.keys(ROTA_COUNTRIES)) BY_FOLDED.set(fold(name), name);
for (const [name, tr] of Object.entries(ROTA_TR)) BY_FOLDED.set(fold(tr), name);
for (const [alias, name] of Object.entries(ALIASES)) BY_FOLDED.set(fold(alias), name);

/** The map's name for what someone typed, or null. */
export function findCountry(typed: string): string | null {
  return BY_FOLDED.get(fold(String(typed).slice(0, 80))) ?? null;
}

export const ROTA_NAMES = Object.keys(ROTA_COUNTRIES).sort();

/** Steps from `from` to every country reachable through `allowed` (all, if omitted). */
function distances(from: string, allowed?: Set<string>): Map<string, number> {
  const dist = new Map([[from, 0]]);
  const queue = [from];
  while (queue.length) {
    const here = queue.shift()!;
    for (const next of ROTA_COUNTRIES[here]?.borders ?? []) {
      if (dist.has(next) || (allowed && !allowed.has(next))) continue;
      dist.set(next, dist.get(here)! + 1);
      queue.push(next);
    }
  }
  return dist;
}

function route(from: string, to: string, allowed?: Set<string>): string[] | null {
  const back = distances(to, allowed);
  if (!back.has(from)) return null;
  const path = [from];
  let here = from;
  while (here !== to) {
    here = ROTA_COUNTRIES[here].borders.find(
      (n) => back.get(n) === back.get(here)! - 1 && (!allowed || allowed.has(n)),
    )!;
    path.push(here);
  }
  return path;
}

/** Picks a start and end 3–6 countries apart. `random` is injectable for tests. */
export function newRota(random: () => number = Math.random): RotaState {
  for (;;) {
    const start = ROTA_NAMES[Math.floor(random() * ROTA_NAMES.length)];
    const reach = [...distances(start)].filter(([, d]) => d >= 4 && d <= 7);
    if (!reach.length) continue;
    const [end, d] = reach[Math.floor(random() * reach.length)];
    return { start, end, shortest: d - 1, guesses: [] };
  }
}

export type RotaResult =
  | { rota: RotaState; connected: boolean; exhausted: boolean }
  | { error: string };

/** One guess by seat `by`. */
export function guessRota(state: RotaState, by: 0 | 1, typed: unknown): RotaResult {
  const name = findCountry(String(typed ?? ""));
  if (!name) return { error: "That's not a country on the map." };
  if (name === state.start || name === state.end) return { error: `${name} is already on the map.` };
  if (state.guesses.some((g) => g.name === name)) return { error: `${name} has already been guessed.` };
  const fromStart = distances(state.start).get(name);
  const toEnd = distances(state.end).get(name);
  const off = fromStart === undefined || toEnd === undefined ? 99 : fromStart + toEnd - (state.shortest + 1);
  const guesses = [...state.guesses, { name, by, off }];
  const allowed = new Set([state.start, state.end, ...guesses.map((g) => g.name)]);
  const linked = route(state.start, state.end, allowed);
  const exhausted = !linked && guesses.length >= rotaGuessLimit(state.shortest);
  const next: RotaState = { ...state, guesses };
  if (linked) next.route = linked;
  else if (exhausted) next.route = route(state.start, state.end) ?? undefined;
  return { rota: next, connected: Boolean(linked), exhausted };
}

export type RotaLang = "en" | "tr";

/** A country's name in the viewer's language. */
export function countryName(name: string, lang: RotaLang): string {
  return lang === "tr" ? ROTA_TR[name] ?? name : name;
}

/** Shows a shortest route, for when the game ends without one being found. */
export function revealRota(state: RotaState): RotaState {
  return state.route ? state : { ...state, route: route(state.start, state.end) ?? undefined };
}
