"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { BookOpen, ChevronRight, Dices, Footprints, Heart, History, Medal, Search, Send, Shield, ShieldHalf, Skull, Sparkles, Swords, Users, WandSparkles, Zap } from "lucide-react";
import { apiFetch } from "@/app/lib/client";
import { useI18n } from "@/app/lib/i18n-context";
import { stepTurn, type TableCharacter } from "@/lib/lounge-shared";
import type { WidgetSize } from "@/lib/layout-prefs";
import type { DiceRollEvent } from "@/lib/protocol";
import { DndCard, type DndCardProps } from "../dnd-card";
import { useWidgetHost } from "./widget-host";
import { Row, Shell, Thumb, Tile } from "./widget-parts";

type Props = { size: WidgetSize };

const DICE = [4, 6, 8, 10, 12, 20, 100];

/** The dice seen since this tab opened, newest first. */
function useRolls(limit = 20): DiceRollEvent[] {
  const [rolls, setRolls] = useState<DiceRollEvent[]>([]);
  useEffect(() => {
    const onRoll = (event: Event) => setRolls((list) => [(event as CustomEvent<DiceRollEvent>).detail, ...list].slice(0, limit));
    window.addEventListener("huddle-dice-roll", onRoll);
    return () => window.removeEventListener("huddle-dice-roll", onRoll);
  }, [limit]);
  return rolls;
}

/** A natural 20 or 1 on a lone d20. */
function rollMood(roll: DiceRollEvent): "crit" | "fail" | "" {
  const kept = (roll.dice ?? []).flatMap((die) => (die.sides === 20 ? die.rolls.filter((one) => one.kept) : []));
  if (kept.length !== 1) return "";
  return kept[0].value === 20 ? "crit" : kept[0].value === 1 ? "fail" : "";
}

/** Rolls through /roll, so the real 3D dice and the chat result both happen. */
export function DiceWidget({ size }: Props) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const rolls = useRolls(5);
  const [count, setCount] = useState(1);
  const [mode, setMode] = useState<"" | "adv" | "dis">("");
  const [custom, setCustom] = useState("");
  const mine = rolls.find((roll) => roll.roller.id === host.userId);
  const roll = (sides: number) => void host.runCommand(`/roll ${count}d${sides}${sides === 20 && mode ? ` ${mode}` : ""}`);
  const rollCustom = (event: FormEvent) => {
    event.preventDefault();
    const text = custom.trim();
    if (!text) return;
    setCustom("");
    void host.runCommand(`/roll ${text}`);
  };
  const tile = <Tile><Dices size={size === "small" ? 13 : 18} /></Tile>;
  const last = mine ? t("widget.dndDice.last", { total: mine.summary || mine.total, expression: mine.expression }) : t("widget.dndDice.desc");
  if (size === "small") {
    return (
      <Shell
        size={size}
        tile={tile}
        title={mine ? String(mine.summary || mine.total) : t("widget.dndDice")}
        right={
          <span className="mw-controls">
            <button type="button" className="mw-btn" onClick={() => roll(6)}>d6</button>
            <button type="button" className="mw-btn mw-btn-main" onClick={() => roll(20)}>d20</button>
          </span>
        }
      />
    );
  }
  return (
    <Shell size={size} tile={tile} title={t("widget.dndDice")} subtitle={last}>
      <div className="xw-dice-grid">
        {DICE.map((sides) => (
          <button key={sides} type="button" className={`mw-btn ${sides === 20 ? "mw-btn-main xw-wide" : ""}`} onClick={() => roll(sides)}>d{sides}</button>
        ))}
      </div>
      <div className="mw-row">
        <span className="xw-seg" role="group" aria-label={t("widget.dndDice.count")}>
          <button type="button" aria-label={t("widget.dndDice.less")} disabled={count <= 1} onClick={() => setCount((n) => Math.max(1, n - 1))}>−</button>
          <span>{count}×</span>
          <button type="button" aria-label={t("widget.dndDice.more")} disabled={count >= 20} onClick={() => setCount((n) => Math.min(20, n + 1))}>+</button>
        </span>
        <span className="mw-spacer" />
        <span className="xw-seg" role="group" aria-label="d20">
          <button type="button" className={mode === "adv" ? "on" : ""} aria-pressed={mode === "adv"} onClick={() => setMode((m) => (m === "adv" ? "" : "adv"))}>{t("widget.dndDice.adv")}</button>
          <button type="button" className={mode === "dis" ? "on" : ""} aria-pressed={mode === "dis"} onClick={() => setMode((m) => (m === "dis" ? "" : "dis"))}>{t("widget.dndDice.dis")}</button>
        </span>
      </div>
      {size === "large" && (
        <form className="mw-queue" onSubmit={rollCustom}>
          <Dices size={13} aria-hidden="true" />
          <input value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="2d6+3" aria-label={t("widget.dndDice")} maxLength={80} />
        </form>
      )}
    </Shell>
  );
}

