"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "@/app/lib/client";
import { useI18n } from "@/app/lib/i18n-context";
import type { WidgetSize } from "@/lib/layout-prefs";
import type { TableCharacter } from "@/lib/lounge-shared";
import type { DiceRollEvent } from "@/lib/protocol";
import { useWidgetHost } from "./widget-host";

type Props = { size: WidgetSize };

const DICE = [4, 6, 8, 10, 12, 20, 100];

/** Rolls through /roll, so the real 3D dice and the chat result both happen. */
export function DiceWidget({ size }: Props) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const [count, setCount] = useState(1);
  const [mode, setMode] = useState<"" | "adv" | "dis">("");
  const [custom, setCustom] = useState("");
  const roll = (sides: number) => void host.runCommand(`/roll ${count}d${sides}${sides === 20 && mode ? ` ${mode}` : ""}`);
  const rollCustom = (event: FormEvent) => {
    event.preventDefault();
    const text = custom.trim();
    if (!text) return;
    setCustom("");
    void host.runCommand(`/roll ${text}`);
  };
  if (size === "small") {
    return <div className="xw-dice xw-pad">{[6, 20].map((sides) => <button key={sides} type="button" className="xw-btn" onClick={() => roll(sides)}>d{sides}</button>)}</div>;
  }
  return (
    <div className="xw">
      <div className="xw-dice">{DICE.map((sides) => <button key={sides} type="button" className="xw-btn" onClick={() => roll(sides)}>d{sides}</button>)}</div>
      <div className="xw-row">
        <button type="button" className="xw-btn" aria-label={t("widget.dndDice.less")} disabled={count <= 1} onClick={() => setCount((n) => Math.max(1, n - 1))}>−</button>
        <span>{count}×</span>
        <button type="button" className="xw-btn" aria-label={t("widget.dndDice.more")} disabled={count >= 20} onClick={() => setCount((n) => Math.min(20, n + 1))}>+</button>
        <button type="button" className={`xw-btn ${mode === "adv" ? "on" : ""}`} aria-pressed={mode === "adv"} onClick={() => setMode((m) => (m === "adv" ? "" : "adv"))}>{t("widget.dndDice.adv")}</button>
        <button type="button" className={`xw-btn ${mode === "dis" ? "on" : ""}`} aria-pressed={mode === "dis"} onClick={() => setMode((m) => (m === "dis" ? "" : "dis"))}>{t("widget.dndDice.dis")}</button>
      </div>
      {size === "large" && (
        <form className="xw-row" onSubmit={rollCustom}>
          <input className="xw-input" value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="2d6+3" aria-label={t("widget.dndDice")} />
          <button type="submit" className="xw-btn" disabled={!custom.trim()}>{t("widget.dndDice.roll")}</button>
        </form>
      )}
    </div>
  );
}

/** The rolls seen since this tab opened, newest first. */
export function RollsWidget({ size }: Props) {
  const { t } = useI18n();
  const [rolls, setRolls] = useState<DiceRollEvent[]>([]);
  useEffect(() => {
    const onRoll = (event: Event) => setRolls((list) => [(event as CustomEvent<DiceRollEvent>).detail, ...list].slice(0, 20));
    window.addEventListener("huddle-dice-roll", onRoll);
    return () => window.removeEventListener("huddle-dice-roll", onRoll);
  }, []);
  if (!rolls.length) return <p className="xw-muted xw-pad">{t("widget.dndRolls.empty")}</p>;
  return (
    <ul className="xw-list xw-pad">
      {rolls.slice(0, size === "small" ? 1 : size === "large" ? 12 : 5).map((roll) => (
        <li key={roll.animationSeed}>
          <span className="xw-grow xw-line">{roll.roller.displayName} <span className="xw-muted">{roll.expression}</span></span>
          <strong>{roll.summary || roll.total}</strong>
        </li>
      ))}
    </ul>
  );
}

function NoTable() {
  const { t } = useI18n();
  return <p className="xw-muted xw-pad">{t("widget.dnd.noTable")}</p>;
}

