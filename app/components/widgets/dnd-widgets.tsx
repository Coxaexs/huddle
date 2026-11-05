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
    return <div className="bw-dice">{[6, 20].map((sides) => <button key={sides} type="button" className="bw-btn" onClick={() => roll(sides)}>d{sides}</button>)}</div>;
  }
  return (
    <div className="bw">
      <div className="bw-dice">{DICE.map((sides) => <button key={sides} type="button" className="bw-btn" onClick={() => roll(sides)}>d{sides}</button>)}</div>
      <div className="bw-row">
        <button type="button" className="bw-btn" aria-label={t("widget.dndDice.less")} disabled={count <= 1} onClick={() => setCount((n) => Math.max(1, n - 1))}>−</button>
        <span>{count}×</span>
        <button type="button" className="bw-btn" aria-label={t("widget.dndDice.more")} disabled={count >= 20} onClick={() => setCount((n) => Math.min(20, n + 1))}>+</button>
        <button type="button" className={`bw-btn ${mode === "adv" ? "on" : ""}`} aria-pressed={mode === "adv"} onClick={() => setMode((m) => (m === "adv" ? "" : "adv"))}>{t("widget.dndDice.adv")}</button>
        <button type="button" className={`bw-btn ${mode === "dis" ? "on" : ""}`} aria-pressed={mode === "dis"} onClick={() => setMode((m) => (m === "dis" ? "" : "dis"))}>{t("widget.dndDice.dis")}</button>
      </div>
      {size === "large" && (
        <form className="bw-row" onSubmit={rollCustom}>
          <input className="bw-input" value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="2d6+3" aria-label={t("widget.dndDice")} />
          <button type="submit" className="bw-btn" disabled={!custom.trim()}>{t("widget.dndDice.roll")}</button>
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
  if (!rolls.length) return <p className="bw-muted">{t("widget.dndRolls.empty")}</p>;
  return (
    <ul className="bw-list">
      {rolls.slice(0, size === "small" ? 1 : size === "large" ? 12 : 5).map((roll) => (
        <li key={roll.animationSeed}>
          <span className="bw-grow bw-line">{roll.roller.displayName} <span className="bw-muted">{roll.expression}</span></span>
          <strong>{roll.summary || roll.total}</strong>
        </li>
      ))}
    </ul>
  );
}

function NoTable() {
  const { t } = useI18n();
  return <p className="bw-muted">{t("widget.dnd.noTable")}</p>;
}

export function InitiativeWidget({ size }: Props) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const initiative = host.table.initiative;
  if (!host.voiceChannelId) return <NoTable />;
  if (!initiative?.entries.length) return <p className="bw-muted">{t("widget.dndInitiative.empty")}</p>;
  const current = initiative.entries[initiative.turn];
  if (size === "small") return <div className="bw-line">{t("widget.dndInitiative.turn", { name: current?.name ?? "" })}</div>;
  return (
    <div className="bw">
      <span className="bw-head">{t("widget.dndInitiative.round", { round: initiative.round })}</span>
      <ol className="bw-list">
        {initiative.entries.map((entry, index) => (
          <li key={entry.id} className={index === initiative.turn ? "bw-current" : ""}>
            <span className="bw-grow bw-line">{entry.name}</span>
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
      <span className="bw-bar" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, (hp / max) * 100))}%` }} /></span>
      <span className="bw-muted">{hp}/{max}</span>
    </>
  );
}

export function PartyWidget({ size }: Props) {
  const { t } = useI18n();
  const host = useWidgetHost();
  const party = Object.values(host.table.characters);
  if (!host.voiceChannelId) return <NoTable />;
  if (!party.length) return <p className="bw-muted">{t("widget.dndParty.empty")}</p>;
  return (
    <ul className="bw-list">
      {party.slice(0, size === "small" ? 1 : 12).map((character) => (
        <li key={character.name}>
          <span className="bw-grow bw-line">{character.name}</span>
          <HpBar character={character} />
          {size === "large" && character.ac ? <span className="bw-muted">AC {character.ac}</span> : null}
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
  if (!me) return <p className="bw-muted">{t("widget.dndMe.empty")}</p>;
  if (size === "small") return <div className="bw-row"><span className="bw-grow bw-line">{me.name}</span><HpBar character={me} /></div>;
  const line = [me.cls, me.level ? t("widget.dndMe.level", { level: me.level }) : "", me.ac ? `AC ${me.ac}` : "", me.speed ? `${me.speed} ft` : ""].filter(Boolean).join(" · ");
  return (
    <div className="bw">
      <strong>{me.name}</strong>
      {line && <span className="bw-muted">{line}</span>}
      <div className="bw-row"><HpBar character={me} /></div>
      {size === "large" && me.abilities?.some(Boolean) && (
        <div className="bw-dice">
          {me.abilities.map((score, index) => (
            <span key={ABILITIES[index]} className="bw-muted">{ABILITIES[index]} {score}</span>
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
  if (!levels.length) return <p className="bw-muted">{t("widget.dndSlots.empty")}</p>;
  return (
    <ul className="bw-list">
      {levels.slice(0, size === "small" ? 1 : 9).map((row) => (
        <li key={row.level}>
          <span className="bw-muted">{row.level}</span>
          <span className="bw-slots" aria-label={`${row.total - row.used}/${row.total}`}>
            {Array.from({ length: row.total }, (_, index) => <span key={index} className={`bw-slot ${index < row.used ? "used" : ""}`} />)}
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
    <div className="bw">
      <form className="bw-row" onSubmit={(event) => void search(event)}>
        <input className="bw-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("widget.dnd.search")} aria-label={t("widget.dnd.search")} />
        <button type="submit" className="bw-btn" disabled={busy || !query.trim()}>{t("widget.musicSearch.go")}</button>
      </form>
      {error && <p className="bw-muted">{error}</p>}
      {answer && <div className="bw-text">{answer.text}</div>}
    </div>
  );
}
