"use client";

import { useEffect, useState } from "react";
import { Award, CheckCircle2, Clock, Users, MessageSquare, Mic, Calendar, X } from "lucide-react";
import { apiFetch, basePath } from "../lib/client";

const ICONS: Record<string, typeof Award> = {
  Award,
  MessageSquare,
  Mic,
  Users,
  Calendar,
  CheckCircle2,
  Clock,
};

export default function AchievementsPage() {
  const [user, setUser] = useState<{ id: string; displayName: string } | null>(null);
  const [achievements, setAchievements] = useState<Array<{
    id: string;
    label: string;
    description: string;
    icon: string;
    earned: boolean;
    earnedAt: string | null;
    current: number;
    threshold: number;
    progress: number;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await apiFetch<{ user: { id: string; display_name: string } | null }>(
          `${basePath}/api/auth/session`,
        );
        if (!session.user) {
          setError("Sign in to see your achievements.");
          setLoading(false);
          return;
        }
        setUser({ id: session.user.id, displayName: session.user.display_name });
        const data = await apiFetch<{ achievements: Array<{
          id: string;
          label: string;
          description: string;
          icon: string;
          earned: boolean;
          earnedAt: string | null;
          current: number;
          threshold: number;
          progress: number;
        }> }>(`${basePath}/api/achievements`);
        if (!cancelled) setAchievements(data.achievements || []);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load achievements.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const earnedCount = achievements.filter((a) => a.earned).length;

  if (loading) {
    return (
      <div className="portal-page" style={{ padding: "40px 20px" }}>
        <h1>Achievements</h1>
        <p className="admin-muted">Loading…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="portal-page" style={{ padding: "40px 20px" }}>
        <h1>Achievements</h1>
        <p className="admin-error">{error}</p>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="portal-page" style={{ padding: "40px 20px" }}>
        <h1>Achievements</h1>
        <p className="admin-error">{error}</p>
      </div>
    );
  }

  const Icon = (name: string) => ICONS[name] || Award;

  return (
    <div className="portal-page" style={{ padding: "24px 20px 40px", maxWidth: "700px", margin: "0 auto" }}>
      <div className="flex items-center justify-between gap-2 mb-4">
        <div>
          <h1 className="text-lg font-semibold">Achievements</h1>
          <p className="text-xs opacity-70">
            Badges you unlock by using Hoffle: messages sent, time in voice,
            servers joined, and more. Earned badges show on your profile.
          </p>
        </div>
        <span className="px-2 py-1 rounded text-[11px] font-bold border border-line bg-paper text-ink">
          {earnedCount} / {achievements.length}
        </span>
      </div>

      {achievements.map((a) => {
        const Icon = ICONS[a.icon];
        return (
          <div
            key={a.id}
            className={`p-3 rounded-lg border border-line ${
              a.earned
                ? "bg-black/25"
                : "bg-black/10 hover:bg-black/20 transition-colors"
            } flex items-center gap-3`}
          >
            <div className={`p-2 rounded-lg flex items-center justify-center ${
              a.earned ? "bg-mint/20 border border-mint/40 text-mint" : "bg-paper/50 border border-line/50 text-muted"
            }`}>
              <Icon size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className={`font-semibold ${a.earned ? "text-ink" : "text-muted"}`}>
                  {a.label}
                </span>
                {a.earned && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold border border-mint/40 bg-mint/20 text-mint">
                    Earned
                  </span>
                )}
              </div>
              <p className="text-xs text-muted leading-relaxed">{a.description}</p>
              {!a.earned && (
                <div className="mt-2">
                  <div className="admin-meter mb-1">
                    <span
                      style={{ width: `${Math.round(a.progress * 100)}%` }}
                      className={a.progress >= 1 ? "bg-mint" : "bg-lavender"}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] opacity-70">
                    <span>{a.current} / {a.threshold}</span>
                    <span>
                      {Math.round(a.progress * 100)}%
                    </span>
                  </div>
                </div>
              )}
              {a.earned && a.earnedAt && (
                <div className="mt-1 text-[10px] opacity-60 italic">
                  Earned {new Date(a.earnedAt).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
