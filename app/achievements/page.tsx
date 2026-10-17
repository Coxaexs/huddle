"use client";

import { AchievementsBoard } from "../components/achievements-panel";
import { AchievementCenter } from "../components/achievement-center";

/** Standalone board (old links and bookmarks); the app opens it as a modal. */
export default function AchievementsPage() {
  return (
    <div className="ach-page">
      <AchievementsBoard />
      <AchievementCenter userId={null} />
    </div>
  );
}
