"use client";

/**
 * The club's panels. Everyone gets the club bar: who is playing, the tempo,
 * what's next, a way to start the night, to take the decks, and to ask for a
 * song. Whoever has the decks gets the DJ's panel: mix into the next song in
 * a style of their choosing, remix moves on the beat, the stems of the song
 * that's playing, the filter, hold-down effects, the sampler, who mixes
 * (Real DJ, Auto DJ, or the DJ by hand), and the light desk.
 *
 * The light desk (ClubLightDesk) is the DJ's too, and anyone's while the
 * decks are free: scenes, faders, colours (following the music's notes, or
 * not), patterns and the moment buttons.
 * Everyone else sees it as it is, and has their own brightness, strobes and
 * light timing underneath.
 *
 * The crowd has a say too: More and Chill on the club bar, and cheering
 * together with the room's emotes. Real DJ follows the room's mood (and
 * builds into a drop for a cheer); a DJ at the decks sees what it wants.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AudioLines, Disc3, ExternalLink, Headphones, PartyPopper, Power, SlidersHorizontal, X } from "lucide-react";
import { apiFetch } from "../lib/client";
import { CLUB_CROWD_VOTE_MS, CLUB_STATIONS, NOTE_NAMES, type ClubCrowd, type ClubCrowdKind, type ClubInfo, type ClubNote, type ClubStation } from "@/lib/club-feed";
import {
  BEAM_FX, FLOOR_FX, LASER_FX, WALL_FX, sceneDesk,
  type ClubColour, type ClubDesk, type ClubFader, type ClubFx, type ClubFxThing, type ClubScene,
} from "@/lib/club-desk";

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
  auto: {
    on: boolean; mode: "real" | "auto"; vibe: "chill" | "club" | "hype"; three: boolean; next: string | null; style: string; beats: number | null;
    autoplay: boolean; station: ClubStation | null;
  };
  stems: { on: boolean; available: boolean };
  crate: Array<{ title: string; artist: string }>;
  notice: string | null;
  /** A part of another song playing over the mix now (the bot's loop crate). */
  loop: { id: string; part: string; title: string | null } | null;
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

const stationName = (id: ClubStation) => {
  const station = CLUB_STATIONS.find((s) => s.id === id);
  return station ? `${station.emoji} ${station.label}` : id;
};

/** The mood stations as chips: "Any" and the eight moods. */
function MoodChips({ value, onPick }: { value: ClubStation | null; onPick: (station: ClubStation | null) => void }) {
  return (
    <div className="lr-chips" role="radiogroup" aria-label="Mood">
      <button type="button" role="radio" aria-checked={value === null} className={value === null ? "active" : ""} onClick={() => onPick(null)}>Any</button>
      {CLUB_STATIONS.map((s) => (
        <button key={s.id} type="button" role="radio" aria-checked={value === s.id} className={value === s.id ? "active" : ""} onClick={() => onPick(s.id)}>
          {s.emoji} {s.label}
        </button>
      ))}
    </div>
  );
}

const MODE_LABEL: Record<string, string> = { real: "Real DJ", auto: "Auto DJ", hands: "hands on", player: "the room's player" };

/** What the crowd has told the DJ lately, in a line (null when nobody has said anything). */
export function crowdLine(crowd: ClubCrowd | null | undefined): string | null {
  if (!crowd) return null;
  if (crowd.said === "drop") return "The crowd cheered: here comes the drop";
  if (crowd.said === "up") return "The DJ heard you: turning it up";
  if (crowd.said === "down") return "The DJ heard you: taking it down";
  const wants = (count: number, what: string) => (count ? `${count} want${count === 1 ? "s" : ""} ${what}` : null);
  const parts = [wants(crowd.more, "more"), wants(crowd.chill, "it chill")].filter(Boolean);
  return parts.length ? `The crowd: ${parts.join(" · ")}` : null;
}

