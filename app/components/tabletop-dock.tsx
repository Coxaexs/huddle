"use client";

import { useRef, useState } from "react";
import { Box, Coins, Dices, ExternalLink, Map, Music, ScrollText, Swords, UserRound } from "lucide-react";
import { useDismiss } from "../hooks/use-dismiss";
import { apiFetch } from "../lib/client";
import { openDndCompanion } from "../lib/dnd-sso";
import { useI18n } from "../lib/i18n-context";
import { useModuleOn } from "../lib/modules";

export interface TabletopDockProps {
  serverId: string;
  voiceChannelId?: string | null;
  isDm: boolean;
  battlemapOpen?: boolean;
  battlemapEncounter?: "combat" | "exploration";
  onOpenCharacter: () => void;
  onToggleBattlemap: () => void;
  onOpenTabletop: () => void;
  onOpenPartyStash: () => void;
  onRunCommand: (command: string) => void;
}

export function TabletopDock({
  serverId,
  voiceChannelId,
  isDm,
  battlemapOpen,
  battlemapEncounter = "exploration",
  onOpenCharacter,
  onToggleBattlemap,
  onOpenTabletop,
  onOpenPartyStash,
  onRunCommand,
}: TabletopDockProps) {
  const dndOn = useModuleOn("dnd");
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useDismiss(open, () => setOpen(false), wrapRef);

  if (!dndOn) return null;

  const quickDice = [
    { label: "d20", cmd: "/roll 1d20" },
    { label: "2d6", cmd: "/roll 2d6" },
    { label: "d100", cmd: "/roll 1d100" },
    { label: "Adv", cmd: "/roll 1d20 adv" },
    { label: "Dis", cmd: "/roll 1d20 dis" },
    { label: t("dock.blindD20"), cmd: "/blindroll 1d20" },
  ];

  const closeAnd = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="relative inline-flex items-center" ref={wrapRef}>
      <button
        type="button"
        // The header's own icon style; the voice stage's one has a filled background that read as stuck on hover.
        className={`icon-button ${open ? "active" : ""}`}
        aria-label={t("dock.buttonAria")}
        aria-expanded={open}
        title={t("dock.title")}
        onClick={() => setOpen((v) => !v)}
      >
        <Dices size={18} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-[var(--line)] bg-[var(--panel,var(--paper))] text-[var(--ink)] p-3 shadow-2xl z-50 space-y-3 text-xs"
          role="dialog"
          aria-label={t("dock.title")}
        >
          <div className="font-bold text-xs flex items-center gap-1.5">
            <Dices size={14} className="text-[var(--lavender)]" />
            <span>{t("dock.title")}</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--line)] hover:border-[var(--lavender)] text-left"
              onClick={closeAnd(onOpenCharacter)}
            >
              <UserRound size={13} />
              <span className="truncate">{t("dock.myCharacter")}</span>
            </button>
            <button
              type="button"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-left ${
                battlemapOpen ? "border-[var(--lavender)] bg-[var(--lavender)]/15 font-semibold" : "border-[var(--line)] hover:border-[var(--lavender)]"
              }`}
              onClick={closeAnd(onToggleBattlemap)}
            >
              <Map size={13} />
              <span className="truncate">{t("dock.battlemap2d")}</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--line)] hover:border-[var(--lavender)] text-left"
              onClick={closeAnd(onOpenTabletop)}
            >
              <Box size={13} />
              <span className="truncate">{t("dock.table3d")}</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--line)] hover:border-[var(--lavender)] text-left"
              onClick={closeAnd(onOpenPartyStash)}
            >
              <Coins size={13} className="text-amber-400" />
              <span className="truncate">{t("dock.partyStash")}</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--line)] hover:border-[var(--lavender)] text-left"
              onClick={closeAnd(() => void openDndCompanion("/vtt", serverId))}
            >
              <ExternalLink size={13} />
              <span className="truncate">{t("dock.tavernVtt")}</span>
            </button>
            <button
              type="button"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--line)] hover:border-[var(--lavender)] text-left"
              onClick={closeAnd(() => void openDndCompanion("/bard", serverId))}
            >
              <Music size={13} />
              <span className="truncate">{t("dock.bardMusic")}</span>
            </button>
          </div>

          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider opacity-60 font-bold">
              {t("dock.quickDice")}
            </div>
            <div className="flex flex-wrap gap-1">
              {quickDice.map((q) => (
                <button
                  key={q.cmd}
                  type="button"
                  className="px-2 py-1 rounded border border-[var(--line)] hover:border-[var(--lavender)] font-semibold text-[11px]"
                  onClick={closeAnd(() => onRunCommand(q.cmd))}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          {isDm && (
            <div className="space-y-1.5 pt-2 border-t border-[var(--line)]">
              <div className="text-[10px] uppercase tracking-wider opacity-60 font-bold">
                {t("dock.dmTools")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {voiceChannelId && battlemapOpen && (
                  <button
                    type="button"
                    className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--line)] hover:border-[var(--lavender)] text-[11px]"
                    onClick={closeAnd(() => {
                      const next = battlemapEncounter === "combat" ? "exploration" : "combat";
                      void apiFetch("/api/battlemap", {
                        method: "POST",
                        body: JSON.stringify({ channelId: voiceChannelId, action: "encounter", state: next }),
                      }).catch(() => undefined);
                    })}
                  >
                    <Swords size={12} />
                    <span>
                      {battlemapEncounter === "combat" ? t("dock.toggleExplore") : t("dock.toggleCombat")}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  className="flex items-center gap-1 px-2 py-1 rounded border border-[var(--line)] hover:border-[var(--lavender)] text-[11px]"
                  onClick={closeAnd(() => onRunCommand("/recap start"))}
                >
                  <ScrollText size={12} />
                  <span>{t("dock.sessionRecap")}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
