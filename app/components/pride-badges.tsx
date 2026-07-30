import { PRIDE_BADGES, type PrideBadgeId } from "@/lib/users";

export function PrideBadges({
  badges,
  compact = false,
}: {
  badges?: PrideBadgeId[];
  compact?: boolean;
}) {
  if (!badges?.length) return null;
  return (
    <div className={`pride-badges${compact ? " compact" : ""}`} aria-label="Pride badges">
      {badges.map((id) => {
        const badge = PRIDE_BADGES.find((entry) => entry.id === id);
        if (!badge) return null;
        return (
          <span
            className="pride-badge"
            key={badge.id}
            title={badge.label}
            style={{ "--badge-stripes": badge.colors.join(", ") } as React.CSSProperties}
          >
            <i aria-hidden="true" />
            {compact ? badge.shortLabel : badge.label}
          </span>
        );
      })}
    </div>
  );
}
