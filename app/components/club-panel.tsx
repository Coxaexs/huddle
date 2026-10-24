"use client";

/**
 * The club's panels. Everyone gets the club bar: who is playing, the tempo,
 * what's next, a way to start the night, to take the decks, and to ask for a
 * song. Whoever has the decks gets the DJ's panel: mix into the next song in
 * a style of their choosing, remix moves on the beat, the stems of the song
 * that's playing, the filter, hold-down effects, the sampler, and how much
 * Real DJ does by itself.
 */
import { useEffect, useRef, useState } from "react";
import { AudioLines, Disc3, ExternalLink, Headphones, PartyPopper, Power, X } from "lucide-react";
import { apiFetch } from "../lib/client";
import type { ClubInfo } from "@/lib/club-feed";

/** The booth as the club route answers (see app/api/(features)/music/club). */
export interface ClubState {
  active: boolean;
  live: boolean;
  paused: boolean;
  decks: Record<"A" | "B", {
    name: string; loaded: boolean; loading: string | null; title: string | null; artist: string | null; thumbnail: string | null;
    playing: boolean; bpm: number | null; key: string | null; stems: string | null; gains: Record<string, number>; position: number; duration: number; color: number;
  }>;
  master: "A" | "B" | null;
  mix: { label: string; progress: number; started: boolean } | null;
  auto: { on: boolean; mode: "real" | "auto"; vibe: "chill" | "club" | "hype"; three: boolean; next: string | null };
  stems: { on: boolean; available: boolean };
  crate: Array<{ title: string; artist: string }>;
  notice: string | null;
}

/** What the crowd sees of the night, from the light feed (a few times a second at most). */
export interface ClubStatus {
  live: boolean;
  bpm: number | null;
  info: ClubInfo | null;
  section: string;
}

export function clubAction(voiceChannelId: string, body: Record<string, unknown>) {
  return apiFetch<ClubState>("/api/music/club", { method: "POST", body: JSON.stringify({ voiceChannelId, ...body }) });
}

const MODE_LABEL: Record<string, string> = { real: "Real DJ", auto: "Auto DJ", hands: "hands on", player: "the room's player" };

