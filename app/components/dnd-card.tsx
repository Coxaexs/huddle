import { useState, type ReactNode } from "react";
import { BookOpen, Dices, Search, Sparkles, Swords } from "lucide-react";

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
  /** Runs a slash command as the viewer: click-to-roll and suggestions. */
  onCommand?: (command: string) => void;
}

const KIND_ICON: Record<string, ReactNode> = {
  spell: <Sparkles size={20} />,
  monster: <Swords size={20} />,
  suggest: <Search size={20} />,
};

/** Past this many characters the full entry folds behind a button. */
const FOLD_AT = 1100;

export function DndCard(props: DndCardProps) {
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
}: DndCardProps) {
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
          <span className="dnd-card-kicker">{type || "Compendium"}</span>
          <strong>{name}</strong>
          {subtitle && <small>{subtitle}</small>}
        </div>
        {image && (
          <img className="dnd-card-portrait" src={image} alt="" loading="lazy" />
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
        <div className="dnd-abilities" role="table" aria-label="Ability scores">
          {abilities.map((ability) => (
            <button
              type="button"
              key={ability.label}
              role="cell"
              title={`Roll a ${ability.label} check (d20${ability.mod})`}
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
            ? "Show less"
            : hiddenTitles.length
              ? `Show ${hiddenTitles.join(", ").toLowerCase()}`
              : "Show the full entry"}
        </button>
      )}

      {(source || otherVersions.length > 0) && (
        <footer className="dnd-card-foot">
          {source && (
            <span>
              {source}
              {page ? `, p. ${page}` : ""}
            </span>
          )}
          {otherVersions.length > 0 && (
            <span>Also in {otherVersions.join(", ")}</span>
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
          <span className="dnd-card-kicker">Compendium</span>
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

function RollCard({
  total,
  expression,
  details = [],
  dice = [],
  modifier = 0,
  label,
  mode,
  roller,
  onCommand,
}: DndCardProps) {
  // A d20 whose kept face is 20 or 1 is what the table cares about.
  const keptD20 = dice
    .filter((die) => die.sides === 20)
    .flatMap((die) => die.rolls.filter((roll) => roll.kept).map((roll) => roll.value));
  const nat20 = keptD20.includes(20);
  const nat1 = !nat20 && keptD20.includes(1);

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
          {label || "Dice roll"}
          {roller ? ` · ${roller}` : ""}
        </span>
        <span className="dnd-roll-expression">
          {expression}
          {mode ? ` · ${mode}` : ""}
        </span>
        {(nat20 || nat1) && (
          <span className="dnd-roll-badge">{nat20 ? "Natural 20" : "Natural 1"}</span>
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
                  title={`d${die.sides}${roll.kept ? "" : " (dropped)"}`}
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
      </div>
      {onCommand && expression && (
        <button
          type="button"
          className="dnd-roll-again"
          title="Roll the same thing yourself"
          onClick={() => onCommand(`/roll ${rollCommandFor(expression, mode)}${label ? ` ${label}` : ""}`)}
        >
          Roll again
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
            title={`Roll d20${bonus} to hit`}
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
            title={`Roll ${expr}`}
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
