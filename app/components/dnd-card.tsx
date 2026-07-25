interface DndCardProps {
  type?: string;
  name?: string;
  subtitle?: string;
  description?: string;
  facts?: Array<{ label: string; value: string }>;
  total?: number;
  expression?: string;
  details?: string[];
}

export function DndCard({
  type,
  name,
  subtitle,
  description,
  facts = [],
  total,
  expression,
  details = [],
}: DndCardProps) {
  if (type === "roll") {
    return (
      <section className="dnd-card dnd-roll-card">
        <div className="dnd-card-rune" aria-hidden="true">d20</div>
        <div>
          <span className="dnd-card-kicker">Dice result</span>
          <strong className="dnd-roll-total">{total}</strong>
          <span className="dnd-roll-expression">{expression}</span>
          <div className="dnd-roll-details">
            {details.map((detail, index) => (
              <code key={`${detail}-${index}`}>{detail}</code>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="dnd-card">
      <header>
        <span className="dnd-card-rune" aria-hidden="true">⚔</span>
        <div>
          <span className="dnd-card-kicker">{type || "Compendium"}</span>
          <strong>{name}</strong>
          {subtitle && <small>{subtitle}</small>}
        </div>
      </header>
      {facts.length > 0 && (
        <dl className="dnd-facts">
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {description && <p className="dnd-description">{description}</p>}
    </section>
  );
}
