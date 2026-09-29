"use client";

import { useMemo, useState } from "react";
import { ROTA_COUNTRIES, ROTA_SEA, ROTA_SEA_ENDS } from "@/lib/rota-data";
import {
  ROTA_NAMES,
  countryName,
  findCountry,
  rotaGuessLimit,
  type RotaLang,
  type RotaState,
} from "@/lib/rota";
import { ROTA_PATHS } from "../lib/rota-map";

/** How a guess is graded: on a shortest route, one step off, or further. */
function grade(off: number): "hit" | "near" | "far" {
  return off <= 0 ? "hit" : off === 1 ? "near" : "far";
}

const TEXT = {
  en: {
    notCountry: "That's not a country on the map.",
    shortest: (n: number) =>
      `Shortest route: ${n} ${n === 1 ? "country" : "countries"} between`,
    guesses: "guesses",
    route: "Route",
    placeholder: "Name a country…",
    guess: "Guess",
    legend: ["On a shortest route", "1 step longer", "2+ steps longer"],
    theirs: "dashed = second player's guess",
    sea: "dotted line = sea crossing",
    map: (a: string, b: string) => `Map from ${a} to ${b}`,
  },
  tr: {
    notCountry: "Haritada böyle bir ülke yok.",
    shortest: (n: number) => `En kısa rota: arada ${n} ülke`,
    guesses: "tahmin",
    route: "Rota",
    placeholder: "Bir ülke yaz…",
    guess: "Tahmin et",
    legend: ["En kısa rotada", "1 adım uzun", "2+ adım uzun"],
    theirs: "kesikli = ikinci oyuncunun tahmini",
    sea: "noktalı çizgi = deniz geçişi",
    map: (a: string, b: string) => `${a} ile ${b} arası harita`,
  },
};

const LANG_KEY = "huddle:rota-lang";

/** Turkish for Turkish browsers, unless the viewer picked otherwise. */
function initialLang(): RotaLang {
  try {
    const saved = window.localStorage.getItem(LANG_KEY);
    if (saved === "en" || saved === "tr") return saved;
  } catch {
    // Storage can be blocked; fall back to the browser language.
  }
  return typeof navigator !== "undefined" &&
    navigator.language.toLowerCase().startsWith("tr")
    ? "tr"
    : "en";
}

type Point = { x: number; y: number };

/** The points a link between neighbours is drawn through: middle, shore, shore, middle. */
function linkPoints(a: string, b: string): Point[] {
  const shores =
    ROTA_SEA_ENDS[`${a}|${b}`] ??
    [...(ROTA_SEA_ENDS[`${b}|${a}`] ?? [])].reverse();
  return [ROTA_COUNTRIES[a], ...shores, ROTA_COUNTRIES[b]];
}

/** Straight segments through the points, wrapping round the map's edges across the date line. */
function segments(points: Point[]): Array<[Point, Point]> {
  const out: Array<[Point, Point]> = [];
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i - 1];
    const q = points[i];
    if (Math.abs(p.x - q.x) <= 500) {
      out.push([p, q]);
      continue;
    }
    const [left, right] = p.x < q.x ? [p, q] : [q, p];
    const y = (left.y + right.y) / 2;
    out.push([right, { x: 1000, y }], [{ x: 0, y }, left]);
  }
  return out;
}

/**
 * Rota's map and guess box: the two countries to link, every guess coloured
 * by how close to a shortest route it is, zoomed to where the action is.
 */
