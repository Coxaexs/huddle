import { useState } from "react";
import { Droplet } from "lucide-react";
import type { DiceRollEvent } from "@/lib/protocol";
import { defaultWillpowerPicks, V5_WILLPOWER_DICE } from "@/lib/v5-dice";
import type { RouseCard as RouseCardData, V5Card as V5CardData } from "@/lib/v5-roll";
import { apiFetch } from "../lib/client";
import { createTranslator } from "@/lib/i18n";
import { currentLocale, tNow } from "../lib/i18n-context";

interface CardContext {
  /** The posted card's message, for a Willpower reroll. */
  messageId?: string;
  /** Who is looking: only the roller may spend their Willpower. */
  viewerId?: string;
  /** The voice room the viewer is in, so the reroll tumbles at the table too. */
  voiceChannelId?: string | null;
  /** "gmv" on the roller's own copy of a secret roll. */
  rollCommand?: string;
  onCommand?: (command: string) => void;
}

/** The badge's look: a messy critical and a bestial failure are what the table watches for. */
function tone(card: V5CardData): string {
  if (card.bestial) return "bestial";
  if (card.messy) return "messy";
  if (card.critical && card.win !== false) return "crit";
  if (card.totalFailure || card.win === false) return "fail";
  return card.win ? "win" : "plain";
}