export function ClubBar({ roomId, status, nowPlaying, djName, isDj, decksFree, onTakeDecks, onLeaveDecks, onOpenDecks, onRequest }: {
  roomId: string;
  status: ClubStatus;
  nowPlaying: { title: string; artist: string } | null;
  djName: string | null;
  isDj: boolean;
  decksFree: boolean;
  onTakeDecks: () => void;
  onLeaveDecks: () => void;
  onOpenDecks: () => void;
  onRequest: (query: string) => void;
}) {
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const booth = status.info && status.info.mode !== "player";
  const startNight = async () => {
    setBusy(true);
    setNote(null);
    try {
      const state = await clubAction(roomId, { op: "club" });
      setNote(state.notice || "The night is on. Real DJ is playing stemmed songs.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "The music bot didn't answer.");
    } finally {
      setBusy(false);
    }
  };
  const who = djName ? `DJ ${djName}` : booth ? "DJ Hoffy" : null;
  return (
    <div className="lr-club-bar" role="group" aria-label="The club">
      <div className="lr-club-now">
        <span className={`lr-club-dot${status.live ? " on" : ""}`} aria-hidden="true" />
        <span className="lr-club-text">
          <strong>{nowPlaying ? nowPlaying.title : status.live ? "The club" : "Quiet in here"}</strong>
          <small>
            {[who, booth && !djName ? MODE_LABEL[status.info!.mode] : null, status.bpm ? `${Math.round(status.bpm)} BPM` : null, status.info?.key || null]
              .filter(Boolean).join(" · ") || (status.live ? "the room's player" : "Nothing is playing yet")}
            {status.info?.mix ? ` · mixing: ${status.info.mix.style.toLowerCase()} ${Math.round(status.info.mix.progress * 100)}%` : ""}
          </small>
          {status.info?.next && <small>Next: {status.info.next}</small>}
        </span>
      </div>
      <div className="lr-row">
        {!booth && (
          <button type="button" className="primary" onClick={() => void startNight()} disabled={busy} title="Real DJ plays the stemmed songs, mixing and remixing them; take the decks any time">
            <PartyPopper size={14} /> {status.live ? "Hand it to the DJ" : "Start the night"}
          </button>
        )}
        {isDj ? (
          <>
            <button type="button" className="primary" onClick={onOpenDecks}><Disc3 size={14} /> The decks</button>
            <button type="button" onClick={onLeaveDecks}>Leave the decks</button>
          </>
        ) : decksFree ? (
          <button type="button" onClick={onTakeDecks} title="Step up to the decks: mix, remix, and play the sampler"><Headphones size={14} /> Take the decks</button>
        ) : null}
      </div>
      <form className="lr-row" onSubmit={(event) => { event.preventDefault(); const q = request.trim(); if (!q) return; onRequest(q); setRequest(""); setNote(`Requested "${q}". The DJ plays it when it fits.`); }}>
        <input value={request} onChange={(event) => setRequest(event.target.value)} placeholder="Request a song…" aria-label="Request a song" maxLength={200} />
        <button type="submit" disabled={!request.trim()}>Request</button>
      </form>
      {note && <small className="lr-note">{note}</small>}
    </div>
  );
}

const MIX_STYLES: Array<[string, string]> = [
  ["auto", "Auto"], ["blend", "Blend"], ["stem_swap", "Stem swap"], ["acapella", "Acapella over"], ["mashup", "Mashup"],
  ["drum_bridge", "Drum bridge"], ["echo", "Echo out"], ["loop_roll", "Loop roll"], ["cut", "Cut"], ["spinback", "Spinback"],
];
const MOVES: Array<[string, string, string]> = [
  ["drop", "🚀 Build & drop", "Eight beats of build (the bass out, the filter up, a riser, a roll), a beat of silence, and the drop"],
  ["acapella", "🎤 Acapella", "Just the vocal for two bars, then the band slams back in"],
  ["beatbreak", "🥁 Beat break", "Just the drums for two bars"],
  ["stutter", "🔁 Stutter", "A quarter-beat roll for two beats"],
  ["echo", "🌊 Echo throw", "Throw the next beat into an echo"],
];
const STEMS: Array<[string, string]> = [["drums", "Drums"], ["bass", "Bass"], ["vocals", "Vocals"], ["other", "Melody"]];
const PADS: Array<[string, string]> = [["horn", "📯 Horn"], ["siren", "🚨 Siren"], ["laser", "🔫 Laser"], ["boom", "💥 808"], ["clap", "👏 Clap"], ["riser", "📈 Riser"], ["scratch", "💿 Scratch"], ["rewind", "⏪ Rewind"]];
const HOLD_FX: Array<[string, string, number]> = [["roll", "Roll", 2], ["echo", "Echo", 3], ["flanger", "Flanger", 5], ["reverb", "Reverb", 4]];
const VIBES: Array<[ClubState["auto"]["vibe"], string]> = [["chill", "Chill"], ["club", "Club"], ["hype", "Hype"]];

export function ClubDecksPanel({ roomId, onOpenBooth, onClose }: { roomId: string; onOpenBooth: () => void; onClose: () => void }) {
  const [state, setState] = useState<ClubState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [style, setStyle] = useState("auto");
  const [filter, setFilter] = useState(0);
  const filterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    // The booth as it is now, every second and a half; every five while the bot isn't answering.
    const load = async () => {
      let wait = 1500;
      try {
        const next = await apiFetch<ClubState>(`/api/music/club?voiceChannelId=${encodeURIComponent(roomId)}`);
        if (stopped) return;
        setState(next);
        setError(null);
        if (next.notice) setNotice(next.notice);
      } catch (failure) {
        if (stopped) return;
        setError(failure instanceof Error ? failure.message : "The music bot didn't answer.");
        wait = 5000;
      }
      timer = window.setTimeout(() => void load(), wait);
    };
    void load();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [roomId]);
  useEffect(() => () => { if (filterTimer.current) clearTimeout(filterTimer.current); }, []);

  const send = async (body: Record<string, unknown>, said?: string) => {
    try {
      const next = await clubAction(roomId, body);
      setState(next);
      setError(null);
      setNotice(next.notice || said || null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The music bot didn't answer.");
    }
  };

  const master = state?.master ? state.decks[state.master] : state ? Object.values(state.decks).find((d) => d.playing) ?? null : null;
  const other = state && master ? state.decks[master.name === "A" ? "B" : "A"] : null;
  const onAir = Boolean(state?.active && state.live);
  const stemsReady = master?.stems === "ready";
  const real = Boolean(state?.auto.on && state.auto.mode === "real");
  const sendFilter = (value: number) => {
    setFilter(value);
    if (!master) return;
    if (filterTimer.current) clearTimeout(filterTimer.current);
    filterTimer.current = setTimeout(() => void send({ op: "set", deck: master.name, param: "color", value }), 90);
  };
  const holdFx = (type: string, beat: number, on: boolean) => {
    if (on) held.current = type;
    else if (held.current !== type) return;
    else held.current = null;
    void send({ op: "fx", type, beat, on });
  };

  return (
    <div className="living-room-panel lr-decks" role="dialog" aria-label="The decks">
      <div className="living-room-panel-head">
        <strong><Disc3 size={14} /> The decks {onAir && <span className="lr-onair">ON AIR</span>}</strong>
        <button type="button" onClick={onClose} aria-label="Close"><X size={14} /></button>
      </div>
      {!state && !error && <p className="lr-note">Finding the booth…</p>}
      {state && !onAir && (
        <div className="lr-line">
          <span className="lr-title">The booth is off</span>
          <button type="button" className="primary lr-wide" onClick={() => void send({ op: "club" })}><PartyPopper size={14} /> Start the night</button>
        </div>
      )}
      {state && onAir && (
        <>
          <div className="lr-deck-now">
            {master?.thumbnail ? <img src={master.thumbnail} alt="" /> : <span className="lr-deck-art"><AudioLines size={18} /></span>}
            <span className="lr-line">
              <span className="lr-title">{master?.title || (master?.loading ? `Loading ${master.loading}…` : "Nothing on air")}</span>
              <small>{[master?.artist, master?.bpm ? `${Math.round(master.bpm)} BPM` : null, master?.key, master ? `deck ${master.name}` : null].filter(Boolean).join(" · ")}</small>
              <small>Next: {other?.loading ? `loading ${other.loading}…` : other?.loaded && !other.playing ? other.title : state.auto.next || state.crate[0]?.title || "the queue is empty"}</small>
            </span>
          </div>
          {state.mix && (
            <div className="lr-mixbar" aria-label={`Mixing: ${state.mix.label}`}>
              <i style={{ width: `${Math.round(state.mix.progress * 100)}%` }} />
              <span>{state.mix.started ? `Mixing: ${state.mix.label}` : `Mix planned: ${state.mix.label}`}</span>
            </div>
          )}
          <div className="lr-heading">Mix into the next song</div>
          <div className="lr-chips" role="radiogroup" aria-label="Mix style">
            {MIX_STYLES.map(([id, label]) => (
              <button key={id} type="button" role="radio" aria-checked={style === id} className={style === id ? "active" : ""} onClick={() => setStyle(id)}>{label}</button>
            ))}
          </div>
          <button type="button" className="primary lr-wide" onClick={() => void send({ op: "skip", style }, "Mixing…")}>Mix now</button>
          <div className="lr-heading">Remix</div>
          <div className="lr-pads">
            {MOVES.map(([move, label, hint]) => (
              <button key={move} type="button" title={hint} onClick={() => void send({ op: "club_move", move })} disabled={(move === "acapella" || move === "beatbreak") && !stemsReady}>{label}</button>
            ))}
          </div>
          <div className="lr-heading">Stems {master ? `· deck ${master.name}` : ""}{master && !stemsReady ? (master.stems === "separating" ? " (separating…)" : " (none for this song)") : ""}</div>
          <div className="lr-row">
            {STEMS.map(([stem, label]) => {
              const on = (master?.gains[stem] ?? 1) > 0.5;
              return (
                <button key={stem} type="button" className={on ? "active" : ""} aria-pressed={on} disabled={!master || !stemsReady}
                  onClick={() => master && void send({ op: "set", deck: master.name, stem, value: on ? 0 : 1 })}>{label}</button>
              );
            })}
          </div>
          <label className="lr-field">
            <small>Filter: {filter < -0.03 ? "low-pass" : filter > 0.03 ? "high-pass" : "off"}</small>
            <span className="lr-row">
              <input type="range" min={-1} max={1} step={0.02} value={filter} onChange={(event) => sendFilter(Number(event.target.value))} disabled={!master} aria-label="Filter" />
              <button type="button" onClick={() => sendFilter(0)} disabled={!master || Math.abs(filter) < 0.03}>Reset</button>
            </span>
          </label>
          <div className="lr-heading">Effects (hold)</div>
          <div className="lr-row">
            {HOLD_FX.map(([type, label, beat]) => (
              <button key={type} type="button" className="lr-hold"
                onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); holdFx(type, beat, true); }}
                onPointerUp={() => holdFx(type, beat, false)} onPointerCancel={() => holdFx(type, beat, false)}
                onKeyDown={(event) => { if ((event.key === " " || event.key === "Enter") && !event.repeat) holdFx(type, beat, true); }}
                onKeyUp={(event) => { if (event.key === " " || event.key === "Enter") holdFx(type, beat, false); }}>{label}</button>
            ))}
          </div>
          <div className="lr-heading">Sampler</div>
          <div className="lr-pads lr-pads-4">
            {PADS.map(([name, label]) => <button key={name} type="button" onClick={() => void send({ op: "sample", name })}>{label}</button>)}
          </div>
          <div className="lr-heading">Real DJ</div>
          <div className="lr-row">
            <button type="button" className={real ? "active" : ""} aria-pressed={real} onClick={() => void send(real ? { op: "auto", on: false } : { op: "auto", mode: "real", on: true })}
              title={real ? "Real DJ picks the songs and mixes by itself; switch it off to do it all by hand" : "Let Real DJ pick the next songs and mix them"}>
              {real ? "On: it mixes by itself" : "Off: all yours"}
            </button>
            <button type="button" className={state.auto.three ? "active" : ""} aria-pressed={state.auto.three} onClick={() => void send({ op: "auto", three: !state.auto.three })} title="Real DJ layers a third song's vocal over the beat now and then">3 songs</button>
          </div>
          <div className="lr-chips" role="radiogroup" aria-label="Vibe">
            {VIBES.map(([vibe, label]) => (
              <button key={vibe} type="button" role="radio" aria-checked={state.auto.vibe === vibe} className={state.auto.vibe === vibe ? "active" : ""} onClick={() => void send({ op: "auto", vibe })}>{label}</button>
            ))}
          </div>
        </>
      )}
      {(notice || error) && <small className={error ? "lr-note lr-warn" : "lr-note"}>{error || notice}</small>}
      <div className="lr-row">
        <button type="button" onClick={onOpenBooth} title="The whole booth, in a new tab: both decks, EQs, loops, hot cues and more"><ExternalLink size={13} /> Full booth</button>
        {onAir && <button type="button" onClick={() => void send({ op: "stop" }, "The booth is off; the room's player has the music back.")}><Power size={13} /> End the night</button>}
      </div>
    </div>
  );
}