export function ClubBar({ roomId, status, nowPlaying, djName, isDj, decksFree, onTakeDecks, onLeaveDecks, onOpenDecks, onOpenLights, onRequest, onCrowd }: {
  roomId: string;
  status: ClubStatus;
  nowPlaying: { title: string; artist: string } | null;
  djName: string | null;
  isDj: boolean;
  decksFree: boolean;
  onTakeDecks: () => void;
  onLeaveDecks: () => void;
  onOpenDecks: () => void;
  onOpenLights: () => void;
  onRequest: (query: string) => void;
  onCrowd: (kind: ClubCrowdKind) => void;
}) {
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  /** My last tap of More / Chill, lit while it still counts. */
  const [voted, setVoted] = useState<{ kind: ClubCrowdKind; at: number } | null>(null);
  useEffect(() => {
    if (!voted) return;
    const timer = window.setTimeout(() => setVoted(null), Math.max(0, voted.at + CLUB_CROWD_VOTE_MS - Date.now()));
    return () => window.clearTimeout(timer);
  }, [voted]);
  const booth = status.info && status.info.mode !== "player";
  // Real DJ follows the crowd; a DJ by hand sees it. Auto DJ plays the queue as it is.
  const canVote = Boolean(booth && !isDj && (status.info!.mode === "real" || status.info!.mode === "hands"));
  const crowd = crowdLine(status.info?.crowd);
  const vote = (kind: ClubCrowdKind) => {
    onCrowd(kind);
    setVoted({ kind, at: Date.now() });
  };
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
          {status.info?.loop && <small>+ {status.info.loop.part} from {status.info.loop.title || "another song"}</small>}
          {status.info?.station && <small>Mood: {stationName(status.info.station)}</small>}
        </span>
      </div>
      {canVote ? (
        <div className="lr-row lr-club-crowd" role="group" aria-label="Tell the DJ">
          <button type="button" aria-pressed={voted?.kind === "more"} onClick={() => vote("more")} title="Ask for more energy: when enough of the room asks, the DJ turns it up">🔥 More</button>
          <button type="button" aria-pressed={voted?.kind === "chill"} onClick={() => vote("chill")} title="Ask for it calmer: when enough of the room asks, the DJ takes it down">🌙 Chill</button>
          <small>{crowd ?? (status.info!.mode === "real" ? "Cheer together with 🔥 🎉 👏 for a drop" : "The DJ sees what the crowd wants")}</small>
        </div>
      ) : crowd && booth ? (
        <small className="lr-note">{crowd}</small>
      ) : null}
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
        {!isDj && (
          <button type="button" onClick={onOpenLights} title={decksFree ? "The light desk: scenes, faders, colours, lasers, confetti and flames" : "How the lights look for you (the DJ runs the desk)"}>
            <SlidersHorizontal size={14} /> Lights
          </button>
        )}
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
/** The loop pads: the song's own part steps out for eight bars and another song's takes over, in its key and tempo. */
const BORROW: Array<[string, string, string]> = [
  ["guitar", "🎸 Guitar riff", "Another song's guitar riff under this vocal for eight bars"],
  ["piano", "🎹 Keys", "Another song's piano part for eight bars"],
  ["bass", "🎚️ Bass line", "Another song's bass line for eight bars"],
  ["drums", "🥁 Drums", "Another song's drum groove for eight bars"],
];
const PART_ICON: Record<string, string> = { guitar: "🎸", piano: "🎹", bass: "🎚️", drums: "🥁" };
const PADS: Array<[string, string]> = [["horn", "📯 Horn"], ["siren", "🚨 Siren"], ["laser", "🔫 Laser"], ["boom", "💥 808"], ["clap", "👏 Clap"], ["riser", "📈 Riser"], ["scratch", "💿 Scratch"], ["rewind", "⏪ Rewind"]];
const HOLD_FX: Array<[string, string, number]> = [["roll", "Roll", 2], ["echo", "Echo", 3], ["flanger", "Flanger", 5], ["reverb", "Reverb", 4]];
const VIBES: Array<[ClubState["auto"]["vibe"], string]> = [["chill", "Chill"], ["club", "Club"], ["hype", "Hype"]];
/** Who mixes: Real DJ (picks and remixes), Auto DJ (mixes the queue in order), or the DJ by hand. */
const WHO_MIXES: Array<["real" | "auto" | "hands", string, string]> = [
  ["real", "Real DJ", "Picks the next songs and mixes and remixes them by itself"],
  ["auto", "Auto DJ", "Mixes the queue in order, in the style you choose"],
  ["hands", "By hand", "Nothing mixes unless you do"],
];

export function ClubDecksPanel({ roomId, onOpenBooth, onClose, lights, crowd }: {
  roomId: string;
  onOpenBooth: () => void;
  onClose: () => void;
  lights?: ReactNode;
  /** What the crowd is asking for (the club bar's More / Chill), for whoever has the decks. */
  crowd?: ClubCrowd | null;
}) {
  const [tab, setTab] = useState<"music" | "lights">("music");
  const [state, setState] = useState<ClubState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [style, setStyle] = useState("auto");
  const [startMood, setStartMood] = useState<ClubStation | null>(null);
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
  const who = !state?.auto.on ? "hands" : state.auto.mode;
  const [beats, setBeats] = useState<number | null>(null);
  useEffect(() => { setBeats(state?.auto.beats ?? null); }, [state?.auto.beats]);
  const beatsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (beatsTimer.current) clearTimeout(beatsTimer.current); }, []);
  const sendBeats = (value: number | null) => {
    setBeats(value);
    if (beatsTimer.current) clearTimeout(beatsTimer.current);
    beatsTimer.current = setTimeout(() => void send({ op: "auto", beats: value ?? 0 }), 250);
  };
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
      {lights && (
        <div className="lr-tabs" role="tablist" aria-label="Decks or lights">
          <button type="button" role="tab" aria-selected={tab === "music"} className={tab === "music" ? "active" : ""} onClick={() => setTab("music")}><Disc3 size={13} /> Music</button>
          <button type="button" role="tab" aria-selected={tab === "lights"} className={tab === "lights" ? "active" : ""} onClick={() => setTab("lights")}><SlidersHorizontal size={13} /> Lights</button>
        </div>
      )}
      {tab === "lights" && lights}
      {tab === "music" && state && onAir && crowdLine(crowd) && <p className="lr-note lr-crowd">{crowdLine(crowd)}</p>}
      {tab === "music" && !state && !error && <p className="lr-note">Finding the booth…</p>}
      {tab === "music" && state && !onAir && (
        <div className="lr-line">
          <span className="lr-title">The booth is off</span>
          <small className="lr-note">Mood for the night: the DJ picks songs from the whole library for it, and mixes in its style.</small>
          <MoodChips value={startMood} onPick={setStartMood} />
          <button type="button" className="primary lr-wide" onClick={() => void send({ op: "club", ...(startMood ? { station: startMood } : {}) })} title="Real DJ picks stemmed songs and mixes and remixes them"><PartyPopper size={14} /> Start the night with Real DJ</button>
          <button type="button" className="lr-wide-plain" onClick={() => void send({ op: "club", mode: "auto", ...(startMood ? { station: startMood } : {}) })} title="Auto DJ mixes the queue in order; stemmed songs go in it if it's short">Start with Auto DJ</button>
        </div>
      )}
      {tab === "music" && state && onAir && (
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
          <div className="lr-heading">Borrow from another song</div>
          <div className="lr-pads lr-pads-4">
            {BORROW.map(([part, label, hint]) => (
              <button key={part} type="button" title={hint} onClick={() => void send({ op: "club_loop", part }, "Finding one that fits…")} disabled={!master?.bpm}>{label}</button>
            ))}
          </div>
          {state.loop && (
            <div className="lr-row lr-loop-now">
              <small>{PART_ICON[state.loop.part]} {state.loop.part} from {state.loop.title || "another song"}</small>
              <button type="button" title="Sounds wrong: never play this one again" onClick={() => void send({ op: "loop_vote", id: state.loop!.id, vote: "down" })}>👎</button>
              <button type="button" title="Sounds great: play it more" onClick={() => void send({ op: "loop_vote", id: state.loop!.id, vote: "up" })}>👍</button>
            </div>
          )}
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
          <div className="lr-heading">Mood</div>
          <MoodChips value={state.auto.station} onPick={(station) => void send({ op: "auto", station }, station ? `${stationName(station)}: the next songs are picked for the mood.` : "Any mood: the queue and the whole library again.")} />
          <div className="lr-heading">Who mixes</div>
          <div className="lr-chips" role="radiogroup" aria-label="Who mixes">
            {WHO_MIXES.map(([id, label, hint]) => (
              <button key={id} type="button" role="radio" aria-checked={who === id} className={who === id ? "active" : ""} title={hint}
                onClick={() => void send(id === "hands" ? { op: "auto", on: false } : { op: "auto", mode: id, on: true }, id === "hands" ? "It's all yours: nothing mixes unless you do." : `${label} is mixing.`)}>
                {label}
              </button>
            ))}
          </div>
          {who !== "hands" && (
            <label className="living-room-switch">
              <span><strong>Autoplay</strong><small>When the queue runs out, the night keeps going with stemmed songs from the library.</small></span>
              <input type="checkbox" checked={state.auto.autoplay}
                onChange={() => void send({ op: "auto", autoplay: !state.auto.autoplay }, state.auto.autoplay ? "Autoplay off: the night ends with the queue." : "Autoplay: when the queue runs out, songs from the library keep it going.")} />
            </label>
          )}
          {who === "real" && (
            <>
              <div className="lr-chips" role="radiogroup" aria-label="Vibe">
                {VIBES.map(([vibe, label]) => (
                  <button key={vibe} type="button" role="radio" aria-checked={state.auto.vibe === vibe} className={state.auto.vibe === vibe ? "active" : ""} onClick={() => void send({ op: "auto", vibe })}>{label}</button>
                ))}
                <button type="button" className={state.auto.three ? "active" : ""} aria-pressed={state.auto.three} onClick={() => void send({ op: "auto", three: !state.auto.three })} title="Real DJ layers a third song's vocal over the beat now and then">3 songs</button>
              </div>
            </>
          )}
          {who === "auto" && (
            <>
              <small className="lr-note">Auto DJ mixes into the next song in the queue as each one ends, like this:</small>
              <div className="lr-chips" role="radiogroup" aria-label="Auto DJ's mixes">
                {MIX_STYLES.map(([id, label]) => (
                  <button key={id} type="button" role="radio" aria-checked={state.auto.style === id} className={state.auto.style === id ? "active" : ""} onClick={() => void send({ op: "auto", style: id })}>{label}</button>
                ))}
              </div>
              <label className="lr-field">
                <small>Mix length: {beats ? `${beats} beats (${beats / 4} bars)` : "the style's own"}</small>
                <span className="lr-row">
                  <input type="range" min={0} max={64} step={4} value={beats ?? 0} aria-label="Mix length"
                    onChange={(event) => sendBeats(Number(event.target.value) || null)} />
                  <button type="button" onClick={() => sendBeats(null)} disabled={!beats}>Auto</button>
                </span>
              </label>
            </>
          )}
        </>
      )}
      {tab === "music" && (notice || error) && <small className={error ? "lr-note lr-warn" : "lr-note"}>{error || notice}</small>}
      {tab === "music" && (
        <div className="lr-row">
          <button type="button" onClick={onOpenBooth} title="The whole booth, in a new tab: both decks, EQs, loops, hot cues and more"><ExternalLink size={13} /> Full booth</button>
          {onAir && <button type="button" onClick={() => void send({ op: "stop" }, "The booth is off; the room's player has the music back.")}><Power size={13} /> End the night</button>}
        </div>
      )}
    </div>
  );
}