/** A Vampire V5 roll: successes, the verdict, the dice (Hunger in red), and Willpower. */
export function V5RollCard({ messageId, viewerId, voiceChannelId, rollCommand = "v", onCommand, ...card }: V5CardData & CardContext) {
  const [spent, setSpent] = useState<V5CardData | null>(null);
  // The socket brings the rewritten card to everyone; until then, the reply does.
  const shown = spent && !card.willpower ? { ...card, ...spent } : card;
  const canSpend = Boolean(messageId && viewerId && viewerId === shown.rollerId && shown.verified && !shown.willpower && shown.normal.length);
  const [picks, setPicks] = useState<number[]>(() => defaultWillpowerPicks(card.normal));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rerolled = new Set(shown.willpower?.picks ?? []);
  const kind = tone(shown);

  const toggle = (index: number) =>
    setPicks((current) =>
      current.includes(index)
        ? current.filter((i) => i !== index)
        : current.length < V5_WILLPOWER_DICE
          ? [...current, index].sort((a, b) => a - b)
          : current,
    );

  const spend = async () => {
    if (!picks.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<{ roll?: DiceRollEvent; payload?: V5CardData; error?: string }>(
        "/api/integrations/dnd/willpower",
        { method: "POST", body: JSON.stringify({ messageId, picks, channelId: voiceChannelId || undefined }) },
      );
      if (data.error || !data.payload) throw new Error(data.error || tNow("v5.rerollFailed"));
      setSpent(data.payload);
      if (data.roll) window.dispatchEvent(new CustomEvent("huddle-dice-roll", { detail: data.roll }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : tNow("v5.rerollFailed"));
    } finally {
      setBusy(false);
    }
  };

  const again = [
    `/${rollCommand} ${shown.pool}`,
    shown.hungerDice.length ? `h${shown.hungerDice.length}` : "",
    shown.difficulty !== undefined ? `d${shown.difficulty}` : "",
    shown.label ?? "",
  ].filter(Boolean).join(" ");

  return (
    <section className={`dnd-card dnd-roll-card v5-card is-${kind}`}>
      <div className="dnd-roll-total-box">
        <Droplet size={18} aria-hidden="true" />
        <strong className="dnd-roll-total">{shown.successes}</strong>
        <small className="v5-total-label">{shown.successes === 1 ? tNow("v5.successSingle") : tNow("v5.successPlural")}</small>
      </div>
      <div className="dnd-roll-body">
        <span className="dnd-card-kicker">
          {shown.label || tNow("v5.rollFallback")}
          {shown.roller ? ` · ${shown.roller}` : ""}
        </span>
        <span className="dnd-roll-expression">
          {shown.pool} {shown.pool === 1 ? tNow("v5.dieSingle") : tNow("v5.diePlural")}
          {shown.hungerDice.length ? tNow("v5.hungerCount", { count: shown.hungerDice.length }) : ""}
          {shown.difficulty !== undefined ? tNow("v5.difficulty", { val: shown.difficulty }) : ""}
        </span>
        <span className={`dnd-roll-badge v5-badge-${kind}`}>{shown.outcome}</span>
        {shown.bestialRisk && (
          <span className="v5-note">{tNow("v5.bestialRisk")}</span>
        )}
        <div className="dnd-roll-dice" role="group" aria-label={canSpend ? tNow("v5.pickDiceAria") : tNow("v5.diceAria")}>
          {shown.normal.map((value, index) => {
            const className = [
              "dnd-die v5-die",
              value >= 6 ? "success" : "miss",
              value === 10 ? "ten" : "",
              rerolled.has(index) ? "rerolled" : "",
              canSpend && picks.includes(index) ? "picked" : "",
            ].join(" ");
            const was = shown.willpower?.picks.indexOf(index) ?? -1;
            const title = was >= 0 ? tNow("v5.rerolledWas", { val: shown.willpower!.before[was] }) : value >= 6 ? tNow("v5.successCap") : tNow("v5.noSuccess");
            return canSpend ? (
              <button
                type="button"
                key={`n-${index}`}
                className={className}
                aria-pressed={picks.includes(index)}
                title={picks.includes(index) ? tNow("v5.clickToKeep", { title }) : tNow("v5.clickToReroll", { title })}
                onClick={() => toggle(index)}
              >
                {value}
              </button>
            ) : (
              <span key={`n-${index}`} className={className} title={title}>
                {value}
              </span>
            );
          })}
          {shown.hungerDice.map((value, index) => (
            <span
              key={`h-${index}`}
              className={["dnd-die v5-die hunger", value >= 6 ? "success" : "miss", value === 10 ? "ten" : "", value === 1 ? "one" : ""].join(" ")}
              title={`${tNow("v5.hungerDie")}${value === 10 ? tNow("v5.hungerTen") : value === 1 ? tNow("v5.hungerOne") : ""}`}
            >
              {value}
            </span>
          ))}
        </div>
        {canSpend && (
          <div className="v5-willpower">
            <button type="button" className="dnd-roll-again" disabled={!picks.length || busy} onClick={() => void spend()} title={tNow("v5.willpowerDmgTitle")}>
              {busy ? tNow("v5.rerolling") : picks.length ? tNow("v5.willpowerReroll", { count: picks.length, unit: picks.length === 1 ? tNow("v5.dieSingle") : tNow("v5.diePlural") }) : tNow("v5.willpowerPick")}
            </button>
            <small>{tNow("v5.pickUpTo", { max: V5_WILLPOWER_DICE })}</small>
          </div>
        )}
        {shown.willpower && <span className="v5-note">{tNow("v5.willpowerSpent", { count: shown.willpower.picks.length })}</span>}
        {error && <span className="v5-note v5-error" role="alert">{error}</span>}
      </div>
      {onCommand && (
        <button type="button" className="dnd-roll-again" title={createTranslator(currentLocale())("dndExtra.rollPoolTitle")} onClick={() => onCommand(again)}>
          {createTranslator(currentLocale())("dndExtra.rollAgain")}
        </button>
      )}
    </section>
  );
}

/** A Rouse check: did the Hunger rise? */
export function RouseCheckCard({ onCommand, ...card }: RouseCardData & CardContext) {
  const kind = card.success ? "win" : card.atMax ? "bestial" : "fail";
  const again = [
    "/rouse",
    card.dice.length > 1 ? String(card.dice.length) : "",
    card.hungerAfter !== undefined ? `h${card.hungerAfter}` : "",
    card.label ?? "",
  ].filter(Boolean).join(" ");
  return (
    <section className={`dnd-card dnd-roll-card v5-card is-${kind}`}>
      <div className="dnd-roll-total-box">
        <Droplet size={18} aria-hidden="true" />
        <strong className="dnd-roll-total">{card.best}</strong>
        <small className="v5-total-label">{tNow("v5.rouseLabel")}</small>
      </div>
      <div className="dnd-roll-body">
        <span className="dnd-card-kicker">
          {card.label || tNow("v5.rouseCheck")}
          {card.roller ? ` · ${card.roller}` : ""}
        </span>
        <span className={`dnd-roll-badge v5-badge-${kind}`}>{card.outcome}</span>
        <div className="dnd-roll-dice">
          {card.dice.map((value, index) => (
            <span
              key={index}
              className={["dnd-die v5-die hunger", value >= 6 ? "success" : "miss", index === card.dice.indexOf(card.best) ? "" : "dropped"].join(" ")}
            >
              {value}
            </span>
          ))}
        </div>
      </div>
      {onCommand && (
        <button type="button" className="dnd-roll-again" title={card.hungerAfter !== undefined ? tNow("v5.rouseAgainAt", { hunger: card.hungerAfter }) : tNow("v5.rouseAgain")} onClick={() => onCommand(again)}>
          {tNow("v5.rouseAgain")}
        </button>
      )}
    </section>
  );
}
