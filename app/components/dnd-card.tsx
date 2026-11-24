import { proxiedImage } from "@/app/lib/image-proxy";
import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, Dices, EyeOff, Pin, Plus, Search, Sparkles, Swords } from "lucide-react";
import { onSecretRoll, recallSecretRoll } from "@/lib/secret-roll";
import type { RouseCard, V5Card } from "@/lib/v5-roll";
import { tokenImageUrl } from "@/lib/battlemap-tokens";
import { apiFetch } from "../lib/client";
import { useOptionalWidgetHost } from "./widgets/widget-host";
import { RouseCheckCard, V5RollCard } from "./v5-card";
import { createTranslator, type MessageKey } from "@/lib/i18n";
import { currentLocale } from "../lib/i18n-context";

export interface DndRollDie {
  sides: number;
  sign?: 1 | -1;
  rolls: Array<{ value: number; kept: boolean }>;
}

export interface DndCardProps {
  type?: string;
  name?: string;
  subtitle?: string;
  /** Older cards stored one paragraph here; new ones use `sections`. */
  description?: string;
  facts?: Array<{ label: string; value: string }>;
  source?: string;
  page?: number;
  otherVersions?: string[];
  tags?: string[];
  abilities?: Array<{ label: string; score: number; mod: string }>;
  sections?: Array<{ title: string; body: string }>;
  image?: string;
  /** "Did you mean" cards. */
  lookupKind?: string;
  suggestions?: string[];
  /** Roll cards. */
  total?: number;
  expression?: string;
  details?: string[];
  dice?: DndRollDie[];
  modifier?: number;
  label?: string;
  mode?: string;
  roller?: string;
  /** /gmroll: the card everyone gets holds no result, only the roll's seed. */
  secret?: boolean;
  /** /blindroll: true blind roll, hidden even from non-DM roller; pushed to server DMs. */
  blind?: boolean;
  rollSeed?: string;
  /** "gmroll" for a secret card's Roll again. */
  rollCommand?: string;
  /** Set only by the server that rolled; a posted lookalike never has it. */
  verified?: boolean;
  /** Runs a slash command as the viewer: click-to-roll and suggestions. */
  onCommand?: (command: string) => void;
  onPinToTable?: (card: { title: string; subtitle: string; facts: Array<{ label: string; value: string }>; body: string }) => void;
  onSpawnMonster?: (monster: { name: string; hp: number; size?: number; portraitUrl?: string }) => void;
  onAddToInitiative?: (entry: { name: string; value: number }) => void;
  /** The message the card is in, and who is reading it: a V5 roller may spend Willpower on it. */
  messageId?: string;
  viewerId?: string;
  voiceChannelId?: string | null;
}

const KIND_ICON: Record<string, ReactNode> = {
  spell: <Sparkles size={20} />,
  monster: <Swords size={20} />,
  suggest: <Search size={20} />,
};

/** Past this many characters the full entry folds behind a button. */
const FOLD_AT = 1100;

const context = ({ messageId, viewerId, voiceChannelId, rollCommand, onCommand }: DndCardProps) => ({
  messageId,
  viewerId,
  voiceChannelId,
  rollCommand,
  onCommand,
});

/** Card chrome in the app's language; the 5e entries themselves stay English. */
const tx = (key: MessageKey, vars?: Record<string, string | number>) => createTranslator(currentLocale())(key, vars);

export function DndCard(props: DndCardProps) {
  if (props.type === "v5") return <V5RollCard {...(props as unknown as V5Card)} {...context(props)} />;
  if (props.type === "rouse") return <RouseCheckCard {...(props as unknown as RouseCard)} {...context(props)} />;
  if (props.type === "roll" && props.secret) return <SecretRollCard {...props} />;
  if (props.type === "roll") return <RollCard {...props} />;
  if (props.type === "suggest") return <SuggestCard {...props} />;
  return <EntryCard {...props} />;
}