/* ---------- the light desk ---------- */

const SCENES: Array<[Exclude<ClubScene, "custom">, string, string]> = [
  ["auto", "Auto", "The lights follow the music: every look, by the song's sections"],
  ["warmup", "Warm-up", "Low and slow, no lasers or strobes: the early hours"],
  ["peak", "Peak", "Everything up: fast beams, lasers, strobes on the drops"],
  ["chill", "Chill", "Soft colours, still beams, a laser sky, no strobes"],
  ["lasers", "Laser show", "Lasers forward in thick haze, the beams low"],
];
const FADERS: Array<[ClubFader, string, string]> = [
  ["master", "Master", "Everything at once"],
  ["beams", "Beams", "The moving heads on the truss"],
  ["move", "Movement", "How fast the beams and lasers move"],
  ["lasers", "Lasers", "Off at the bottom"],
  ["strobe", "Strobe", "How much the drops and builds flash (never more than three a second)"],
  ["haze", "Haze", "Thicker haze shows the beams"],
  ["floor", "Floor", "The LED dance floor"],
  ["react", "React", "Smooth at the bottom, punchy at the top"],
  ["colourSpeed", "Colour speed", "How often the colours move on: never, each 16 bars, … each bar"],
];
/** With the colours, not the other faders. */
const MIX_FADER: [ClubFader, string, string] = ["mix", "Colour mix", "Down: one colour for the whole room. Up: every light its own colour"];
const COLOURS: Array<[ClubColour, string, string]> = [
  ["mood", "Mood", "The song's mood: hard minor songs burn red, calm ones go blue, bright songs gold and pink"],
  ["theme", "Theme", "The room theme's colours"],
  ["rainbow", "Rainbow", "The whole colour wheel"],
  ["key", "Song key", "A colour for each key: harmonic mixes stay close, key changes leap"],
  ["pick", "Pick", "One colour of your choosing"],
];
const PATTERN_NAMES: Record<string, string> = {
  auto: "Auto", ripple: "Ripple", checker: "Checker", stems: "Stems", chase: "Chase", sparkle: "Sparkle",
  bars: "Bars", rings: "Rings", tunnel: "Tunnel", waves: "Waves", history: "History",
  sweep: "Sweep", fan: "Fan", circle: "Circles", crowd: "On the crowd", still: "Still", sheet: "Liquid sky", cross: "Cross",
};
const PATTERNS: Array<["beamFx" | "laserFx" | "floorFx" | "wallFx", string, readonly string[]]> = [
  ["beamFx", "Beams", BEAM_FX],
  ["laserFx", "Lasers", LASER_FX],
  ["floorFx", "Floor", FLOOR_FX],
  ["wallFx", "LED wall", WALL_FX],
];
const SHOTS: Array<[ClubFxThing, string, string]> = [
  ["confetti", "🎉 Confetti", "From the roof over the floor"],
  ["co2", "💨 CO2", "Jets from the stage"],
  ["pyro", "🔥 Flames", "Four flame jets along the stage"],
  ["flash", "⚡ Flash", "One strobe flash"],
  ["drop", "💥 Drop", "The lights drop: colours thrown, confetti and CO2"],
];

