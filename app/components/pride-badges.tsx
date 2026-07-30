import { PRIDE_BADGES, type PrideBadgeId } from "@/lib/users";

export function PrideBadges({
  badges,
  compact = false,
  mini = false,
}: {
  badges?: PrideBadgeId[];
  compact?: boolean;
  mini?: boolean;
}) {
  if (!badges?.length) return null;
  const visibleBadges = mini ? badges.slice(0, 3) : badges;
  return (
    <div
      className={`pride-badges${compact ? " compact" : ""}${mini ? " mini" : ""}`}
      aria-label={`Pride badges: ${badges
        .map((id) => PRIDE_BADGES.find((entry) => entry.id === id)?.label)
        .filter(Boolean)
        .join(", ")}`}
    >
      {visibleBadges.map((id) => {
        const badge = PRIDE_BADGES.find((entry) => entry.id === id);
        if (!badge) return null;
        return (
          <span
            className="pride-badge"
            key={badge.id}
            title={badge.label}
            style={{ "--badge-stripes": badge.colors.join(", ") } as React.CSSProperties}
          >
            <span className="pride-flag-swatch" aria-hidden="true" />
            {!mini && (compact ? badge.shortLabel : badge.label)}
          </span>
        );
      })}
      {mini && badges.length > visibleBadges.length && (
        <span className="pride-badge-more">+{badges.length - visibleBadges.length}</span>
      )}
    </div>
  );
}