export function InitiativeWidget({ size }: Props) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const initiative = host.table.initiative;
  if (!host.voiceChannelId) return <NoTable />;
  if (!initiative?.entries.length) return <p className="xw-muted xw-pad">{t("widget.dndInitiative.empty")}</p>;
  const current = initiative.entries[initiative.turn];
  if (size === "small") return <div className="xw-line xw-pad">{t("widget.dndInitiative.turn", { name: current?.name ?? "" })}</div>;
  return (
    <div className="xw">
      <span className="xw-head">{t("widget.dndInitiative.round", { round: initiative.round })}</span>
      <ol className="xw-list">
        {initiative.entries.map((entry, index) => (
          <li key={entry.id} className={index === initiative.turn ? "xw-current" : ""}>
            <span className="xw-grow xw-line">{entry.name}</span>
            <span>{entry.value}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function HpBar({ character }: { character: TableCharacter }) {
  const hp = character.hp ?? 0;
  const max = character.maxHp ?? 0;
  if (!max) return null;
  return (
    <>
      <span className="xw-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, (hp / max) * 100))}%` }} /></span>
      <span className="xw-muted">{hp}/{max}</span>
    </>
  );
}

export function PartyWidget({ size }: Props) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const party = Object.values(host.table.characters);
  if (!host.voiceChannelId) return <NoTable />;
  if (!party.length) return <p className="xw-muted xw-pad">{t("widget.dndParty.empty")}</p>;
  return (
    <ul className="xw-list xw-pad">
      {party.slice(0, size === "small" ? 1 : 12).map((character) => (
        <li key={character.name}>
          <span className="xw-grow xw-line">{character.name}</span>
          <HpBar character={character} />
          {size === "large" && character.ac ? <span className="xw-muted">AC {character.ac}</span> : null}
        </li>
      ))}
    </ul>
  );
}

const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

export function MyCharacterWidget({ size }: Props) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const me = host.table.characters[host.userId];
  if (!host.voiceChannelId) return <NoTable />;
  if (!me) return <p className="xw-muted xw-pad">{t("widget.dndMe.empty")}</p>;
  if (size === "small") return <div className="xw-row xw-pad"><span className="xw-grow xw-line">{me.name}</span><HpBar character={me} /></div>;
  const line = [me.cls, me.level ? t("widget.dndMe.level", { level: me.level }) : "", me.ac ? `AC ${me.ac}` : "", me.speed ? `${me.speed} ft` : ""].filter(Boolean).join(" · ");
  return (
    <div className="xw">
      <strong>{me.name}</strong>
      {line && <span className="xw-muted">{line}</span>}
      <div className="xw-row"><HpBar character={me} /></div>
      {size === "large" && me.abilities?.some(Boolean) && (
        <div className="xw-dice">
          {me.abilities.map((score, index) => (
            <span key={ABILITIES[index]} className="xw-muted">{ABILITIES[index]} {score}</span>
          ))}
        </div>
      )}
    </div>
  );
}

export function SlotsWidget({ size }: Props) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const me = host.table.characters[host.userId];
  if (!host.voiceChannelId) return <NoTable />;
  const slots = me?.slots ?? [];
  const levels = slots.map((total, index) => ({ level: index + 1, total, used: me?.used?.[index] ?? 0 })).filter((row) => row.total > 0);
  if (!levels.length) return <p className="xw-muted xw-pad">{t("widget.dndSlots.empty")}</p>;
  return (
    <ul className="xw-list xw-pad">
      {levels.slice(0, size === "small" ? 1 : 9).map((row) => (
        <li key={row.level}>
          <span className="xw-muted">{row.level}</span>
          <span className="xw-slots" aria-label={`${row.total - row.used}/${row.total}`}>
            {Array.from({ length: row.total }, (_, index) => <span key={index} className={`xw-slot ${index < row.used ? "used" : ""}`} />)}
          </span>
        </li>
      ))}
    </ul>
  );
}

type Answer = { text: string; link?: string };

/** One search box into the D&D compendium, for one kind of thing. */
export function LookupWidget({ kind, size }: Props & { kind: "spell" | "monster" | "item" | "condition" | "feat" | "class" }) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    // In one line there is no room for the answer, so it goes to the chat as a
    // card. /condition is the companion app's tracker, so that one stays here.
    if (size === "small" && kind !== "condition") {
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
    } catch (failure) {
      setAnswer(null);
      setError(failure instanceof Error ? failure.message : t("widget.failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="xw">
      <form className="xw-row" onSubmit={(event) => void search(event)}>
        <input className="xw-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("widget.dnd.search")} aria-label={t("widget.dnd.search")} />
        <button type="submit" className="xw-btn" disabled={busy || !query.trim()}>{t("widget.musicSearch.go")}</button>
      </form>
      {error && <p className="xw-muted xw-pad">{error}</p>}
      {answer && <div className="xw-text">{answer.text.replace(/\*\*/g, "")}</div>}
    </div>
  );
}
