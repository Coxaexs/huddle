import { useState } from "react";
import { Droplet } from "lucide-react";
import type { DiceRollEvent } from "@/lib/protocol";
import { defaultWillpowerPicks, V5_WILLPOWER_DICE } from "@/lib/v5-dice";
import type { RouseCard as RouseCardData, V5Card as V5CardData } from "@/lib/v5-roll";
import { apiFetch } from "../lib/client";

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
      if (data.error || !data.payload) throw new Error(data.error || "The reroll failed.");
      setSpent(data.payload);
      if (data.roll) window.dispatchEvent(new CustomEvent("huddle-dice-roll", { detail: data.roll }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The reroll failed.");
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
        <small className="v5-total-label">{shown.successes === 1 ? "success" : "successes"}</small>
      </div>
      <div className="dnd-roll-body">
        <span className="dnd-card-kicker">
          {shown.label || "V5 roll"}
          {shown.roller ? ` · ${shown.roller}` : ""}
        </span>
        <span className="dnd-roll-expression">
          {shown.pool} {shown.pool === 1 ? "die" : "dice"}
          {shown.hungerDice.length ? ` · ${shown.hungerDice.length} Hunger` : ""}
          {shown.difficulty !== undefined ? ` · Difficulty ${shown.difficulty}` : ""}
        </span>
        <span className={`dnd-roll-badge v5-badge-${kind}`}>{shown.outcome}</span>
        {shown.bestialRisk && (
          <span className="v5-note">A Hunger die shows 1: bestial if this fails.</span>
        )}
        <div className="dnd-roll-dice" role="group" aria-label={canSpend ? "Pick up to three dice to reroll with Willpower" : "Dice"}>
          {shown.normal.map((value, index) => {
            const className = [
              "dnd-die v5-die",
              value >= 6 ? "success" : "miss",
              value === 10 ? "ten" : "",
              rerolled.has(index) ? "rerolled" : "",
              canSpend && picks.includes(index) ? "picked" : "",
            ].join(" ");
            const was = shown.willpower?.picks.indexOf(index) ?? -1;
            const title = was >= 0 ? `Rerolled with Willpower (was ${shown.willpower!.before[was]})` : value >= 6 ? "Success" : "No success";
            return canSpend ? (
              <button
                type="button"
                key={`n-${index}`}
                className={className}
                aria-pressed={picks.includes(index)}
                title={`${title}. Click to ${picks.includes(index) ? "keep" : "reroll"} it.`}
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
              title={`Hunger die${value === 10 ? ": a 10 here makes a critical messy" : value === 1 ? ": a 1 here makes a failure bestial" : ""}`}
            >
              {value}
            </span>
          ))}
        </div>
        {canSpend && (
          <div className="v5-willpower">
            <button type="button" className="dnd-roll-again" disabled={!picks.length || busy} onClick={() => void spend()} title="Take 1 Superficial Willpower damage">
              {busy ? "Rerolling…" : picks.length ? `Willpower: reroll ${picks.length} ${picks.length === 1 ? "die" : "dice"}` : "Willpower: pick dice"}
            </button>
            <small>Pick up to {V5_WILLPOWER_DICE}; Hunger dice stay.</small>
          </div>
        )}
        {shown.willpower && <span className="v5-note">Willpower spent: {shown.willpower.picks.length} rerolled.</span>}
        {error && <span className="v5-note v5-error" role="alert">{error}</span>}
      </div>
      {onCommand && (
        <button type="button" className="dnd-roll-again" title="Roll the same pool yourself" onClick={() => onCommand(again)}>
          Roll again
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
        <small className="v5-total-label">rouse</small>
      </div>
      <div className="dnd-roll-body">
        <span className="dnd-card-kicker">
          {card.label || "Rouse check"}
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
        <button type="button" className="dnd-roll-again" title={card.hungerAfter !== undefined ? `Rouse again at Hunger ${card.hungerAfter}` : "Rouse again"} onClick={() => onCommand(again)}>
          Rouse again
        </button>
      )}
    </section>
  );
}
