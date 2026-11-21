"use client";

/**
 * The tabletop's small cards: my character in the corner (hit points, armour,
 * spell slots, and my spells to cast), what a spell I just cast did, and the
 * pawn I am holding (its hit points and how far it has gone this turn).
 */
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Heart, Minus, Moon, Pencil, Plus, Shield, Skull, Sparkles, Swords, Trash2, X } from "lucide-react";
import { CONDITIONS } from "@/lib/battlemap";
import type { TableCharacter } from "@/lib/lounge-shared";
import type { SpellInfo } from "@/lib/dnd-spells";
import { getSpell, levelName } from "../lib/spell-book";

/** A spell I cast: what it cost and what to roll, and its area on the map if it has one. */
export interface CastResult {
  spell: SpellInfo;
  slotLevel: number;
  dice: string | null;
  areaId: string | null;
  /** Who is in its area (filled in by the room). */
  inIt?: string[];
  /** Said once, e.g. "out of range". */
  warning?: string | null;
  /** Who it was cast at. */
  target?: string | null;
}

/** Hit points that change at once on screen, and reach the room once the clicking stops. */
function useDraft(value: number, send: (next: number) => void) {
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (draft !== null && draft === value) setDraft(null); }, [value, draft]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const set = (next: number) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => send(next), 350);
  };
  return [draft ?? value, set] as const;
}

/** Hit points with a damage/heal box: type 7 and press − or +; empty, they step by one. */
function HpControl({ hp, maxHp, onChange, label = "Hit points" }: { hp: number; maxHp: number; onChange: (hp: number) => void; label?: string }) {
  const [shown, set] = useDraft(hp, onChange);
  const [amount, setAmount] = useState("");
  const step = (sign: 1 | -1) => {
    const by = Number(amount) > 0 ? Math.round(Number(amount)) : 1;
    set(Math.max(0, Math.min(maxHp, shown + sign * by)));
    setAmount("");
  };
  const part = maxHp > 0 ? shown / maxHp : 0;
  return (
    <div className="lr-hp" role="group" aria-label={label}>
      <div className="lr-hp-bar" title={`${shown} of ${maxHp} hit points`}>
        <i style={{ width: `${Math.max(0, Math.min(1, part)) * 100}%`, background: part > 0.5 ? "#4ade80" : part > 0.25 ? "#facc15" : "#f87171" }} />
        <span><Heart size={11} /> {shown}/{maxHp}</span>
      </div>
      <button type="button" onClick={() => step(-1)} aria-label="Take damage" title="Damage (the number in the box, or 1)"><Minus size={13} /></button>
      <input value={amount} onChange={(event) => setAmount(event.target.value.replace(/\D/g, "").slice(0, 4))} onKeyDown={(event) => { if (event.key === "Enter") step(-1); }}
        inputMode="numeric" placeholder="0" aria-label="How much" className="lr-hp-amount" />
      <button type="button" onClick={() => step(1)} aria-label="Heal" title="Heal (the number in the box, or 1)"><Plus size={13} /></button>
    </div>
  );
}

/** The levels a spell can be cast at right now: its own or higher, with a slot left; [0] for a cantrip. */
export function castableLevels(spell: SpellInfo, character: TableCharacter): number[] {
  if (spell.level === 0) return [0];
  const slots = character.slots ?? [];
  const used = character.used ?? [];
  const levels: number[] = [];
  for (let level = spell.level; level <= 9; level++) if ((slots[level - 1] ?? 0) - (used[level - 1] ?? 0) > 0) levels.push(level);
  return levels;
}

const ABILITY_SHORT = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
const HERO_CONDITIONS = CONDITIONS.filter((c) => c.id !== "deafened" && c.id !== "petrified" && c.id !== "unconscious");