function EntryCard({
  type,
  name,
  subtitle,
  description,
  facts = [],
  source,
  page,
  otherVersions = [],
  tags = [],
  abilities = [],
  sections = [],
  image,
  onCommand,
  onPinToTable,
  onSpawnMonster,
  onAddToInitiative,
}: DndCardProps) {
  const host = useOptionalWidgetHost();
  const pinFn = onPinToTable ?? (host?.voiceChannelId ? host.table.pinCard : undefined);
  const spawnFn = onSpawnMonster ?? (host?.voiceChannelId ? host.table.spawnMonster : undefined);
  const initFn = onAddToInitiative ?? (host?.voiceChannelId ? host.table.addToInitiative : undefined);
  const [expanded, setExpanded] = useState(false);
  const all = sections.length
    ? sections
    : description
      ? [{ title: "", body: description }]
      : [];
  const totalLength = all.reduce((sum, section) => sum + section.body.length, 0);
  const foldable = totalLength > FOLD_AT;
  // Folded: keep whole sections (never cut mid-sentence): the first one, plus
  // a monster's Actions, which is what the table needs in a fight. The rest
  // (legendary actions, reactions, lore) is one click away.
  const keep = (section: { title: string }, index: number) =>
    index === 0 || section.title === "Actions";
  const visible = foldable && !expanded ? all.filter(keep) : all;
  const hiddenTitles = foldable && !expanded
    ? all.filter((section, index) => !keep(section, index)).map((section) => section.title).filter(Boolean)
    : [];
  const showFold = foldable && (expanded || visible.length < all.length);

  return (
    <section className={`dnd-card dnd-kind-${type || "entry"}`}>
      <header className="dnd-card-head">
        <span className="dnd-card-rune" aria-hidden="true">
          {KIND_ICON[type || ""] || <BookOpen size={20} />}
        </span>
        <div className="dnd-card-title">
          <span className="dnd-card-kicker">{type || tx("dndCard.compendium")}</span>
          <strong>{name}</strong>
          {subtitle && <small>{subtitle}</small>}
        </div>
        {image && (
          <img className="dnd-card-portrait" src={proxiedImage(image)} alt="" loading="lazy" />
        )}
      </header>

      {tags.length > 0 && (
        <div className="dnd-tags">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      )}

      {abilities.length > 0 && (
        <div className="dnd-abilities" role="table" aria-label={tx("dndCard.abilityScoresAria")}>
          {abilities.map((ability) => (
            <button
              type="button"
              key={ability.label}
              role="cell"
              title={tx("dndCard.rollAbilityTitle", { label: ability.label, mod: ability.mod })}
              onClick={() => onCommand?.(`/roll d20${ability.mod} ${name} ${ability.label} check`)}
              disabled={!onCommand}
            >
              <span>{ability.label}</span>
              <strong>{ability.score}</strong>
              <em>{ability.mod}</em>
            </button>
          ))}
        </div>
      )}

      {facts.length > 0 && (
        <dl className="dnd-facts">
          {facts.map((fact) => (
            <div key={fact.label} className={fact.value.length > 42 ? "wide" : undefined}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {visible.map((section, index) => (
        <div className="dnd-section" key={`${section.title}-${index}`}>
          {section.title && <h4>{section.title}</h4>}
          <RichText text={section.body} rollContext={name} onCommand={onCommand} />
        </div>
      ))}

      {showFold && (
        <button
          type="button"
          className="dnd-fold"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? tx("dndExtra.showLess")
            : hiddenTitles.length
              ? tx("dndCard.showTitles", { titles: hiddenTitles.join(", ").toLowerCase() })
              : tx("dndExtra.showFull")}
        </button>
      )}

      {(pinFn || (type === "monster" && (spawnFn || initFn))) && name && (
        <div className="dnd-card-actions" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {pinFn && (
            <button
              type="button"
              className="dnd-fold"
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              onClick={() =>
                pinFn({
                  title: name,
                  subtitle: subtitle ?? "",
                  facts: facts.slice(0, 6),
                  body: (all.find((s) => !s.title) ?? all[0])?.body?.slice(0, 900) ?? "",
                })
              }
            >
              <Pin size={12} /> {tx("dndCard.pinToTable")}
            </button>
          )}
          {type === "monster" && spawnFn && (
            <button
              type="button"
              className="dnd-fold"
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              onClick={() => {
                const hpFact = facts.find((f) => /hp|hit points/i.test(f.label))?.value ?? "";
                const hp = Number(/(\d+)/.exec(hpFact)?.[1] || 15);
                const sub = (subtitle ?? "").toLowerCase();
                const size = sub.includes("gargantuan") || sub.includes("huge") ? 3 : sub.includes("large") ? 2 : 1;
                spawnFn({ name, hp, size, portraitUrl: image || tokenImageUrl(name) });
              }}
            >
              <Plus size={12} /> {tx("dndCard.spawnOnTable")}
            </button>
          )}
          {type === "monster" && initFn && (
            <button
              type="button"
              className="dnd-fold"
              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              onClick={() => {
                const dexMod = abilities.find((a) => /^dex/i.test(a.label))?.mod ?? "+0";
                const mod = Number.parseInt(dexMod.replace(/[^\d-]/g, ""), 10) || 0;
                const val = Math.floor(Math.random() * 20) + 1 + mod;
                initFn({ name, value: val });
              }}
            >
              <Swords size={12} /> {tx("dndCard.addInitiative")}
            </button>
          )}
        </div>
      )}

      {(source || otherVersions.length > 0) && (
        <footer className="dnd-card-foot">
          {source && (
            <span>
              {source}
              {page ? tx("dndCard.page", { page }) : ""}
            </span>
          )}
          {otherVersions.length > 0 && (
            <span>{tx("dndCard.alsoIn", { sources: otherVersions.join(", ") })}</span>
          )}
        </footer>
      )}
    </section>
  );
}

function SuggestCard({ name, subtitle, lookupKind, suggestions = [], onCommand }: DndCardProps) {
  return (
    <section className="dnd-card dnd-kind-suggest">
      <header className="dnd-card-head">
        <span className="dnd-card-rune" aria-hidden="true">
          <Search size={20} />
        </span>
        <div className="dnd-card-title">
          <span className="dnd-card-kicker">{tx("dndCard.compendium")}</span>
          <strong>{name}</strong>
          {subtitle && <small>{subtitle}</small>}
        </div>
      </header>
      {suggestions.length > 0 && (
        <div className="dnd-suggestions">
          {suggestions.map((suggestion) => (
            <button
              type="button"
              key={suggestion}
              disabled={!onCommand}
              onClick={() => onCommand?.(`/${lookupKind || "spell"} ${suggestion}`)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * A /gmroll. The roller's browser was sent the real card and kept it (see
 * lib/secret-roll.ts); everyone else only ever has this face-down one.
 */
function SecretRollCard({ rollSeed, label, roller, blind, onCommand }: DndCardProps) {
  const host = useOptionalWidgetHost();
  const isDm = Boolean(host?.isDm || host?.battlemap?.gm);
  const [mine, setMine] = useState<DndCardProps | null>(() => recallSecretRoll(rollSeed) as DndCardProps | null);
  const [revealing, setRevealing] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // The card can arrive over the socket before the roller's own reply does.
  useEffect(() => {
    if (mine || !rollSeed) return;
    return onSecretRoll(rollSeed, (card) => setMine(card as DndCardProps));
  }, [mine, rollSeed]);

  // For blind rolls viewed from channel history, authorized DMs fetch the card from the server.
  useEffect(() => {
    if (!blind || mine || !rollSeed || !isDm) return;
    let cancelled = false;
    apiFetch<{ card?: DndCardProps }>(
      `/api/integrations/dnd/blind-roll?seed=${encodeURIComponent(rollSeed)}`,
    )
      .then((res) => {
        if (!cancelled && res.card) setMine(res.card);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [blind, mine, rollSeed, isDm]);

  async function revealToTable() {
    if (!rollSeed || revealing || revealed) return;
    setRevealing(true);
    try {
      await apiFetch("/api/integrations/dnd/blind-roll", {
        method: "POST",
        body: JSON.stringify({ action: "reveal", seed: rollSeed }),
      });
      setRevealed(true);
    } finally {
      setRevealing(false);
    }
  }

  // A /gmv: the roller's own V5 card. Willpower is for open rolls (this one isn't in the channel).
  if (mine?.type === "v5") {
    return (
      <V5RollCard
        {...(mine as unknown as V5Card)}
        roller={blind ? tx("dndCard.blindBadge") : tx("dndCard.onlyYou")}
        label={label}
        rollCommand={blind ? "blindroll" : "gmv"}
        onCommand={onCommand}
      />
    );
  }
  if (mine) {
    return (
      <div className={blind ? "dnd-blind-wrap" : undefined}>
        <RollCard
          {...mine}
          label={label}
          roller={blind ? tx("dndCard.blindBadge") : tx("dndCard.onlyYou")}
          rollCommand={blind ? "blindroll" : "gmroll"}
          onCommand={onCommand}
        />
        {blind && isDm && rollSeed && (
          <div className="dnd-dmg-bar">
            <span className="dnd-roll-badge">{tx("dndCard.blindBadge")}</span>
            <button
              type="button"
              disabled={revealing || revealed}
              onClick={() => void revealToTable()}
            >
              {revealed ? tx("dndCard.revealed") : tx("dndCard.revealToTable")}
            </button>
          </div>
        )}
      </div>
    );
  }
  return (
    <section className="dnd-card dnd-roll-card is-secret">
      <div className="dnd-roll-total-box">
        <EyeOff size={18} aria-hidden="true" />
        <strong className="dnd-roll-total">?</strong>
      </div>
      <div className="dnd-roll-body">
        <span className="dnd-card-kicker">
          {label || tx("dndExtra.secretRoll")}
          {roller ? ` · ${roller}` : ""}
        </span>
        <span className="dnd-roll-expression">
          {blind ? tx("dndCard.blindWaiting") : tx("dndCard.behindScreen")}
        </span>
      </div>
    </section>
  );
}

function RollCard({
  total,
  expression,
  details = [],
  dice = [],
  modifier = 0,
  label,
  mode,
  roller,
  verified,
  rollCommand = "roll",
  onCommand,
}: DndCardProps) {
  const host = useOptionalWidgetHost();
  const bm = host?.battlemap;
  const targets = bm?.gm ? bm.tokens : [];
  const defaultTarget =
    (bm?.selectedTokenId && targets.some((t) => t.id === bm.selectedTokenId)
      ? bm.selectedTokenId
      : targets.find((t) => !t.ownerId)?.id || targets[0]?.id) || "";
  const [targetId, setTargetId] = useState("");
  const [dmgFeedback, setDmgFeedback] = useState<string | null>(null);
  const [applyingDmg, setApplyingDmg] = useState(false);
  const resolvedTargetId =
    targetId && targets.some((t) => t.id === targetId) ? targetId : defaultTarget;

  // A d20 whose kept face is 20 or 1 is what the table cares about.
  const keptD20 = dice
    .filter((die) => die.sides === 20)
    .flatMap((die) => die.rolls.filter((roll) => roll.kept).map((roll) => roll.value));
  const nat20 = keptD20.includes(20);
  const nat1 = !nat20 && keptD20.includes(1);
  const amt = typeof total === "number" ? Math.max(0, Math.round(total)) : 0;

  async function applyDelta(delta: number) {
    if (!bm || !resolvedTargetId || applyingDmg) return;
    setApplyingDmg(true);
    try {
      const res = await bm.applyDamage(resolvedTargetId, delta);
      if (res) {
        setDmgFeedback(
          res.concentrationCheck
            ? `${res.token.label}: ${res.token.hp ?? 0} HP · ${tx("dndCard.concPromptInline", { dc: res.concentrationCheck.dc })}`
            : tx("dndCard.dmgApplied", { name: res.token.label, hp: res.token.hp ?? 0 }),
        );
      }
    } finally {
      setApplyingDmg(false);
    }
  }

  return (
    <section
      className={`dnd-card dnd-roll-card${nat20 ? " is-crit" : ""}${nat1 ? " is-fumble" : ""}`}
    >
      <div className="dnd-roll-total-box">
        <Dices size={18} aria-hidden="true" />
        <strong className="dnd-roll-total">{total}</strong>
      </div>
      <div className="dnd-roll-body">
        <span className="dnd-card-kicker">
          {label || tx("dndExtra.diceRoll")}
          {roller ? ` · ${roller}` : ""}
        </span>
        <span className="dnd-roll-expression">
          {expression}
          {mode ? ` · ${mode}` : ""}
        </span>
        {(nat20 || nat1) && (
          <span className="dnd-roll-badge">{nat20 ? tx("dndCard.nat20") : tx("dndCard.nat1")}</span>
        )}
        {dice.length > 0 ? (
          <div className="dnd-roll-dice">
            {dice.map((die, dieIndex) =>
              die.rolls.map((roll, rollIndex) => (
                <span
                  key={`${dieIndex}-${rollIndex}`}
                  className={[
                    "dnd-die",
                    roll.kept ? "" : "dropped",
                    die.sides === 20 && roll.kept && roll.value === 20 ? "max" : "",
                    die.sides === 20 && roll.kept && roll.value === 1 ? "min" : "",
                  ].join(" ")}
                  title={`d${die.sides}${roll.kept ? "" : tx("dndCard.droppedSuffix")}`}
                >
                  {die.sign === -1 ? "−" : ""}
                  {roll.value}
                  <small>d{die.sides}</small>
                </span>
              )),
            )}
            {modifier !== 0 && (
              <span className="dnd-die modifier">
                {modifier > 0 ? `+${modifier}` : `−${Math.abs(modifier)}`}
              </span>
            )}
          </div>
        ) : (
          <div className="dnd-roll-details">
            {details.map((detail, index) => (
              <code key={`${detail}-${index}`}>{detail}</code>
            ))}
          </div>
        )}
        {bm?.gm && targets.length > 0 && amt > 0 && (
          <div className="dnd-dmg-bar">
            <select
              value={resolvedTargetId}
              aria-label={tx("dndCard.applyDmgTarget")}
              onChange={(e) => setTargetId(e.target.value)}
            >
              {targets.map((tok) => (
                <option key={tok.id} value={tok.id}>
                  {tok.label}{typeof tok.hp === "number" ? ` (${tok.hp} HP)` : ""}
                </option>
              ))}
            </select>
            <button type="button" disabled={applyingDmg} onClick={() => void applyDelta(-amt)}>
              {tx("dndCard.dmgFull", { amount: amt })}
            </button>
            <button
              type="button"
              disabled={applyingDmg}
              onClick={() => void applyDelta(-Math.max(1, Math.floor(amt / 2)))}
            >
              {tx("dndCard.dmgHalf", { amount: Math.max(1, Math.floor(amt / 2)) })}
            </button>
            <button type="button" disabled={applyingDmg} onClick={() => void applyDelta(-(amt * 2))}>
              {tx("dndCard.dmgDouble", { amount: amt * 2 })}
            </button>
            <button type="button" className="is-heal" disabled={applyingDmg} onClick={() => void applyDelta(amt)}>
              {tx("dndCard.heal", { amount: amt })}
            </button>
            {dmgFeedback && <span className="dnd-dmg-note">{dmgFeedback}</span>}
          </div>
        )}
      </div>
      {onCommand && expression && (
        <button
          type="button"
          className="dnd-roll-again"
          title={tx("dndExtra.rollAgainTitle")}
          onClick={() => onCommand(`/${rollCommand} ${rollCommandFor(expression, mode)}${label ? ` ${label}` : ""}`)}
        >
          {tx("dndExtra.rollAgain")}
        </button>
      )}
    </section>
  );
}

function rollCommandFor(expression: string, mode?: string): string {
  const extra = mode?.includes("advantage")
    ? mode.includes("dis")
      ? " dis"
      : " adv"
    : mode?.includes("critical")
      ? " crit"
      : "";
  return `${expression}${extra}`;
}

/**
 * The companion's light Markdown: **bold**, *italic*, "• " bullets and
 * "a | b" table rows. Dice and "+N to hit" become buttons that roll them,
 * labelled with the action they sit in ("Scimitar", "Fire Breath").
 */
function RichText({
  text,
  rollContext,
  onCommand,
}: {
  text: string;
  rollContext?: string;
  onCommand?: (command: string) => void;
}) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let table: string[][] = [];

  const flushTable = () => {
    if (!table.length) return;
    const [head, ...rows] = table;
    blocks.push(
      <div className="dnd-table-wrap" key={`t-${blocks.length}`}>
        <table className="dnd-table">
          <thead>
            <tr>{head.map((cell, i) => <th key={i}>{inline(cell, undefined, undefined)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>{row.map((cell, i) => <td key={i}>{inline(cell, undefined, undefined)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
    table = [];
  };

  lines.forEach((line, index) => {
    if (line.includes(" | ")) {
      table.push(line.split(" | "));
      return;
    }
    flushTable();
    if (!line.trim()) return;
    // The bolded lead ("**Scimitar.**") names the rolls on this line.
    const lead = line.match(/^\s*(?:•\s*)?\*\*([^*]+?)\.?\*\*/)?.[1];
    const label = [rollContext, lead].filter(Boolean).join(" ").slice(0, 60);
    const bullet = /^\s*•\s/.test(line);
    blocks.push(
      <p key={index} className={bullet ? "dnd-bullet" : undefined}>
        {inline(bullet ? line.replace(/^\s*•\s/, "") : line, label, onCommand)}
      </p>,
    );
  });
  flushTable();

  return <div className="dnd-rich">{blocks}</div>;
}

const INLINE_RE =
  /(\*\*[^*]+\*\*|\*[^*]+\*|[+-]\d+ to hit|\b\d+d\d+(?:\s*[+−-]\s*\d+)?\b|\bDC \d+\b)/g;

function inline(
  text: string,
  label: string | undefined,
  onCommand: ((command: string) => void) | undefined,
): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE_RE)) {
    const token = match[0];
    const at = match.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    last = at + token.length;
    const key = `${at}-${token}`;

    if (token.startsWith("**")) {
      out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      out.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("DC ")) {
      out.push(<b key={key} className="dnd-dc">{token}</b>);
    } else if (/to hit$/.test(token)) {
      const bonus = token.split(" ")[0];
      out.push(
        onCommand ? (
          <button
            key={key}
            type="button"
            className="dnd-roll-chip"
            title={tx("dndCard.rollToHitTitle", { bonus })}
            onClick={() => onCommand(`/roll d20${bonus} ${label ? `${label} attack` : "attack"}`)}
          >
            {token}
          </button>
        ) : (
          token
        ),
      );
    } else {
      const expr = token.replace(/\s+/g, "").replace("−", "-");
      out.push(
        onCommand ? (
          <button
            key={key}
            type="button"
            className="dnd-roll-chip"
            title={tx("dndCard.rollExprTitle", { expr })}
            onClick={() => onCommand(`/roll ${expr} ${label ? `${label} damage` : ""}`.trim())}
          >
            {token}
          </button>
        ) : (
          token
        ),
      );
    }
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
