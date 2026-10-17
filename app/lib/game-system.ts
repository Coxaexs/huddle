"use client";

import { useEffect, useState } from "react";
import type { GameSystem } from "@/lib/v5-sheet";
import { apiFetch } from "./client";

/** Fired on window when this tab saves a server's game system: `{ serverId, system }`. */
export const GAME_SYSTEM_EVENT = "huddle-game-system";

/**
 * The game a server's tabletop plays (Server Settings → Integrations), D&D 5e
 * until it says otherwise. Read again whenever `refresh` changes (walking up
 * to the table), and at once when this tab changes it.
 */
export function useGameSystem(serverId: string | null | undefined, refresh?: unknown): GameSystem {
  const [system, setSystem] = useState<GameSystem>("dnd5e");
  useEffect(() => {
    if (!serverId) { setSystem("dnd5e"); return; }
    let live = true;
    apiFetch<{ system?: GameSystem }>(`/api/integrations/dnd/settings?serverId=${encodeURIComponent(serverId)}&only=system`)
      .then((data) => { if (live) setSystem(data.system === "vtm5" ? "vtm5" : "dnd5e"); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [serverId, refresh]);
  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ serverId: string; system: GameSystem }>).detail;
      if (detail?.serverId === serverId) setSystem(detail.system === "vtm5" ? "vtm5" : "dnd5e");
    };
    window.addEventListener(GAME_SYSTEM_EVENT, changed);
    return () => window.removeEventListener(GAME_SYSTEM_EVENT, changed);
  }, [serverId]);
  return system;
}