export function RotaBoard({
  rota,
  canGuess,
  busy,
  onGuess,
}: {
  rota: RotaState;
  canGuess: boolean;
  busy: boolean;
  onGuess: (country: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [lang, setLang] = useState<RotaLang>(initialLang);
  const t = TEXT[lang];
  const label = (name: string) => countryName(name, lang);
  const names = useMemo(
    () =>
      ROTA_NAMES.map((name) => countryName(name, lang)).sort((a, b) =>
        a.localeCompare(b, lang),
      ),
    [lang],
  );

  function pickLang(next: RotaLang) {
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      // Only a convenience.
    }
  }
  const start = ROTA_COUNTRIES[rota.start];
  const end = ROTA_COUNTRIES[rota.end];

  const viewBox = useMemo(() => {
    const points = [rota.start, rota.end, ...rota.guesses.map((g) => g.name)]
      .map((name) => ROTA_COUNTRIES[name])
      .filter(Boolean);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const x0 = Math.min(...xs) - 50;
    const x1 = Math.max(...xs) + 50;
    const y0 = Math.min(...ys) - 40;
    const y1 = Math.max(...ys) + 40;
    // Keep a 16:9 frame, at least a continent wide.
    let w = Math.max(x1 - x0, (y1 - y0) * (16 / 9), 220);
    let h = w * (9 / 16);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    w = Math.min(w, 1000);
    h = Math.min(h, 500);
    return {
      x: Math.max(0, Math.min(1000 - w, cx - w / 2)),
      y: Math.max(0, Math.min(500 - h, cy - h / 2)),
      w,
      h,
    };
  }, [rota]);

  const fillOf = new Map<string, string>();
  for (const g of rota.guesses) fillOf.set(g.name, `rota-${grade(g.off)}`);
  fillOf.set(rota.start, "rota-start");
  fillOf.set(rota.end, "rota-end");
  const scale = viewBox.w / 1000;
  const routeSegments = (rota.route ?? [])
    .slice(1)
    .flatMap((name, i) => segments(linkPoints(rota.route![i], name)));

  function submit() {
    const name = findCountry(typed);
    if (!name) {
      setHint(t.notCountry);
      return;
    }
    setHint(null);
    setTyped("");
    onGuess(name);
  }

  return (
    <div className="rota">
      <div className="rota-top">
        <span className="rota-lang" role="group" aria-label="Language">
          {(["tr", "en"] as const).map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={lang === code}
              onClick={() => pickLang(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </span>
      </div>
      <svg
        className="rota-map"
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
        role="img"
        aria-label={t.map(label(rota.start), label(rota.end))}
      >
        <rect x="0" y="0" width="1000" height="500" className="rota-sea" />
        {Object.entries(ROTA_PATHS).map(([name, d]) => (
          <path
            key={name}
            d={d}
            className={fillOf.get(name) ?? "rota-land"}
            strokeWidth={0.6 * scale}
          />
        ))}
        {ROTA_SEA.filter(([a, b]) => fillOf.has(a) || fillOf.has(b)).flatMap(
          ([a, b]) =>
            segments(linkPoints(a, b)).map(([p, q], i) => (
              <line
                key={`${a}-${b}-${i}`}
                x1={p.x}
                y1={p.y}
                x2={q.x}
                y2={q.y}
                className="rota-sea-link"
                strokeWidth={1.4 * scale}
                strokeDasharray={`${2 * scale} ${3 * scale}`}
              >
                <title>{`${label(a)} ↔ ${label(b)}`}</title>
              </line>
            )),
        )}
        {routeSegments.map(([p, q], i) => (
          <line
            key={i}
            x1={p.x}
            y1={p.y}
            x2={q.x}
            y2={q.y}
            className="rota-route"
            strokeWidth={2.2 * scale}
            strokeDasharray={`${5 * scale} ${4 * scale}`}
          />
        ))}
        {[
          { name: rota.start, p: start, cls: "start" },
          { name: rota.end, p: end, cls: "end" },
        ].map(({ name, p, cls }) => (
          <g
            key={cls}
            className={`rota-pin rota-pin-${cls}`}
            transform={`translate(${p.x} ${p.y}) scale(${scale})`}
          >
            <path d="M0 0 C-6 -9 -8 -12 -8 -16 A8 8 0 1 1 8 -16 C8 -12 6 -9 0 0Z" />
            <circle cx="0" cy="-16" r="3.2" />
            <text x="11" y="-12">
              {label(name)}
            </text>
          </g>
        ))}
      </svg>

      <div className="rota-ends">
        <span className="rota-dot start" />
        <strong>{label(rota.start)}</strong>
        <span className="rota-dash" aria-hidden="true">
          →
        </span>
        <strong>{label(rota.end)}</strong>
        <span className="rota-dot end" />
      </div>
      <p className="rota-meta">
        {t.shortest(rota.shortest)} · {rota.guesses.length}/
        {rotaGuessLimit(rota.shortest)} {t.guesses}
      </p>

      {rota.guesses.length > 0 && (
        <p className="rota-legend">
          {(["hit", "near", "far"] as const).map((g, i) => (
            <span key={g}>
              <i className={`rota-${g}`} /> {t.legend[i]}
            </span>
          ))}
          {rota.guesses.some((g) => g.by === 1) && <span>{t.theirs}</span>}
          <span>{t.sea}</span>
        </p>
      )}

      {rota.guesses.length > 0 && (
        <ol className="rota-guesses">
          {rota.guesses.map((g) => (
            <li
              key={g.name}
              className={`rota-guess rota-${grade(g.off)} by-${g.by}`}
            >
              {label(g.name)}
            </li>
          ))}
        </ol>
      )}

      {rota.route && (
        <p className="rota-meta">
          {t.route}: {rota.route.map(label).join(" → ")}
        </p>
      )}

      {canGuess && (
        <form
          className="rota-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={t.placeholder}
            list="rota-countries"
            maxLength={60}
            autoComplete="off"
            aria-label="Country"
          />
          <datalist id="rota-countries">
            {names.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button
            type="submit"
            className="primary"
            disabled={busy || !typed.trim()}
          >
            {t.guess}
          </button>
        </form>
      )}
      {hint && <p className="game-error">{hint}</p>}
    </div>
  );
}