export function RollsWidget({ size }: Props) {
  const { t } = useI18n();
  const rolls = useRolls();
  const latest = rolls[0];
  const tile = <Tile><History size={size === "small" ? 13 : 18} /></Tile>;
  if (size === "small") {
    return <Shell size={size} tile={tile} title={latest ? `${latest.roller.displayName}: ${latest.summary || latest.total}` : t("widget.dndRolls")} subtitle={latest ? undefined : t("widget.dndRolls.empty")} />;
  }
  const shown = rolls.slice(0, size === "large" ? 12 : 4);
  return (
    <Shell size={size} tile={tile} title={t("widget.dndRolls")} subtitle={rolls.length ? undefined : t("widget.dndRolls.empty")}>
      {shown.length > 0 && (
        <ul className="xw-list">
          {shown.map((roll) => (
            <Row
              key={roll.animationSeed}
              thumb={<span className={`xw-badge ${rollMood(roll)}`}>{roll.total}</span>}
              title={roll.roller.displayName}
              subtitle={roll.summary || roll.expression}
            />
          ))}
        </ul>
      )}
    </Shell>
  );
}

export function InitiativeWidget({ size }: Props) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const initiative = host.table.initiative;
  const entries = initiative?.entries ?? [];
  const current = initiative ? entries[initiative.turn] : null;
  const tile = <Tile><Swords size={size === "small" ? 13 : 18} /></Tile>;
  const next = initiative && entries.length > 0 ? (
    <button type="button" className="mw-btn mw-btn-main" title={t("widget.dndInitiative.next")} aria-label={t("widget.dndInitiative.next")} onClick={() => host.table.setInitiative(stepTurn(initiative))}>
      <ChevronRight size={15} />
    </button>
  ) : null;
  const idle = host.voiceChannelId ? t("widget.dndInitiative.empty") : t("widget.dnd.noTable");
  if (size === "small") {
    return <Shell size={size} tile={tile} title={current ? t("widget.dndInitiative.turn", { name: current.name }) : t("widget.dndInitiative")} subtitle={current ? undefined : idle} right={next} />;
  }
  return (
    <Shell size={size} tile={tile} title={initiative && current ? t("widget.dndInitiative.round", { round: initiative.round }) : t("widget.dndInitiative")} subtitle={current ? t("widget.dndInitiative.turn", { name: current.name }) : idle} right={next}>
      {entries.length > 0 && (
        <ol className="xw-list">
          {entries.map((entry, index) => (
            <Row key={entry.id} current={index === initiative?.turn} thumb={<span className="xw-badge">{entry.value}</span>} title={entry.name} />
          ))}
        </ol>
      )}
    </Shell>
  );
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function classLine(character: TableCharacter, t: ReturnType<typeof useI18n>["t"]): string {
  return [character.cls, character.level ? t("widget.dndMe.level", { level: character.level }) : ""].filter(Boolean).join(" · ");
}