function modStr(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

function SpellRow({ name, character, edition, onCast }: { name: string; character: TableCharacter; edition?: "2014" | "2024"; onCast: (spell: SpellInfo, slotLevel: number) => void }) {
  const [spell, setSpell] = useState<SpellInfo | null | undefined>(undefined);
  const [at, setAt] = useState<number | null>(null);
  useEffect(() => { let live = true; void getSpell(name, edition).then((found) => { if (live) setSpell(found); }); return () => { live = false; }; }, [name, edition]);
  const levels = spell ? castableLevels(spell, character) : [];
  const level = at !== null && levels.includes(at) ? at : levels[0];
  return (
    <li>
      <span className="lr-name" title={spell?.area ? `${spell.area.size} ft ${spell.area.shape}` : spell?.range}>{name}</span>
      <small>{spell === undefined ? "…" : spell ? levelName(spell.level) : "?"}</small>
      {levels.length > 1 && (
        <select value={level} onChange={(event) => setAt(Number(event.target.value))} aria-label={`Slot for ${name}`} title="Cast with a higher slot">
          {levels.map((l) => <option key={l} value={l}>{levelName(l)}</option>)}
        </select>
      )}
      <button type="button" disabled={!spell || level === undefined} onClick={() => spell && level !== undefined && onCast(spell, level)}
        title={!spell ? "The compendium does not know this spell" : level === undefined ? "No slots left for it" : spell.area ? "Then click the map to aim it" : "Use a slot and roll"}>
        Cast
      </button>
    </li>
  );
}

/**
 * My character's card at the table: the numbers play keeps touching, one tap
 * away, and stats / spells / actions / status tabs folded neatly beneath.
 */
export function HeroCard({ character, onChange, onEdit, onCast, cast, onRoll, onCommand, onOpenCompanion, edition, onTakeOff, onDismissCast, aiming, onStopAiming }: {
  character: TableCharacter;
  onChange: (next: TableCharacter) => void;
  onEdit: () => void;
  onCast: (spell: SpellInfo, slotLevel: number) => void;
  cast: CastResult | null;
  onRoll: (dice: string) => void;
  onCommand?: (command: string) => void;
  onOpenCompanion?: (path?: string) => void;
  edition?: "2014" | "2024";
  onTakeOff: (areaId: string) => void;
  onDismissCast: () => void;
  /** The spell being aimed, and what to click. */
  aiming: { name: string; what: string } | null;
  onStopAiming: () => void;
}) {
  const [tab, setTab] = useState<"stats" | "spells" | "actions" | "status" | null>(null);
  const toggleTab = (next: "stats" | "spells" | "actions" | "status") => setTab((cur) => (cur === next ? null : next));
  const runRoll = (expr: string, label?: string) => {
    if (onCommand) {
      onCommand(`/roll ${expr}${label ? ` ${label}` : ""}`);
    } else {
      onRoll(expr);
    }
  };
  const slots = character.slots ?? [];
  const used = character.used ?? [];
  const maxHp = character.maxHp ?? 0;
  const spells = character.spells ?? [];
  const conditions = character.conditions ?? [];
  const death = character.deathSaves ?? { successes: 0, failures: 0 };
  const initBonus = character.initiativeBonus ?? Math.floor(((character.abilities?.[1] ?? 10) - 10) / 2);
  const setUsed = (level: number, count: number) => {
    const next = Array.from({ length: 9 }, (_, i) => used[i] ?? 0);
    next[level] = Math.max(0, Math.min(slots[level] ?? 0, count));
    onChange({ ...character, used: next });
  };
  const toggleCondition = (condId: string) => {
    const has = conditions.includes(condId);
    onChange({ ...character, conditions: has ? conditions.filter((c) => c !== condId) : [...conditions, condId] });
  };
  return (
    <div className="lr-hero" role="region" aria-label="My character">
      <div className="lr-hero-head">
        <strong>{character.name}</strong>
        <small>{[character.cls, character.level && `${character.level}`].filter(Boolean).join(" ")}</small>
        <span className="lr-hero-stats">
          {character.ac !== undefined && <span title="Armour class"><Shield size={11} /> {character.ac}</span>}
          {character.speed !== undefined && <span title="Speed">{character.speed} ft</span>}
          {(character.tempHp ?? 0) > 0 && <span title="Temporary HP">+{character.tempHp} THP</span>}
        </span>
        {onOpenCompanion && (
          <button type="button" onClick={() => onOpenCompanion("/sheet")} aria-label="Open full sheet in Tavern" title="Open full sheet in Tavern">
            <ExternalLink size={12} />
          </button>
        )}
        <button type="button" onClick={onEdit} aria-label="Edit my character" title="Edit my character"><Pencil size={12} /></button>
      </div>
      {maxHp > 0 && <HpControl hp={character.hp ?? maxHp} maxHp={maxHp} onChange={(hp) => onChange({ ...character, hp })} />}
      {conditions.length > 0 && (
        <div className="lr-cond-chips">
          {conditions.map((cid) => {
            const info = CONDITIONS.find((c) => c.id === cid);
            return (
              <button key={cid} type="button" className="active" style={info ? { borderColor: info.color } : undefined} onClick={() => toggleCondition(cid)} title="Click to remove condition">
                {info?.badge ?? cid.slice(0, 3).toUpperCase()}
              </button>
            );
          })}
        </div>
      )}
      {slots.some((n) => n > 0) && (
        <div className="lr-slots" aria-label="Spell slots">
          {slots.map((count, level) => count > 0 && (
            <span key={level} className="lr-slot-level" title={`${levelName(level + 1)}-level slots: ${count - (used[level] ?? 0)} of ${count} left`}>
              <small>{level + 1}</small>
              {Array.from({ length: count }, (_, i) => {
                const left = i < count - (used[level] ?? 0);
                return (
                  <button key={i} type="button" className={left ? "full" : ""} aria-label={left ? `Spend a ${levelName(level + 1)}-level slot` : `Get a ${levelName(level + 1)}-level slot back`}
                    onClick={() => setUsed(level, (used[level] ?? 0) + (left ? 1 : -1))} />
                );
              })}
            </span>
          ))}
        </div>
      )}
      <div className="lr-row lr-hero-tabs">
        <button type="button" className={tab === "stats" ? "active" : ""} onClick={() => toggleTab("stats")}>Stats</button>
        {spells.length > 0 && (
          <button type="button" className={tab === "spells" ? "active" : ""} onClick={() => toggleTab("spells")}><Sparkles size={12} /> Spells</button>
        )}
        <button type="button" className={tab === "actions" ? "active" : ""} onClick={() => toggleTab("actions")}><Swords size={12} /> Actions</button>
        <button type="button" className={tab === "status" ? "active" : ""} onClick={() => toggleTab("status")}><Skull size={12} /> Status</button>
        <button type="button" title="Long rest: hit points and spell slots back to full" onClick={() => onChange({ ...character, hp: maxHp || character.hp, tempHp: 0, used: Array(9).fill(0), deathSaves: { successes: 0, failures: 0 } })}><Moon size={12} /></button>
      </div>
      {tab === "stats" && (
        <div className="lr-hero-pane">
          <div className="lr-abilities">
            {(character.abilities ?? [10, 10, 10, 10, 10, 10]).map((score, i) => {
              const s = score || 10;
              const mod = modStr(s);
              const abil = ABILITY_SHORT[i];
              return (
                <button
                  key={abil}
                  type="button"
                  title={`${abil} ${s} (${mod}) — Click: Check · Shift+Click: Save`}
                  onClick={(e) => runRoll(`1d20${mod}`, e.shiftKey ? `${abil} Save` : abil)}
                >
                  <small>{abil}</small>
                  <b>{mod}</b>
                </button>
              );
            })}
          </div>
          <div className="lr-row">
            <button type="button" onClick={() => runRoll(`1d20${initBonus >= 0 ? `+${initBonus}` : initBonus}`, "Initiative")}>
              Init {initBonus >= 0 ? `+${initBonus}` : initBonus}
            </button>
            {character.skills && Object.keys(character.skills).length > 0 && (
              <select
                value=""
                aria-label="Roll skill"
                onChange={(e) => {
                  const key = e.target.value;
                  if (!key) return;
                  const bonus = character.skills?.[key] ?? 0;
                  runRoll(`1d20${bonus >= 0 ? `+${bonus}` : bonus}`, key.replace(/_/g, " "));
                }}
              >
                <option value="">Roll skill…</option>
                {Object.entries(character.skills).map(([k, v]) => (
                  <option key={k} value={k}>{k.replace(/_/g, " ")} ({v >= 0 ? `+${v}` : v})</option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}
      {tab === "spells" && (
        <ul className="lr-list lr-spells">
          {spells.map((name) => <SpellRow key={name} name={name} edition={edition} character={character} onCast={(spell, level) => { onCast(spell, level); }} />)}
        </ul>
      )}
      {tab === "actions" && (
        <ul className="lr-list lr-spells">
          {(character.actions ?? []).length > 0 ? (
            character.actions!.map((act) => (
              <li key={act.name}>
                <span className="lr-name" title={act.summary || act.name}>{act.name}</span>
                {act.damage && (
                  <button type="button" onClick={() => runRoll(act.damage!, act.name)}>{act.damage}</button>
                )}
              </li>
            ))
          ) : (
            <li>
              <span className="lr-name">Quick Attack</span>
              <button type="button" onClick={() => runRoll(`1d20${modStr(character.abilities?.[0] ?? 10)}`, "Attack")}>Attack</button>
              <button type="button" onClick={() => runRoll("1d20", "Roll")}>d20</button>
            </li>
          )}
        </ul>
      )}
      {tab === "status" && (
        <div className="lr-hero-pane">
          <div className="lr-death-saves">
            <small>Temp HP</small>
            <button type="button" onClick={() => onChange({ ...character, tempHp: Math.max(0, (character.tempHp ?? 0) - 1) })}><Minus size={11} /></button>
            <b>{character.tempHp ?? 0}</b>
            <button type="button" onClick={() => onChange({ ...character, tempHp: (character.tempHp ?? 0) + 1 })}><Plus size={11} /></button>
            <span className="lr-sep" />
            <small>Saves</small>
            <button type="button" className="ds-ok" title="Death Save Successes (click to cycle)" onClick={() => onChange({ ...character, deathSaves: { ...death, successes: (death.successes + 1) % 4 } })}>
              ✓ {death.successes}/3
            </button>
            <button type="button" className="ds-fail" title="Death Save Failures (click to cycle)" onClick={() => onChange({ ...character, deathSaves: { ...death, failures: (death.failures + 1) % 4 } })}>
              ✕ {death.failures}/3
            </button>
          </div>
          <div className="lr-cond-chips">
            {HERO_CONDITIONS.map((c) => {
              const on = conditions.includes(c.id);
              return (
                <button key={c.id} type="button" className={on ? "active" : ""} style={on ? { borderColor: c.color } : undefined} onClick={() => toggleCondition(c.id)} title={c.label}>
                  {c.badge}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {aiming && (
        <div className="lr-cast lr-aim">
          <span><b>{aiming.name}</b>: {aiming.what}. Esc cancels.</span>
          <button type="button" onClick={onStopAiming} aria-label="Stop aiming"><X size={13} /></button>
        </div>
      )}
      {cast && !aiming && (
        <div className="lr-cast">
          <div className="lr-line">
            <span><b>{cast.spell.name}</b>{cast.target ? ` → ${cast.target}` : ""}{cast.slotLevel ? ` · ${levelName(cast.slotLevel)} slot` : ""}{cast.spell.save ? ` · ${cast.spell.save.slice(0, 3).toUpperCase()} save` : ""}</span>
            {cast.areaId && <small>{cast.inIt?.length ? `In it: ${cast.inIt.join(", ")}` : "Nobody in it"}</small>}
            {cast.warning && <small className="lr-warn">{cast.warning}</small>}
          </div>
          <div className="lr-row">
            {cast.dice && <button type="button" className="primary" onClick={() => onRoll(cast.dice!)}>Roll {cast.dice}{cast.spell.damageType ? ` ${cast.spell.damageType.toLowerCase()}` : ""}</button>}
            {cast.areaId && <button type="button" onClick={() => onTakeOff(cast.areaId!)}>Take it off the map</button>}
            <button type="button" onClick={onDismissCast} aria-label="Close"><X size={13} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

const PAWN_CONDITIONS = CONDITIONS.filter((c) => ["blinded", "concentrating", "frightened", "grappled", "invisible", "paralyzed", "poisoned", "prone", "restrained", "stunned"].includes(c.id));

/** The pawn I am holding: who it is, its hit points, conditions, elevation, and initiative shortcuts. */
export function HeldPawnCard({
  name,
  hp,
  maxHp,
  canEditHp,
  setHp,
  moved,
  speed,
  offTurn,
  conditions = [],
  elevation = 0,
  size = 1,
  inInitiative,
  onUpdateMeta,
  onAddToInitiative,
  onRemove,
  onLetGo,
}: {
  name: string;
  hp?: number;
  maxHp?: number;
  canEditHp: boolean;
  /** New hit points (and maximum, for a monster that has none yet). */
  setHp?: (hp: number, maxHp: number) => void;
  /** In a fight: feet moved this turn, and how far it may go. */
  moved: number | null;
  speed: number;
  /** Whose turn it is, when it is not this pawn's. */
  offTurn: string | null;
  conditions?: string[];
  elevation?: number;
  size?: number;
  inInitiative?: boolean;
  onUpdateMeta?: (patch: { conditions?: string[]; elevation?: number; size?: number }) => void;
  onAddToInitiative?: () => void;
  onRemove?: () => void;
  onLetGo: () => void;
}) {
  const [max, setMax] = useState("");
  const [showMeta, setShowMeta] = useState(false);
  return (
    <div className="lr-held" role="region" aria-label={`Holding ${name}`}>
      <div className="lr-row">
        <strong>{name}</strong>
        {moved !== null && <small className={moved > speed ? "lr-warn" : ""}>Moved {moved} of {speed} ft</small>}
        {offTurn && <small className="lr-warn">It&apos;s {offTurn}&apos;s turn</small>}
        <button type="button" onClick={onLetGo} aria-label="Let go" title="Let go (Esc)"><X size={13} /></button>
      </div>
      {canEditHp && setHp && (maxHp ? (
        <HpControl hp={hp ?? maxHp} maxHp={maxHp} onChange={(next) => setHp(next, maxHp)} label={`${name}'s hit points`} />
      ) : (
        <form className="lr-row" onSubmit={(event) => { event.preventDefault(); const n = Math.round(Number(max)); if (n > 0) setHp(n, n); setMax(""); }}>
          <input value={max} onChange={(event) => setMax(event.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="Hit points" aria-label="Hit points" />
          <button type="submit" disabled={!max}>Set HP</button>
        </form>
      ))}
      {onUpdateMeta && (
        <>
          <div className="lr-row">
            <button type="button" onClick={() => onUpdateMeta({ elevation: Math.max(-30, elevation - 5) })} title="Lower 5 ft"><ArrowDown size={11} /></button>
            <small title="Elevation above board">{elevation ? `${elevation}ft` : "Ground"}</small>
            <button type="button" onClick={() => onUpdateMeta({ elevation: Math.min(300, elevation + 5) })} title="Raise 5 ft"><ArrowUp size={11} /></button>
            <select value={size} aria-label="Pawn footprint" onChange={(e) => onUpdateMeta({ size: Number(e.target.value) })}>
              <option value={1}>Med</option>
              <option value={2}>Large</option>
              <option value={3}>Huge</option>
            </select>
            <button type="button" className={showMeta ? "active" : ""} onClick={() => setShowMeta(!showMeta)}>Conds{conditions.length ? ` (${conditions.length})` : ""}</button>
          </div>
          {showMeta && (
            <div className="lr-cond-chips">
              {PAWN_CONDITIONS.map((c) => {
                const on = conditions.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={on ? "active" : ""}
                    style={on ? { borderColor: c.color } : undefined}
                    onClick={() => onUpdateMeta({ conditions: on ? conditions.filter((x) => x !== c.id) : [...conditions, c.id] })}
                    title={c.label}
                  >
                    {c.badge}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
      <div className="lr-row">
        <small className="lr-note">Click the map to move it.</small>
        {canEditHp && !inInitiative && onAddToInitiative && (
          <button type="button" onClick={onAddToInitiative}>+ Init</button>
        )}
        {canEditHp && onRemove && (
          <button type="button" onClick={onRemove} title="Put pawn back in cabinet"><Trash2 size={12} /></button>
        )}
      </div>
    </div>
  );
}