/** This listener's own view of the show. */
export interface ClubLightSettings { strobes: boolean; nudgeMs: number; brightness: number }

const NOTE_LABELS = ["Bass", "Chords", "Voice"];

/** The notes the lights hear now, a few times a second: what the colours are following. */
function NotesNow({ read }: { read: () => readonly (ClubNote | null)[] | null }) {
  const [notes, setNotes] = useState("");
  useEffect(() => {
    const tick = () => {
      const now = read();
      setNotes(now ? now.map((note, k) => (note ? `${NOTE_LABELS[k]} ${NOTE_NAMES[note.pc]}` : "")).filter(Boolean).join(" · ") : "");
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [read]);
  return <p className="lr-note lr-notes-now" aria-live="off">{notes || "No notes heard right now"}</p>;
}

export function ClubLightDesk({ desk, canRun, runBy, onDesk, onFx, mine, onMine, readNotes }: {
  desk: ClubDesk;
  /** This person may work the desk (at the decks, or nobody is). */
  canRun: boolean;
  /** Who runs it, when it's not this person. */
  runBy: string | null;
  onDesk: (desk: ClubDesk) => void;
  onFx: (fx: ClubFx) => void;
  mine: ClubLightSettings;
  onMine: (patch: Partial<ClubLightSettings>) => void;
  /** The notes the show hears now (bass, chords, voice). */
  readNotes?: () => readonly (ClubNote | null)[] | null;
}) {
  const held = useRef<ClubFxThing | null>(null);
  const onFxRef = useRef(onFx);
  onFxRef.current = onFx;
  const set = (patch: Partial<ClubDesk>) => onDesk({ ...desk, ...patch, scene: "scene" in patch ? patch.scene! : "custom" });
  const hold = (thing: ClubFxThing, on: boolean) => {
    if (on) held.current = thing;
    else if (held.current !== thing) return;
    else held.current = null;
    onFx({ thing, on });
  };
  const fader = ([key, label, hint]: [ClubFader, string, string]) => (
    <label key={key} className="lr-fader" title={hint}>
      <small>{label}</small>
      <input type="range" min={0} max={1} step={0.01} value={desk[key]} aria-label={label}
        onChange={(event) => set({ [key]: Number(event.target.value) } as Partial<ClubDesk>)} />
      <output>{Math.round(desk[key] * 100)}</output>
    </label>
  );
  // Let go of a held blackout or strobe if the desk goes away mid-hold.
  useEffect(() => () => { if (held.current) onFxRef.current({ thing: held.current, on: false }); }, []);
  return (
    <div className="lr-desk">
      {!canRun && <p className="lr-note">{runBy ? `DJ ${runBy} runs the lights.` : "Whoever has the decks runs the lights."} Yours to change: how they look for you, below.</p>}
      <fieldset disabled={!canRun}>
        <div className="lr-heading">Scenes</div>
        <div className="lr-chips" role="radiogroup" aria-label="Light scene">
          {SCENES.map(([id, label, hint]) => (
            <button key={id} type="button" role="radio" aria-checked={desk.scene === id} className={desk.scene === id ? "active" : ""} title={hint}
              onClick={() => onDesk(sceneDesk(id, desk))}>{label}</button>
          ))}
          {desk.scene === "custom" && <span className="lr-chip-note">Custom</span>}
        </div>
        <div className="lr-heading">Moments</div>
        <div className="lr-pads lr-pads-3">
          {SHOTS.map(([thing, label, hint]) => <button key={thing} type="button" title={hint} onClick={() => onFx({ thing })}>{label}</button>)}
          {(["blackout", "strobe"] as const).map((thing) => (
            <button key={thing} type="button" className="lr-hold" title={thing === "blackout" ? "Every light out while held: let go for the drop" : "Strobe on the beat while held (three flashes a second at most)"}
              onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); hold(thing, true); }}
              onPointerUp={() => hold(thing, false)} onPointerCancel={() => hold(thing, false)}
              onKeyDown={(event) => { if ((event.key === " " || event.key === "Enter") && !event.repeat) hold(thing, true); }}
              onKeyUp={(event) => { if (event.key === " " || event.key === "Enter") hold(thing, false); }}>
              {thing === "blackout" ? "⬛ Blackout" : "💡 Strobe"} <small>hold</small>
            </button>
          ))}
        </div>
        <div className="lr-heading">Faders</div>
        <div className="lr-faders">{FADERS.map(fader)}</div>
        <div className="lr-heading">Colours</div>
        <div className="lr-chips" role="radiogroup" aria-label="Colours">
          {COLOURS.map(([id, label, hint]) => (
            <button key={id} type="button" role="radio" aria-checked={desk.colour === id} className={desk.colour === id ? "active" : ""} title={hint} onClick={() => set({ colour: id })}>{label}</button>
          ))}
        </div>
        {desk.colour === "pick" && (
          <input className="lr-hue" type="range" min={0} max={1} step={0.005} value={desk.hue} aria-label="Colour"
            style={{ accentColor: `hsl(${Math.round(desk.hue * 360)} 100% 55%)` }} onChange={(event) => set({ hue: Number(event.target.value) })} />
        )}
        <div className="lr-faders">{fader(MIX_FADER)}</div>
        <label className="living-room-switch">
          <span><strong>Colours follow the notes</strong><small>Each part&apos;s lights take its note&apos;s colour: the floor the bass line, the beams the chords, the lasers the voice. Notes that go together get colours close together.</small></span>
          <input type="checkbox" checked={desk.notes} onChange={(event) => set({ notes: event.target.checked })} />
        </label>
        {desk.notes && readNotes && <NotesNow read={readNotes} />}
        {PATTERNS.map(([key, label, options]) => (
          <div key={key}>
            <div className="lr-heading">{label}</div>
            <div className="lr-chips" role="radiogroup" aria-label={`${label} pattern`}>
              {options.map((id) => (
                <button key={id} type="button" role="radio" aria-checked={desk[key] === id} className={desk[key] === id ? "active" : ""}
                  onClick={() => set({ [key]: id } as Partial<ClubDesk>)}>{PATTERN_NAMES[id] ?? id}</button>
              ))}
            </div>
          </div>
        ))}
        <label className="living-room-switch">
          <span><strong>Confetti and CO2 on the drops</strong><small>By themselves, whenever the music drops. The buttons above always work.</small></span>
          <input type="checkbox" checked={desk.autoFx} onChange={(event) => set({ autoFx: event.target.checked })} />
        </label>
      </fieldset>
      <div className="lr-heading">Just for you</div>
      <label className="living-room-slider">
        <span>Brightness: {Math.round(mine.brightness * 100)}%</span>
        <input type="range" min={0.3} max={1.5} step={0.05} value={mine.brightness} aria-label="Brightness for me"
          onChange={(event) => onMine({ brightness: Number(event.target.value) })} />
      </label>
      <label className="living-room-switch">
        <span><strong>Strobes</strong><small>Off: no flashing at all, whatever the desk does.</small></span>
        <input type="checkbox" checked={mine.strobes} onChange={(event) => onMine({ strobes: event.target.checked })} />
      </label>
      <label className="living-room-slider">
        <span>Light timing: {mine.nudgeMs > 0 ? `${mine.nudgeMs} ms later` : mine.nudgeMs < 0 ? `${-mine.nudgeMs} ms sooner` : "as sent"}</span>
        <input type="range" min={-150} max={400} step={10} value={mine.nudgeMs} aria-label="Light timing"
          onChange={(event) => onMine({ nudgeMs: Number(event.target.value) })} />
      </label>
    </div>
  );
}

/** The light desk on its own, for anyone in the club who isn't at the decks. */
export function ClubLightsPanel({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="living-room-panel lr-decks" role="dialog" aria-label="The lights">
      <div className="living-room-panel-head">
        <strong><SlidersHorizontal size={14} /> The lights</strong>
        <button type="button" onClick={onClose} aria-label="Close"><X size={14} /></button>
      </div>
      {children}
    </div>
  );
}