function HpBar({ character, numbers = true }: { character: TableCharacter; numbers?: boolean }) {
  const hp = character.hp ?? 0;
  const max = character.maxHp ?? 0;
  if (!max) return null;
  const percent = Math.max(0, Math.min(100, (hp / max) * 100));
  const mood = percent <= 25 ? "low" : percent <= 50 ? "mid" : "";
  return (
    <span className="xw-hp">
      <span className={`xw-hp-bar ${mood}`} aria-hidden="true"><span style={{ width: `${percent}%` }} /></span>
      {numbers && <small>{hp}/{max}</small>}
    </span>
  );
}

function Chip({ icon, children, label }: { icon: ReactNode; children: ReactNode; label: string }) {
  return <span className="xw-chip" title={label}>{icon}{children}</span>;
}

export function PartyWidget({ size }: Props) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const party = Object.values(host.table.characters);
  const tile = <Tile><Users size={size === "small" ? 13 : 18} /></Tile>;
  const idle = host.voiceChannelId ? t("widget.dndParty.empty") : t("widget.dnd.noTable");
  if (size === "small") {
    const worst = [...party].sort((a, b) => (a.hp ?? 0) / (a.maxHp || 1) - (b.hp ?? 0) / (b.maxHp || 1))[0];
    return <Shell size={size} tile={tile} title={worst?.name || t("widget.dndParty")} subtitle={worst ? undefined : idle} right={worst ? <HpBar character={worst} /> : null} />;
  }
  return (
    <Shell size={size} tile={tile} title={t("widget.dndParty")} subtitle={party.length ? t("widget.dndParty.count", { count: party.length }) : idle}>
      {party.length > 0 && (
        <ul className="xw-list">
          {party.slice(0, 12).map((character) => (
            <li key={character.name} className="xw-member">
              <Thumb image={character.portraitUrl}>{initial(character.name)}</Thumb>
              <span className="xw-member-text">
                <span className="xw-member-top">
                  <strong>{character.name}</strong>
                  {size === "large" && character.ac ? <Chip icon={<Shield size={11} />} label="AC">{character.ac}</Chip> : null}
                </span>
                <HpBar character={character} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
const modifier = (score: number) => {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : String(mod);
};

export function MyCharacterWidget({ size }: Props) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const me = host.table.characters[host.userId];
  const tile = <Tile image={me?.portraitUrl}>{me ? initial(me.name) : <Shield size={size === "small" ? 13 : 18} />}</Tile>;
  if (!me) {
    return <Shell size={size} tile={tile} title={t("widget.dndMe")} subtitle={host.voiceChannelId ? t("widget.dndMe.empty") : t("widget.dnd.noTable")} />;
  }
  if (size === "small") return <Shell size={size} tile={tile} title={me.name} right={<HpBar character={me} />} />;
  return (
    <Shell size={size} bigTile tile={tile} title={me.name} subtitle={classLine(me, t)}>
      <HpBar character={me} />
      <div className="xw-chips">
        {me.maxHp ? <Chip icon={<Heart size={11} />} label="HP">{me.hp ?? 0}</Chip> : null}
        {me.ac ? <Chip icon={<Shield size={11} />} label="AC">{me.ac}</Chip> : null}
        {me.speed ? <Chip icon={<Footprints size={11} />} label={t("widget.dndMe.speed")}>{me.speed}</Chip> : null}
      </div>
      {size === "large" && me.abilities?.some(Boolean) && (
        <div className="xw-abilities">
          {me.abilities.map((score, index) => (
            <span key={ABILITIES[index]} className="xw-ability">
              <small>{ABILITIES[index]}</small>
              <strong>{modifier(score)}</strong>
              <small>{score}</small>
            </span>
          ))}
        </div>
      )}
    </Shell>
  );
}

export function SlotsWidget({ size }: Props) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const me = host.table.characters[host.userId];
  const levels = (me?.slots ?? [])
    .map((total, index) => ({ level: index, total, used: Math.min(me?.used?.[index] ?? 0, total) }))
    .filter((row) => row.total > 0);
  const left = levels.reduce((sum, row) => sum + row.total - row.used, 0);
  const all = levels.reduce((sum, row) => sum + row.total, 0);
  const tile = <Tile><Sparkles size={size === "small" ? 13 : 18} /></Tile>;
  const idle = host.voiceChannelId ? t("widget.dndSlots.empty") : t("widget.dnd.noTable");
  const line = t("widget.dndSlots.left", { left, all });
  if (size === "small") return <Shell size={size} tile={tile} title={all ? line : t("widget.dndSlots")} subtitle={all ? undefined : idle} />;
  return (
    <Shell size={size} tile={tile} title={t("widget.dndSlots")} subtitle={all ? line : idle}>
      {levels.length > 0 && (
        <ul className="xw-list xw-slot-list">
          {levels.map((row) => (
            <li key={row.level}>
              <small>{row.level + 1}</small>
              <span className="xw-slots" aria-label={`${row.total - row.used}/${row.total}`}>
                {Array.from({ length: row.total }, (_, index) => <span key={index} className={`xw-slot ${index >= row.total - row.used ? "used" : ""}`} />)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

type Kind = "spell" | "monster" | "item" | "condition" | "feat" | "class";
type Answer = { text: string; payload?: DndCardProps };

const LOOKUPS: Record<Kind, { icon: (size: number) => ReactNode; title: "widget.dndSpell" | "widget.dndMonster" | "widget.dndItem" | "widget.dndCondition" | "widget.dndFeat" | "widget.dndClass"; hint: string }> = {
  spell: { icon: (size) => <WandSparkles size={size} />, title: "widget.dndSpell", hint: "Fireball" },
  monster: { icon: (size) => <Skull size={size} />, title: "widget.dndMonster", hint: "Goblin" },
  item: { icon: (size) => <ShieldHalf size={size} />, title: "widget.dndItem", hint: "Longsword" },
  condition: { icon: (size) => <Zap size={size} />, title: "widget.dndCondition", hint: "Grappled" },
  feat: { icon: (size) => <Medal size={size} />, title: "widget.dndFeat", hint: "Alert" },
  class: { icon: (size) => <BookOpen size={size} />, title: "widget.dndClass", hint: "Paladin" },
};

/** One search box into the D&D compendium, showing the same card chat does. */
export function LookupWidget({ kind, size }: Props & { kind: Kind }) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const look = LOOKUPS[kind];
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // /condition is the companion app's tracker, not a lookup.
  const canPost = kind !== "condition";

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    if (size === "small" && canPost) {
      setQuery("");
      void host.runCommand(`/${kind} ${text}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      setAnswer(
        await apiFetch<Answer>("/api/integrations/dnd/lookup", {
          method: "POST",
          body: JSON.stringify({ kind, query: text, channelId: host.activeChannelId }),
        }),
      );
      setAsked(text);
    } catch (failure) {
      setAnswer(null);
      setError(failure instanceof Error ? failure.message : t("widget.failed"));
    } finally {
      setBusy(false);
    }
  };

  const tile = <Tile>{look.icon(size === "small" ? 13 : 18)}</Tile>;
  const box = (
    <form className="mw-queue" onSubmit={(event) => void search(event)}>
      <Search size={13} aria-hidden="true" />
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={look.hint} aria-label={t(look.title)} maxLength={120} />
    </form>
  );
  const result = answer && (
    <div className="xw-card">
      {answer.payload ? <DndCard {...answer.payload} onCommand={(command) => void host.runCommand(command)} /> : <div className="xw-text">{answer.text.replace(/\*\*/g, "")}</div>}
    </div>
  );
  if (size === "small") {
    return (
      <>
        <div className="mw mw-small">{tile}{box}</div>
        {error && <p className="mw-note xw-pad">{error}</p>}
        {result}
      </>
    );
  }
  const share = answer && canPost ? (
    <button type="button" className="mw-btn" title={t("widget.dnd.share")} aria-label={t("widget.dnd.share")} onClick={() => void host.runCommand(`/${kind} ${asked}`)}><Send size={13} /></button>
  ) : null;
  return (
    <Shell size={size} tile={tile} title={t(look.title)} subtitle={busy ? "…" : t("widget.dnd.lookupHint")} right={share} note={error}>
      {box}
      {result}
    </Shell>
  );
}
