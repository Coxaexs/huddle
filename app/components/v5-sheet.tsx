"use client";

/**
 * The Vampire: The Masquerade 5th edition sheet at the tabletop, on a server
 * that plays it: the full sheet (the person button), where picking traits
 * builds a pool to roll, and the small card in the corner with Hunger,
 * Health, Willpower and Humanity one click away. The sheet is the table's
 * (TableCharacter.v5); the rules are in lib/v5-sheet.ts.
 */
import { useEffect, useRef, useState } from "react";
import { Dices, Droplet, Minus, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import type { TableCharacter } from "@/lib/lounge-shared";
import { HUNGER_DIE_COLOR, V5_MAX_HUNGER } from "@/lib/v5-dice";
import {
  V5_ATTRIBUTES, V5_ATTRIBUTE_GROUPS, V5_MAX_BLOOD_POTENCY, V5_MAX_DISCIPLINES, V5_MAX_DOTS, V5_MAX_EXTRA_HEALTH, V5_MAX_HUMANITY, V5_SKILLS,
  cycleBox, emptyV5Sheet, healthBoxes, impaired, impairedPenalty, rouseCommand, sanitizeV5Sheet, trackBoxes, v5PoolCommand, v5PoolSize, v5Traits, willpowerBoxes,
  type V5Sheet, type V5Track, type V5Trait,
} from "@/lib/v5-sheet";
import { ScreenPagesPicker, upload, type PlayerScreenSettings } from "./lounge-panels";

/**
 * My character as I change it: on screen at once, sent to the table once the
 * clicking stops (the hub drops a second change inside 120 ms). The sheet
 * panel and the corner card share it, so neither undoes the other.
 */
export function useCharacterDraft(live: TableCharacter | null, send: (next: TableCharacter | null) => void) {
  // undefined: nothing waiting, show the table's; null: cleared.
  const [draft, setDraft] = useState<TableCharacter | null | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sent = useRef(false);
  const liveKey = JSON.stringify(live);
  // The table answered with what was sent: show the table's again.
  useEffect(() => { if (sent.current && !timer.current) { sent.current = false; setDraft(undefined); } }, [liveKey]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const update = (next: TableCharacter | null) => {
    setDraft(next);
    sent.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { timer.current = null; sent.current = true; send(next); }, 300);
  };
  return [draft === undefined ? live : draft, update] as const;
}

/** A Vampire sheet to work on: the one on the character, or a fresh one. */
export const v5Of = (character: TableCharacter | null | undefined): V5Sheet => (character?.v5 ? sanitizeV5Sheet(character.v5) : emptyV5Sheet());

/** Dots to click: the third dot sets 3; clicking the last filled one takes it back to 2. */
function Dots({ value, max = V5_MAX_DOTS, onChange, label }: { value: number; max?: number; onChange: (value: number) => void; label: string }) {
  return (
    <span className="lr-v5-dots" role="group" aria-label={`${label}: ${value}`}>
      {Array.from({ length: max }, (_, i) => (
        <button key={i} type="button" className={i < value ? "on" : ""} aria-label={`${label} ${i + 1}`} onClick={() => onChange(value === i + 1 ? i : i + 1)} />
      ))}
    </span>
  );
}

/** Health or Willpower: a box per point, each empty, superficial (/) or aggravated (X); click to turn it. */
function TrackBoxes({ track, boxes, onChange, label }: { track: V5Track; boxes: number; onChange: (next: V5Track) => void; label: string }) {
  const marks = trackBoxes(track, boxes);
  const down = impaired(track, boxes);
  return (
    <div className="lr-v5-track" role="group" aria-label={`${label}: ${track.superficial} superficial, ${track.aggravated} aggravated of ${boxes}`}>
      <small>{label}{down && <b className="lr-warn"> · Impaired</b>}</small>
      <span>
        {marks.map((mark, i) => (
          <button key={i} type="button" className={`lr-v5-box ${mark}`} title="Empty → superficial → aggravated" aria-label={`${label} box ${i + 1}: ${mark === "agg" ? "aggravated" : mark === "sup" ? "superficial" : "empty"}`}
            onClick={() => onChange(cycleBox(track, boxes, i))}>{mark === "agg" ? "✕" : mark === "sup" ? "╱" : ""}</button>
        ))}
        {!boxes && <em className="lr-note">Set the Attributes first.</em>}
      </span>
    </div>
  );
}

/** Hunger, 0 to 5, in red: click a drop to set it. */
function HungerPips({ hunger, onChange }: { hunger: number; onChange: (value: number) => void }) {
  return (
    <span className="lr-v5-hunger" role="group" aria-label={`Hunger ${hunger}`} style={{ "--hunger": HUNGER_DIE_COLOR } as React.CSSProperties}>
      {Array.from({ length: V5_MAX_HUNGER }, (_, i) => (
        <button key={i} type="button" className={i < hunger ? "on" : ""} aria-label={`Hunger ${i + 1}`} onClick={() => onChange(hunger === i + 1 ? i : i + 1)}><Droplet size={13} /></button>
      ))}
    </span>
  );
}

/** Humanity: filled boxes up to it, stains marked in from the far end. */
function HumanityTrack({ humanity, stains, onChange }: { humanity: number; stains: number; onChange: (humanity: number, stains: number) => void }) {
  return (
    <div className="lr-v5-track" role="group" aria-label={`Humanity ${humanity}, ${stains} stains`}>
      <small>Humanity {humanity}{stains ? ` · ${stains} stain${stains === 1 ? "" : "s"}` : ""}</small>
      <span>
        {Array.from({ length: V5_MAX_HUMANITY }, (_, i) => {
          const stained = i >= V5_MAX_HUMANITY - stains;
          return (
            <button key={i} type="button" className={`lr-v5-box ${i < humanity ? "full" : stained ? "stain" : ""}`} aria-label={`Humanity ${i + 1}`}
              onClick={() => { const next = humanity === i + 1 ? i : i + 1; onChange(next, Math.min(stains, V5_MAX_HUMANITY - next)); }}>{stained && i >= humanity ? "╱" : ""}</button>
          );
        })}
        <button type="button" className="lr-v5-step" aria-label="Add a stain" title="Add a stain" disabled={humanity + stains >= V5_MAX_HUMANITY} onClick={() => onChange(humanity, stains + 1)}><Plus size={11} /></button>
        <button type="button" className="lr-v5-step" aria-label="Clear a stain" title="Clear a stain" disabled={!stains} onClick={() => onChange(humanity, stains - 1)}><Minus size={11} /></button>
      </span>
    </div>
  );
}

/** A number with − and + beside it. */
function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (value: number) => void; label: string }) {
  return (
    <span className="lr-v5-stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Less ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}><Minus size={11} /></button>
      <b>{value}</b>
      <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}><Plus size={11} /></button>
    </span>
  );
}

/** A trait's row: its name picks it for a pool, its dots set it. */
function TraitRow({ name, value, picked, onPick, onChange }: { name: string; value: number; picked: boolean; onPick: () => void; onChange: (value: number) => void }) {
  return (
    <div className={`lr-v5-trait${picked ? " picked" : ""}`}>
      <button type="button" className="lr-v5-name" aria-pressed={picked} onClick={onPick} title={picked ? `Take ${name} out of the pool` : `Add ${name} to the pool`}>{name}</button>
      <Dots value={value} onChange={onChange} label={name} />
    </div>
  );
}

/**
 * My Vampire: the whole sheet. Click a trait's name to put it in the pool
 * (an Attribute and a Skill, or two Attributes), then Roll: it rolls
 * `/v <dice> h<Hunger>` named after the traits.
 */
export function V5CharacterPanel({ character, fallbackName, onChange, onClear, onCommand, screen, onClose }: {
  character: TableCharacter | null;
  fallbackName: string;
  onChange: (next: TableCharacter) => void;
  onClear: () => void;
  /** Runs /v or /rouse as me. */
  onCommand?: (command: string) => void;
  screen: PlayerScreenSettings;
  onClose: () => void;
}) {
  const sheet = v5Of(character);
  const [name, setName] = useState(character?.name ?? "");
  const [portrait, setPortrait] = useState(character?.portraitUrl ?? "");
  const [notes, setNotes] = useState({ convictions: sheet.convictions, touchstones: sheet.touchstones, clan: sheet.clan, predator: sheet.predator });
  const [picked, setPicked] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  useEffect(() => { setName(character?.name ?? ""); setPortrait(character?.portraitUrl ?? ""); }, [character?.name, character?.portraitUrl]);
  useEffect(() => {
    setNotes({ convictions: sheet.convictions, touchstones: sheet.touchstones, clan: sheet.clan, predator: sheet.predator });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.convictions, sheet.touchstones, sheet.clan, sheet.predator]);

  const base = (): TableCharacter => ({ ...(character ?? { portraitUrl: null }), name: (character?.name || name).trim() || fallbackName, portraitUrl: character?.portraitUrl ?? null });
  const set = (change: Partial<V5Sheet>) => onChange({ ...base(), v5: sanitizeV5Sheet({ ...sheet, ...change }) });
  const commitText = () => {
    const changed = notes.clan !== sheet.clan || notes.predator !== sheet.predator || notes.convictions !== sheet.convictions || notes.touchstones !== sheet.touchstones;
    const nextName = name.trim() || fallbackName;
    const nextPortrait = portrait.trim() || null;
    // Looked, typed nothing: no Vampire made.
    if (!character?.v5 && !changed && !name.trim() && !nextPortrait) return;
    if (!changed && nextName === character?.name && nextPortrait === (character?.portraitUrl ?? null) && character?.v5) return;
    onChange({ ...base(), name: nextName, portraitUrl: nextPortrait, v5: sanitizeV5Sheet({ ...sheet, ...notes }) });
  };
  const chooseFile = async (chosen: File | undefined) => {
    if (!chosen) return;
    setBusy(true); setProblem(null);
    try {
      const url = await upload(chosen);
      setPortrait(url);
      onChange({ ...base(), portraitUrl: url, v5: sheet });
    } catch (error) { setProblem(error instanceof Error ? error.message : "That upload failed."); }
    finally { setBusy(false); if (file.current) file.current.value = ""; }
  };

  const traits = v5Traits(sheet);
  const pool: V5Trait[] = picked.flatMap((wanted) => traits.filter((t) => t.name === wanted).slice(0, 1));
  // Two traits make a pool; a third takes the place of the first.
  const pick = (trait: string) => setPicked((now) => (now.includes(trait) ? now.filter((t) => t !== trait) : [...now, trait].slice(-2)));
  const penalty = impairedPenalty(sheet, pool);
  const roll = () => {
    if (!pool.length) return;
    onCommand?.(v5PoolCommand(pool, sheet.hunger, { difficulty: difficulty || undefined, modifier: -penalty }));
    setPicked([]);
  };
  const hp = healthBoxes(sheet);
  const wp = willpowerBoxes(sheet);
  const setDiscipline = (index: number, change: Partial<{ name: string; dots: number }>) =>
    set({ disciplines: sheet.disciplines.map((d, i) => (i === index ? { ...d, ...change } : d)) });

  return (
    <div className="living-room-panel lr-v5" role="dialog" aria-label="My Vampire">
      <style>{V5_SHEET_CSS}</style>
      <div className="living-room-panel-head"><strong>My Vampire</strong><button type="button" onClick={() => { commitText(); onClose(); }} aria-label="Close"><X size={14} /></button></div>
      <div className="lr-sheet">
        <label className="lr-field"><small>Name</small><input value={name} onChange={(e) => setName(e.target.value)} onBlur={commitText} placeholder={fallbackName} maxLength={40} /></label>
        <label className="lr-field"><small>Clan</small><input value={notes.clan} onChange={(e) => setNotes({ ...notes, clan: e.target.value })} onBlur={commitText} placeholder="Your clan" maxLength={40} /></label>
        <label className="lr-field"><small>Predator type</small><input value={notes.predator} onChange={(e) => setNotes({ ...notes, predator: e.target.value })} onBlur={commitText} placeholder="How you feed" maxLength={40} /></label>
      </div>

      <div className="lr-v5-status">
        <div className="lr-v5-track"><small>Hunger {sheet.hunger}</small><HungerPips hunger={sheet.hunger} onChange={(hunger) => set({ hunger })} /></div>
        <div className="lr-v5-track"><small>Blood Potency</small><Stepper value={sheet.bloodPotency} min={0} max={V5_MAX_BLOOD_POTENCY} onChange={(bloodPotency) => set({ bloodPotency })} label="Blood Potency" /></div>
      </div>
      <TrackBoxes track={sheet.health} boxes={hp} label={`Health (${hp})`} onChange={(health) => set({ health })} />
      <TrackBoxes track={sheet.willpower} boxes={wp} label={`Willpower (${wp})`} onChange={(willpower) => set({ willpower })} />
      <HumanityTrack humanity={sheet.humanity} stains={sheet.stains} onChange={(humanity, stains) => set({ humanity, stains })} />

      <small className="lr-heading">Attributes</small>
      <div className="lr-v5-cols">
        {V5_ATTRIBUTE_GROUPS.map((group, g) => (
          <div key={group} className="lr-v5-col">
            <small>{group}</small>
            {V5_ATTRIBUTES.slice(g * 3, g * 3 + 3).map((trait, i) => (
              <TraitRow key={trait} name={trait} value={sheet.attributes[g * 3 + i]} picked={picked.includes(trait)} onPick={() => pick(trait)}
                onChange={(value) => set({ attributes: sheet.attributes.map((n, j) => (j === g * 3 + i ? value : n)) })} />
            ))}
          </div>
        ))}
      </div>
      <small className="lr-heading">Skills</small>
      <div className="lr-v5-cols">
        {V5_ATTRIBUTE_GROUPS.map((group, g) => (
          <div key={group} className="lr-v5-col">
            {V5_SKILLS.slice(g * 9, g * 9 + 9).map((trait, i) => (
              <TraitRow key={trait} name={trait} value={sheet.skills[g * 9 + i]} picked={picked.includes(trait)} onPick={() => pick(trait)}
                onChange={(value) => set({ skills: sheet.skills.map((n, j) => (j === g * 9 + i ? value : n)) })} />
            ))}
          </div>
        ))}
      </div>
      <small className="lr-heading">Disciplines</small>
      <div className="lr-v5-disciplines">
        {sheet.disciplines.map((d, i) => (
          <div key={i} className={`lr-v5-trait${picked.includes(d.name) ? " picked" : ""}`}>
            <button type="button" className="lr-v5-name" aria-pressed={picked.includes(d.name)} onClick={() => pick(d.name)} title={`Add ${d.name} to the pool`}>{d.name}</button>
            <Dots value={d.dots} onChange={(dots) => setDiscipline(i, { dots })} label={d.name} />
            <button type="button" className="lr-v5-step" aria-label={`Remove ${d.name}`} onClick={() => set({ disciplines: sheet.disciplines.filter((_, j) => j !== i) })}><Trash2 size={11} /></button>
          </div>
        ))}
        {sheet.disciplines.length < V5_MAX_DISCIPLINES && <DisciplineAdder taken={sheet.disciplines.map((d) => d.name.toLowerCase())} onAdd={(discipline) => set({ disciplines: [...sheet.disciplines, { name: discipline, dots: 1 }] })} />}
      </div>

      <label className="lr-field"><small>Convictions</small>
        <textarea value={notes.convictions} onChange={(e) => setNotes({ ...notes, convictions: e.target.value })} onBlur={commitText} rows={2} maxLength={600} placeholder="What you will not do, even now." />
      </label>
      <label className="lr-field"><small>Touchstones</small>
        <textarea value={notes.touchstones} onChange={(e) => setNotes({ ...notes, touchstones: e.target.value })} onBlur={commitText} rows={2} maxLength={600} placeholder="The mortals who keep you human." />
      </label>
      <div className="lr-row">
        {character && <button type="button" onClick={() => { onClear(); onClose(); }}>Clear</button>}
      </div>

      <details className="lr-more">
        <summary>More: portrait, extra Health, my screen</summary>
        <label className="lr-field"><small>Portrait</small><input value={portrait} onChange={(e) => setPortrait(e.target.value)} onBlur={commitText} placeholder="https://… or upload" maxLength={600} /></label>
        <div className="lr-row">
          <button type="button" disabled={busy} onClick={() => file.current?.click()}><Upload size={14} /> {busy ? "Uploading…" : "Upload a portrait"}</button>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => void chooseFile(e.target.files?.[0])} />
        </div>
        {problem && <p className="lr-note">{problem}</p>}
        <div className="lr-row"><small>Extra Health boxes</small><Stepper value={sheet.extraHealth} min={0} max={V5_MAX_EXTRA_HEALTH} onChange={(extraHealth) => set({ extraHealth })} label="extra Health" /></div>
        <small className="lr-heading">My screen (only you see it)</small>
        <div className="lr-row">
          <button type="button" className={screen.open ? "active" : ""} aria-pressed={screen.open} onClick={() => screen.setOpen(!screen.open)}>
            {screen.open ? "Put my screen away" : "Stand my screen up"}
          </button>
        </div>
        {screen.open && (
          <>
            <ScreenPagesPicker role="player" choice={screen.choice} setChoice={screen.setChoice} system="vtm5" />
            <label className="lr-field">
              <small>My notes</small>
              <textarea value={screen.notes} onChange={(e) => screen.setNotes(e.target.value)} rows={3} maxLength={2000} placeholder="Who owes whom a boon." />
            </label>
          </>
        )}
      </details>

      <div className="lr-v5-pool" role="group" aria-label="Dice pool">
        <span className="lr-v5-pool-what">
          {pool.length
            ? <><b>{pool.map((t) => `${t.name} ${t.dots}`).join(" + ")}</b>{penalty ? <em className="lr-warn"> −{penalty} Impaired</em> : null} = {v5PoolSize(pool, -penalty)} dice{sheet.hunger ? `, ${Math.min(sheet.hunger, v5PoolSize(pool, -penalty))} Hunger` : ""}</>
            : <>Click an Attribute and a Skill to build a pool.</>}
        </span>
        <span className="lr-row">
          <small>Difficulty</small>
          <Stepper value={difficulty} min={0} max={10} onChange={setDifficulty} label="Difficulty" />
          <button type="button" className="primary" disabled={!pool.length || !onCommand} onClick={roll}><Dices size={13} /> Roll</button>
          <button type="button" disabled={!onCommand} onClick={() => onCommand?.(rouseCommand(sheet.hunger))} title="Rouse the Blood: 6+ keeps Hunger, else it rises"><Droplet size={13} /> Rouse</button>
        </span>
      </div>
    </div>
  );
}

/** A new discipline by name (whatever the player's book calls it). */
function DisciplineAdder({ taken, onAdd }: { taken: string[]; onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  const clean = name.trim();
  const add = () => { if (clean && !taken.includes(clean.toLowerCase())) { onAdd(clean.slice(0, 40)); setName(""); } };
  return (
    <form className="lr-row" onSubmit={(event) => { event.preventDefault(); add(); }}>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Add a discipline" aria-label="Discipline name" maxLength={40} />
      <button type="submit" disabled={!clean || taken.includes(clean.toLowerCase())} aria-label="Add discipline"><Plus size={13} /></button>
    </form>
  );
}

/**
 * My Vampire in the corner: Hunger (with a Rouse check and +1), Health,
 * Willpower and Humanity, changed with a click; the pencil opens the sheet
 * to roll from it.
 */
export function V5HeroCard({ character, onChange, onEdit, onCommand }: {
  character: TableCharacter;
  onChange: (next: TableCharacter) => void;
  onEdit: () => void;
  onCommand?: (command: string) => void;
}) {
  const sheet = v5Of(character);
  const set = (change: Partial<V5Sheet>) => onChange({ ...character, v5: sanitizeV5Sheet({ ...sheet, ...change }) });
  const hp = healthBoxes(sheet);
  const wp = willpowerBoxes(sheet);
  return (
    <div className="lr-hero lr-v5" role="region" aria-label="My Vampire">
      <style>{V5_SHEET_CSS}</style>
      <div className="lr-hero-head">
        <strong>{character.name}</strong>
        <small>{[sheet.clan, sheet.bloodPotency ? `BP ${sheet.bloodPotency}` : ""].filter(Boolean).join(" · ")}</small>
        <span className="lr-hero-stats" />
        <button type="button" onClick={onEdit} aria-label="Open my sheet" title="Open my sheet (roll from it)"><Pencil size={12} /></button>
      </div>
      <div className="lr-v5-status">
        <div className="lr-v5-track"><small>Hunger {sheet.hunger}</small><HungerPips hunger={sheet.hunger} onChange={(hunger) => set({ hunger })} /></div>
        <span className="lr-row">
          <button type="button" disabled={sheet.hunger >= V5_MAX_HUNGER} onClick={() => set({ hunger: sheet.hunger + 1 })} title="Hunger +1">+1</button>
          <button type="button" disabled={!onCommand} onClick={() => onCommand?.(rouseCommand(sheet.hunger))} title="Rouse check: Hunger rises on a fail by itself"><Droplet size={13} /> Rouse</button>
        </span>
      </div>
      <TrackBoxes track={sheet.health} boxes={hp} label="Health" onChange={(health) => set({ health })} />
      <TrackBoxes track={sheet.willpower} boxes={wp} label="Willpower" onChange={(willpower) => set({ willpower })} />
      <HumanityTrack humanity={sheet.humanity} stains={sheet.stains} onChange={(humanity, stains) => set({ humanity, stains })} />
    </div>
  );
}

const V5_SHEET_CSS = `
.living-room-panels:has(.lr-v5) { width: min(480px, calc(100% - 20px)); }
.lr-v5 .lr-v5-status { display: flex; gap: 10px; align-items: end; justify-content: space-between; flex-wrap: wrap; }
.lr-v5 .lr-v5-track { display: grid; gap: 3px; }
.lr-v5 .lr-v5-track > span { display: flex; flex-wrap: wrap; gap: 3px; align-items: center; }
.lr-v5 .lr-v5-track small, .lr-v5 .lr-v5-col > small { opacity: 0.8; font-size: 11px; font-weight: 700; }
.lr-v5 button.lr-v5-box { width: 20px; height: 20px; min-height: 0 !important; padding: 0 !important; border-radius: 4px !important; justify-content: center; border: 1px solid var(--lr-edge); background: rgba(0, 0, 0, 0.25) !important; font-size: 12px !important; line-height: 1; color: var(--lr-ink) !important; }
.lr-v5 button.lr-v5-box.sup { background: rgba(255, 210, 122, 0.22) !important; }
.lr-v5 button.lr-v5-box.agg { background: ${HUNGER_DIE_COLOR} !important; border-color: ${HUNGER_DIE_COLOR}; color: #fff !important; }
.lr-v5 button.lr-v5-box.full { background: var(--lr-ink) !important; }
.lr-v5 button.lr-v5-box.stain { color: ${HUNGER_DIE_COLOR} !important; font-weight: 900 !important; }
.lr-v5 button.lr-v5-step, .lr-v5 .lr-v5-stepper button { width: 22px; height: 22px; min-height: 0 !important; padding: 0 !important; justify-content: center; border-radius: 6px !important; }
.lr-v5 .lr-v5-stepper { display: inline-flex; align-items: center; gap: 4px; }
.lr-v5 .lr-v5-stepper b { min-width: 16px; text-align: center; }
.lr-v5 .lr-v5-hunger { display: inline-flex; gap: 2px; }
.lr-v5 .lr-v5-hunger button { width: 22px; height: 24px; min-height: 0 !important; padding: 0 !important; justify-content: center; background: transparent !important; color: var(--lr-ink) !important; opacity: 0.35; }
.lr-v5 .lr-v5-hunger button.on { color: var(--hunger) !important; opacity: 1; }
.lr-v5 .lr-v5-hunger button.on svg { fill: var(--hunger); }
.lr-v5 .lr-v5-cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 8px; }
.lr-v5 .lr-v5-col { display: grid; gap: 2px; align-content: start; }
.lr-v5 .lr-v5-trait { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0 4px; padding: 1px 3px; border-radius: 6px; }
.lr-v5 .lr-v5-cols .lr-v5-trait { flex-wrap: nowrap; }
@media (max-width: 520px) { .lr-v5 .lr-v5-cols .lr-v5-trait { flex-direction: column; align-items: flex-start; } }
.lr-v5 .lr-v5-trait.picked { box-shadow: inset 0 0 0 1px var(--lr-accent); background: rgba(255, 210, 122, 0.12); }
.lr-v5 button.lr-v5-name { min-height: 20px !important; padding: 0 !important; background: transparent !important; font-size: 12px !important; font-weight: 600 !important; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
.lr-v5 button.lr-v5-name:hover { text-decoration: underline; }
.lr-v5 .lr-v5-trait.picked button.lr-v5-name { color: var(--lr-accent) !important; }
.lr-v5 .lr-v5-dots { display: inline-flex; gap: 2px; }
.lr-v5 .lr-v5-dots button { width: 10px; height: 10px; min-height: 0 !important; padding: 0 !important; border-radius: 50% !important; border: 1px solid var(--lr-ink); background: transparent !important; opacity: 0.75; }
.lr-v5 .lr-v5-dots button.on { background: var(--lr-ink) !important; opacity: 1; }
.lr-v5 .lr-v5-disciplines { display: grid; gap: 3px; }
.lr-v5 .lr-v5-disciplines .lr-v5-trait { flex-wrap: nowrap; }
.lr-v5 .lr-v5-disciplines .lr-v5-name { flex: 1; }
.lr-v5 .lr-v5-pool { position: sticky; bottom: -10px; margin: 0 -12px -10px; padding: 8px 12px 10px; display: grid; gap: 6px; background: var(--lr-panel); border-top: 1px solid var(--lr-edge); -webkit-backdrop-filter: blur(12px); backdrop-filter: blur(12px); border-radius: 0 0 14px 14px; }
.lr-v5 .lr-v5-pool-what { font-size: 12px; line-height: 1.35; }
.lr-v5 .lr-v5-pool .lr-row small { opacity: 0.8; }
.lr-v5 .lr-v5-pool .lr-row button.primary { margin-left: auto; }
.lr-v5 .lr-warn { color: #ff8a8a; font-style: normal; }
.lr-hero.lr-v5 button.lr-v5-box { width: 17px; height: 17px; font-size: 11px !important; }
.lr-hero.lr-v5 button.lr-v5-step { width: 19px; height: 19px; }
`;
